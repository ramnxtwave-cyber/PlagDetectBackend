# Local Plagiarism Detection - Complete Explanation

## 🎯 Overview

Local plagiarism detection uses **semantic similarity** through vector embeddings to find code that has similar meaning, even if the syntax is different.

---

## 🔄 Complete Flow

### **Phase 1: Submission (Storing Code)**

When a student submits code via `/api/submit`:

```
Student submits code
      ↓
1. Generate whole-code embedding (1536-dim vector)
      ↓
2. Extract code chunks (functions/blocks)
      ↓
3. Generate embeddings for each chunk
      ↓
4. Store everything in Pinecone vector database
      ↓
Done - ready for future comparisons
```

### **Phase 2: Checking (Finding Similar Code)**

When checking code for plagiarism via `/api/check`:

```
New code to check
      ↓
1. Generate embedding for the code
      ↓
2. Search Pinecone for similar whole-code submissions
      ↓
3. Extract chunks from new code
      ↓
4. Search Pinecone for similar chunks
      ↓
5. Calculate similarity scores and return results
```

---

## 📊 Detailed Step-by-Step Process

### **SUBMISSION PHASE: `/api/submit`**

#### **Step 1: Generate Whole-Code Embedding**

```javascript
// Convert entire code to vector
const wholeCodeEmbedding = await embeddings.generateCodeEmbedding(
  code,
  language,
  customApiKey
);
// Result: [0.123, -0.456, 0.789, ...] (1536 numbers)
```

**What happens:**
1. Code is normalized (whitespace cleaned)
2. Sent to OpenAI's `text-embedding-3-small` model
3. Returns a 1536-dimensional vector
4. This vector captures the **semantic meaning** of the code

**Example:**
```javascript
// Original code
function add(a, b) {
  return a + b;
}

// Becomes vector (simplified):
// [0.12, -0.45, 0.78, 0.23, ...]
// These numbers represent the "meaning" of the code
```

#### **Step 2: Extract Code Chunks**

```javascript
// Split code into functions/blocks
const codeChunks = chunking.extractCodeChunks(code, language);
// Result: [
//   { index: 0, text: "function add(a,b) {...}", type: "function", name: "add" },
//   { index: 1, text: "function multiply(x,y) {...}", type: "function", name: "multiply" }
// ]
```

**How chunking works:**

**For JavaScript:**
- Detects function declarations: `function foo() {}`
- Detects arrow functions: `const foo = () => {}`
- Detects class methods: `methodName() {}`
- Uses brace counting to find function boundaries

**For Python:**
- Detects function definitions: `def foo():`
- Detects class definitions: `class Foo:`
- Uses indentation to find boundaries

**Why chunk?**
- Enables **fine-grained detection**
- Can find if student copied just one function
- More precise than whole-code comparison

#### **Step 3: Generate Chunk Embeddings**

```javascript
// Convert each chunk to vector
const chunksWithEmbeddings = await embeddings.generateChunkEmbeddings(
  codeChunks,
  language,
  customApiKey
);
// Result: [
//   { index: 0, text: "function add...", embedding: [0.11, -0.44, ...] },
//   { index: 1, text: "function multiply...", embedding: [0.22, -0.55, ...] }
// ]
```

Each function/chunk gets its own embedding vector.

#### **Step 4: Store in Pinecone**

```javascript
await vectorDb.saveSubmission({
  submissionId: "student1_Q123_1234567890",
  studentId: "student1",
  questionId: "Q123",
  code: "full code here",
  embedding: wholeCodeEmbedding,  // whole-code vector
  chunks: chunksWithEmbeddings,    // array of chunk vectors
  language: "javascript"
});
```

**What gets stored in Pinecone:**

1. **Whole-code vector:**
```json
{
  "id": "student1_Q123_1234567890_whole",
  "values": [0.123, -0.456, ...],  // 1536 numbers
  "metadata": {
    "type": "submission",
    "submissionId": "student1_Q123_1234567890",
    "studentId": "student1",
    "questionId": "Q123",
    "code": "function add(a,b) {...}",
    "language": "javascript"
  }
}
```

2. **Chunk vectors (one per function):**
```json
{
  "id": "student1_Q123_1234567890_chunk_0",
  "values": [0.11, -0.44, ...],  // 1536 numbers
  "metadata": {
    "type": "chunk",
    "submissionId": "student1_Q123_1234567890",
    "studentId": "student1",
    "questionId": "Q123",
    "chunkIndex": 0,
    "chunkText": "function add(a,b) { return a+b; }",
    "language": "javascript"
  }
}
```

---

### **CHECKING PHASE: `/api/check`**

When a new code is checked for plagiarism:

#### **Step 1: Generate Embedding for Query Code**

```javascript
// Convert the code being checked to vector
const codeEmbedding = await embeddings.generateCodeEmbedding(
  code,
  language,
  customApiKey
);
// Result: [0.15, -0.48, 0.81, ...]
```

#### **Step 2: Find Similar Whole Submissions**

```javascript
const similarSubmissions = await vectorDb.findSimilarSubmissions(
  codeEmbedding,      // query vector
  questionId,         // only search within same question
  maxResults,         // return top 5
  similarityThreshold // minimum 75% similarity
);
```

**What happens in Pinecone:**

1. **Cosine similarity search:**
```
Query vector:   [0.15, -0.48, 0.81, ...]
Compare against ALL stored vectors for this question

Stored vector 1: [0.14, -0.47, 0.80, ...]  → Similarity: 0.95 (95%)
Stored vector 2: [0.20, -0.50, 0.75, ...]  → Similarity: 0.88 (88%)
Stored vector 3: [0.05, -0.30, 0.60, ...]  → Similarity: 0.65 (65%)
```

2. **Filter by threshold:**
```
Threshold: 0.75 (75%)

Result:
- Vector 1: 0.95 ✅ (above threshold)
- Vector 2: 0.88 ✅ (above threshold)
- Vector 3: 0.65 ❌ (below threshold, excluded)
```

3. **Return matches:**
```javascript
[
  {
    id: "student2_Q123_...",
    student_id: "student2",
    code: "function sum(x,y) { return x+y; }",
    similarity: 0.95
  },
  {
    id: "student3_Q123_...",
    student_id: "student3",
    code: "const add = (a,b) => a+b;",
    similarity: 0.88
  }
]
```

#### **Step 3: Extract Chunks from Query Code**

```javascript
const codeChunks = chunking.extractCodeChunks(code, language);
// Extracts functions from the code being checked
```

#### **Step 4: Find Similar Chunks**

```javascript
// Generate embeddings for each chunk
const queryChunksWithEmbeddings = await embeddings.generateChunkEmbeddings(
  codeChunks,
  language,
  customApiKey
);

// Search for each chunk
for (each chunk) {
  const matches = await vectorDb.findSimilarChunks(
    chunk.embedding,
    questionId,
    5,  // top 5 matches per chunk
    similarityThreshold
  );
  
  // Result: Similar functions from other students' submissions
}
```

**Example:**

```
Query chunk: "function add(a,b) { return a+b; }"
              ↓
        [0.11, -0.44, ...]
              ↓
    Search Pinecone for similar chunk vectors
              ↓
Found matches:
- student2's "function sum(x,y) { return x+y; }" → 92% similar
- student3's "const addition = (a,b) => a+b;" → 87% similar
```

#### **Step 5: Calculate Summary**

```javascript
const summary = {
  totalMatchedSubmissions: 3,  // unique students with matches
  highSimilarity: 2,           // submissions with >85% similarity
  moderateSimilarity: 1,       // submissions with 75-85% similarity
  matchedChunks: 5,            // total chunk matches found
  maxSimilarity: 0.95,         // highest similarity score
  threshold: 0.75              // threshold used
};
```

---

## 🔍 How Similarity Works

### **Cosine Similarity**

The system uses **cosine similarity** to compare vectors:

```
Vector A: [0.1, 0.2, 0.3]
Vector B: [0.15, 0.25, 0.35]

Cosine Similarity = (A · B) / (||A|| × ||B||)
                  = 0.95 (95% similar)
```

**What this means:**
- 0.95-1.0 (95-100%): Nearly identical code
- 0.85-0.95 (85-95%): Very similar, likely plagiarism
- 0.75-0.85 (75-85%): Similar structure, worth investigating
- <0.75 (<75%): Different enough to ignore

### **Why It Works**

Embeddings capture **semantic meaning**, not just text:

```javascript
// These are semantically similar (high similarity score):

// Version 1
function add(a, b) {
  return a + b;
}

// Version 2
function sum(x, y) {
  return x + y;
}

// Version 3
const addition = (num1, num2) => num1 + num2;
```

All three would have similarity scores > 85% because they **mean** the same thing!

---

## 🎯 Key Features

### **1. Semantic Understanding**

✅ **Catches plagiarism even when:**
- Variable names are changed
- Function names are different
- Code style is different (arrow functions vs regular functions)
- Comments are added/removed
- Code is reformatted

❌ **Limitations:**
- Different algorithms doing the same thing might score high
- Boilerplate code (common patterns) might show false positives
- Very short code snippets are harder to compare

### **2. Two-Level Detection**

**Level 1: Whole-Code Comparison**
- Compares entire submissions
- Good for catching complete copy-paste

**Level 2: Chunk Comparison**
- Compares individual functions
- Catches partial plagiarism (copying just one function)

### **3. Question-Scoped Search**

```javascript
filter: {
  questionId: { $eq: "Q123" }
}
```

Only compares submissions for the **same question**, which makes sense!

---

## 📊 Example Scenario

### **Student A submits:**
```javascript
function calculateSum(a, b) {
  return a + b;
}

function calculateProduct(x, y) {
  return x * y;
}
```

**Stored as:**
- 1 whole-code vector
- 2 chunk vectors (one per function)

### **Student B checks (plagiarized):**
```javascript
function sum(num1, num2) {
  return num1 + num2;
}

function multiply(a, b) {
  return a * b;
}
```

**Detection:**
- Whole-code similarity: **92%** ✅ FLAGGED
- Chunk 1 (`sum`) matches Student A's `calculateSum`: **95%** ✅
- Chunk 2 (`multiply`) matches Student A's `calculateProduct`: **93%** ✅

**Result:** PLAGIARISM DETECTED

---

## 🔧 Configuration

### **Threshold (Configurable)**
```javascript
similarityThreshold = 0.75  // Default: 75%
```

- **Higher threshold (0.85):** Fewer false positives, might miss some plagiarism
- **Lower threshold (0.65):** Catches more, but more false positives

### **Embedding Model**
```javascript
EMBEDDING_MODEL = 'text-embedding-3-small'  // OpenAI model
EMBEDDING_DIMENSIONS = 1536                  // Vector size
```

### **Search Limits**
```javascript
maxResults = 5         // Return top 5 matches
topK = 50             // Search through top 50 vectors
```

---

## 💾 Data Storage (Pinecone)

### **Index Structure**
```
plagiarism-detector (index)
├── Dimension: 1536
├── Metric: cosine
└── Vectors:
    ├── student1_Q123_whole (submission vector)
    ├── student1_Q123_chunk_0 (function 1)
    ├── student1_Q123_chunk_1 (function 2)
    ├── student2_Q123_whole
    ├── student2_Q123_chunk_0
    └── ...
```

### **Metadata Filtering**
- `type`: "submission" or "chunk"
- `questionId`: Groups submissions by question
- `studentId`: Identifies owner
- `code`: Full code text (for display)

---

## 🚀 Performance

### **Speed**
- Embedding generation: ~1-2 seconds per code
- Vector search: <100ms (Pinecone is fast!)
- Total check time: ~2-5 seconds

### **Scalability**
- Pinecone can handle millions of vectors
- Search speed doesn't degrade with more data
- Can search 10,000+ submissions in <100ms

---

## 🎓 Summary

**Local plagiarism detection:**
1. Converts code to mathematical vectors (embeddings)
2. Stores vectors in Pinecone vector database
3. Searches for similar vectors using cosine similarity
4. Returns matches with similarity scores
5. Works at both whole-code and function-level

**Strengths:**
✅ Catches semantic similarity (meaning-based)
✅ Fast and scalable
✅ Works across different coding styles
✅ Fine-grained detection (function-level)

**Limitations:**
❌ Might flag similar but legitimate solutions
❌ Depends on OpenAI API (costs money)
❌ Can't catch plagiarism from external sources (that's why we have external API!)

---

## 🔗 Related

- **External Detection:** Uses AST/tree-sitter (structure-based)
- **Dual Detection:** Combining both for comprehensive checking
- See `EXTERNAL-API-DATA-FLOW.md` for external detection details
