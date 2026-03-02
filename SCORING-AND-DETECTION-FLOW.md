# Plagiarism Detection: Full Scoring & Detection Flow

This document explains how the system stores code, fetches it, runs multiple detection methods, and computes the final plagiarism score—including all minor details (vector DB, thresholds, counts, weights, and penalties).

---

## 1. Vector database (Pinecone)

### 1.1 Configuration

| Item | Value / Source |
|------|----------------|
| **Provider** | Pinecone (cloud vector DB) |
| **Index name** | `process.env.PINECONE_INDEX_NAME` or `'plagiarism-detector'` |
| **Embedding dimensions** | **1536** (OpenAI `text-embedding-3-small`) |
| **API key** | `process.env.PINECONE_API_KEY` |

The backend uses a single Pinecone index. All submissions and chunks are stored there; there is no separate SQL/Postgres for embeddings.

### 1.2 What is stored (on Submit)

On **POST /api/submit**, for each submission the backend:

1. Generates one **whole-code embedding** (1536-dim vector).
2. Extracts **code chunks** (functions/blocks) and generates one embedding per chunk.
3. **Upserts** into Pinecone:

| Stored item | Vector ID format | Metadata stored |
|-------------|------------------|-----------------|
| **Whole submission** | `sub_${submissionId}` | `type: 'submission'`, `submissionId`, `studentId`, `questionId`, `code` (first 1000 chars), `codeLength`, `timestamp` |
| **Each chunk** | `sub_${submissionId}_chunk_${idx}` | `type: 'chunk'`, `submissionId`, `studentId`, `questionId`, `chunkIndex`, `chunkText` (first 1000 chars), `timestamp` |

- **Submission ID** is: `${studentId}_${questionId}_${Date.now()}` (e.g. `alice_q1_1739123456789`).
- **questionId** and **studentId** are trimmed before use; they are stored as provided (after trim).
- **Code in metadata** is truncated to **1000 characters** (Pinecone metadata limit). Full code is only in the submission vector’s `code` field; chunk metadata has `chunkText` (also 1000 chars).

So for one submission you get **1 vector** (type `submission`) **+ N vectors** (type `chunk`), all with the same `questionId` for filtering.

### 1.3 Embedding generation (what gets embedded)

- **Model**: OpenAI `text-embedding-3-small` (1536 dimensions).
- **Whole code**  
  - If **normalization is ON**: embed `${language}:\n${normalizedCode}` (normalized via `codeNormalizer.normalizeCode`).  
  - If **OFF**: embed `${language}:\n${code}`.
- **Chunks**  
  - If **normalization is ON**: each chunk is embedded as `${language}:\n${normalizedChunk}`.  
  - If **OFF**: `${language}:\n${chunk.text}`.

Normalization reduces impact of variable names so that “same logic, different names” still scores high.

### 1.4 Fetching from the vector DB

Three kinds of operations:

| Operation | Purpose | How it’s done |
|-----------|--------|----------------|
| **getSubmissionsByQuestion(questionId)** | List all submissions for a question (e.g. before check, or for external API) | Query with a **probe vector** (1536-dim, all zeros except `[0]=0.001`), `topK: 1000`, filter `type === 'submission'` and `questionId === normalizedQuestionId`. Returns all matches (no similarity threshold). No calibration applied; used only for presence and to pass code to external API. |
| **findSimilarSubmissions(embedding, questionId, limit, minSimilarity)** | Find whole submissions similar to the query code | Query with the **query code’s embedding**, `topK: 100`, filter `type === 'submission'` and `questionId`. Keeps matches with `score >= minSimilarity`, takes first `limit`, then **calibrates** raw score (see below). |
| **findSimilarChunks(embedding, questionId, limit, minSimilarity)** | Find chunks similar to a query chunk | Same idea with filter `type === 'chunk'` and `questionId`. `topK: 100`, filter by `minSimilarity`, take first `limit`, then **calibrate**. |

**Calibration (Pinecone raw score → similarity):**

- OpenAI embeddings often give **cosine similarity ~0.70–0.80** even for unrelated code.
- Raw scores are remapped: `[BASELINE, 1.0] → [0, 1]` with `BASELINE = 0.70`:
  - `calibrated = max(0, (raw - 0.70) / 0.30)`.
- So: raw 0.70 → 0%, raw 0.85 → 50%, raw 0.95 → 83%, raw 1.0 → 100%.
- **Calibration is applied** in `findSimilarSubmissions` and `findSimilarChunks` before returning. It is **not** applied in `getSubmissionsByQuestion` (that query is only for listing by question).

---

## 2. Check similarity flow (POST /api/check)

When the user runs “Check Similarity”, the backend does the following in order.

### 2.1 Inputs (from request body)

- **code** – code to check (required).
- **questionId** – trimmed; required. All comparisons are limited to this question.
- **language** – e.g. `javascript`, `python` (default `javascript`).
- **similarityThreshold** – default **0.75** (75%); used for “plagiarism detected” and for display.
- **maxResults** – default **5**; how many similar submissions to return in the response.
- **useNormalization** – default **true** (same as for submit).

### 2.2 Step 1: Ensure submissions exist

- Call **vectorDb.getSubmissionsByQuestion(normalizedQuestionId)**.
- If result is **empty**:
  - Wait **2.5 seconds** (Pinecone eventual consistency).
  - Call **getSubmissionsByQuestion** again.
- If still empty → respond **404** “No submissions found for question …”.
- Otherwise continue with **all** returned submissions (no limit here). This list is used for the external API and for knowing “how many submissions exist” for the question.

### 2.3 Step 2: Query embedding for the submitted code

- Generate **one 1536-dim embedding** for the check request’s code (same way as on submit: normalized or not, with language prefix).
- This vector is used for whole-submission similarity and is **not** stored.

### 2.4 Step 3: Find similar whole submissions (vector search)

- **vectorDb.findSimilarSubmissions(**  
  `codeEmbedding`,  
  `normalizedQuestionId`,  
  **limit: 50**,  
  **minSimilarity: min(0.3, similarityThreshold)**  
**)**  
- So we ask Pinecone for up to **100** matches (`topK` inside), filter by raw score ≥ threshold, then take the first **50** and **calibrate**.
- These **50** (or fewer) are the “similar submissions” used later for summary, external API input (see below), and for picking the “top” submission for structural penalty and display. The response then **slices to `maxResults`** (default 5) for the payload.

### 2.5 Step 4: Chunk-level similarity

- **Extract chunks** from the user’s code: **chunking.extractCodeChunks(code, language)**.
  - JavaScript: function-based extraction.
  - Python/Java/C/C++: language-specific function/method extraction; fallback to one “whole” chunk if none found.
  - Other languages: single chunk (whole code).
- For **each** query chunk, generate an embedding (batch) and call:
  - **vectorDb.findSimilarChunks(**  
    `chunk.embedding`,  
    `normalizedQuestionId`,  
    **10** per chunk,  
    **minSimilarity: same as step 3** (min(0.3, similarityThreshold))  
  **)**.
- All chunk matches are merged, sorted by similarity descending, and **up to 10** are included in the response (`similarChunks.slice(0, 10)`).

So: **submission-level** we keep up to 50 candidates (then show top `maxResults`); **chunk-level** we keep up to 10 in the API response.

### 2.6 Step 5: External plagiarism API (all submissions for this question)

- The backend sends **all** submissions for the question (from **getSubmissionsByQuestion**) to the **external API**, not only the top 50 similar ones:
  - **submissionsForExternal = existingSubmissions.map(...)** (all of them).
- Request payload:
  - **main_student**: `{ id: "current_check", code: <user's code> }`.
  - **other_students**: array of `{ id: studentId, code: code }` for every submission of that question.
  - **language**: resolved (e.g. python, javascript).
  - **tools**: `["copydetect", "difflib", "treesitter_<lang>"]`.
- External API URL: `process.env.EXTERNAL_PLAGIAGARISM_API_URL` or `https://pd-uaj3.onrender.com/api/detect`.
- The external API returns **per-tool** similarity scores (e.g. copydetect, difflib, treesitter_python). Those are used in the scoring engine as “external” inputs.

### 2.7 Step 6: Final decision and score (scoring engine)

- **Local result** passed to scoring:
  - **hasMatches**: whether `similarSubmissions.length > 0`.
  - **maxSimilarity**: if any, the **calibrated** similarity of the top submission (first of the 50).
  - **matchCount**, **submissions**: the similar submissions list.
- **External result**: formatted response from the external API (each tool’s results with similarity values).
- **Structural data**: `currentCode` (user’s code), `comparedCode` (top similar submission’s code, or empty), `language` — used for **structural penalty** only.

Then **externalPlagiarism.determineFinalDecision(...)** calls **scoringEngine.generatePlagiarismReport(...)** which does the rest (weights, structural penalty, classification).

---

## 3. Scoring engine (how the final score is computed)

### 3.1 Inputs to the scoring engine

- **localResult**: `hasMatches`, `maxSimilarity`, etc. (from vector search).
- **externalResult**: formatted external API result (comparisons per tool: copydetect, difflib, treesitter_*).
- **threshold**: same as request (default 0.75).
- **options**: `currentCode`, `comparedCode`, `language` for structural penalty.

### 3.2 Per-method scores (0–1)

| Method | Source of score | Notes |
|--------|-----------------|--------|
| **Semantic embeddings** | `localResult.maxSimilarity` (calibrated similarity of top similar submission) | Clamped to [0, 1]. If embeddings ran but found no matches, score = 0. |
| **Copydetect** | Max of `externalResult.comparisons[tool===copydetect].results[].similarity` | From external API. |
| **Treesitter** | Max of `externalResult.comparisons[tool starts with 'treesitter'].results[].similarity` | One per language, e.g. treesitter_python. |
| **Difflib** | Max of `externalResult.comparisons[tool===difflib].results[].similarity` | From external API. |

If a tool is missing or has no results, that method is “unavailable” and gets **weight 0** in the sum.

### 3.3 Weights (fixed)

| Method | Weight | Contribution formula |
|--------|--------|----------------------|
| Semantic embeddings | **25%** (0.25) | score × 0.25 |
| Copydetect | **50%** (0.50) | score × 0.50 |
| Tree-Sitter AST | **25%** (0.25) | score × 0.25 |
| Difflib | **0%** (0) | Excluded from final score; still shown in breakdown. |

So: **overall weighted score** = (semantic × 0.25 + copydetect × 0.50 + treesitter × 0.25) / (sum of weights of **available** methods).  
Example: if all three are available, denominator = 1.0. If only semantic and copydetect are available, denominator = 0.75.

### 3.4 Structural penalty (after weighted sum)

- If **currentCode**, **comparedCode**, and **language** are provided, the engine calls **codeNormalizer.calculateStructuralPenalty(currentCode, comparedCode, language)**.
- It compares **function (or top-level) count** between the two pieces of code:
  - **funcDiff** = |count1 − count2|.
  - **penaltyFactor**:
    - funcDiff ≥ 3 → **0.3** (70% penalty).
    - funcDiff === 2 → **0.5** (50% penalty).
    - funcDiff === 1 → **0.75** (25% penalty).
    - funcDiff === 0 → **1.0** (no penalty).
- **Overall score** is then: `overallScore = weightedSum / totalWeight * penaltyFactor`, then clamped to [0, 1].

So same logic in different structure (e.g. 3 functions vs 1 big function) gets down-weighted.

### 3.5 Confidence (from final score and method count)

- **very_high**: score ≥ 0.90 and methodCount ≥ 3.
- **high**: (score ≥ 0.85 and methodCount ≥ 2) or score ≥ 0.75.
- **medium**: score ≥ 0.65.
- **low**: score ≥ 0.50.
- **very_low**: else.

### 3.6 Plagiarism type classification (explanation)

The engine classifies the result (e.g. exact_copy, variable_rename, structural_similarity, template_code, different_implementation, logic_transformation, moderate_similarity) from the **breakdown** scores and **structuralPenalty**, and attaches an **explanation** string (e.g. “Same structure and logic, different variable names”). That drives the “Score Breakdown” and explanation text in the UI.

### 3.7 Final report

- **plagiarismDetected**: overallScore ≥ threshold.
- **overallScore**, **overallPercentage**, **scoreBreakdown** (per-method score, weight, contribution), **structuralPenalty**, **explanation**, **confidence**, etc., all come from the scoring engine and are returned in **final_decision** and related fields.

---

## 4. Summary table (key numbers)

| What | Value |
|------|--------|
| Vector dimensions | 1536 |
| Pinecone index | One index; submission + chunk vectors |
| Code stored per vector (metadata) | First 1000 chars |
| getSubmissionsByQuestion | topK 1000, filter by questionId; no calibration |
| findSimilarSubmissions | topK 100, limit **50**, minSimilarity **min(0.3, threshold)**; calibrated |
| findSimilarChunks (per query chunk) | topK 100, limit **10**, same minSimilarity; calibrated |
| Submissions sent to external API | **All** for that question (from getSubmissionsByQuestion) |
| Similar submissions in response | Top **maxResults** (default **5**) |
| Similar chunks in response | Top **10** |
| Retry when no submissions | Once after **2.5 s** |
| Semantic weight | 25% |
| Copydetect weight | 50% |
| Treesitter weight | 25% |
| Difflib weight | 0% (excluded from score) |
| Structural penalty | By funcDiff: 0→1.0, 1→0.75, 2→0.5, ≥3→0.3 |
| Default plagiarism threshold | 0.75 (75%) |
| Cosine calibration baseline | 0.70 (raw 0.70 → 0%) |

---

## 5. End-to-end flow (short)

1. **Submit**: Embed whole code + chunks (normalized or not) → upsert to Pinecone with `questionId` and `studentId`.
2. **Check**:  
   - Load all submissions for question (with 2.5 s retry if empty).  
   - Embed query code → find up to 50 similar submissions (calibrated) and up to 10 similar chunks.  
   - Send **all** submissions for that question to external API (copydetect, difflib, treesitter).  
   - Scoring engine: 25% semantic + 50% copydetect + 25% treesitter (0% difflib), then structural penalty by function-count difference.  
   - Return final score, breakdown, classification, and top 5 submissions + top 10 chunks.

This is the full flow from vector DB storage and fetch to the final score and all minor details.
