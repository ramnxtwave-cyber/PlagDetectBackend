# External API Data Flow - No Filtering Policy

## 🎯 Core Principle

**ZERO FILTERING** - Every single submission for a question is sent to the external API, regardless of:
- ❌ Local similarity scores
- ❌ Confidence levels
- ❌ Thresholds
- ❌ Arbitrary limits

## 📊 Data Flow Diagram

```
User submits code for checking
          ↓
    [Step 1: Local Detection]
    - Generate embeddings
    - Search Pinecone for similar submissions
    - Filter by similarity threshold (e.g., >75%)
    - Result: May find 0-5 "similar" submissions
          ↓
    [Step 2: External API Detection]
    - Fetch ALL submissions for question from database
    - NO filtering by similarity
    - NO limits applied
    - Send EVERY submission to external API
    - Result: External API checks ALL using AST/copydetect
          ↓
    [Step 3: Return Both Results]
    - Show local results independently
    - Show external results independently
    - No compromise - both shown as-is
```

## 🔍 Why No Filtering?

### Local Detection (Semantic Similarity)
- Uses vector embeddings
- Good at finding semantically similar code
- **Limitation:** Might miss plagiarism if variable names changed

### External Detection (AST-based)
- Uses Abstract Syntax Tree analysis
- Uses copydetect (structure matching)
- Uses tree-sitter (language-specific parsing)
- **Strength:** Catches structural plagiarism even with cosmetic changes

### Why Both Need All Data
If we filter submissions before sending to external API:
- ❌ We lose the benefit of having two independent detection methods
- ❌ External API might miss matches that local system filtered out
- ❌ Defeats the purpose of dual detection

## 📝 Current Implementation

### Step 1: Fetch ALL Submissions
```javascript
// Get ALL submissions for this question (up to 10,000)
const allSubmissions = await vectorDb.getSubmissionsByQuestion(questionId);
// Returns: All submissions where questionId matches
// No similarity filtering
// No threshold filtering
```

### Step 2: Send ALL to External API
```javascript
// Map ALL submissions (no slice, no filter)
const pastSubmissions = allSubmissions.map(sub => ({
  studentId: sub.student_id,
  code: sub.code,
}));

// Send ALL to external API
await externalPlagiarism.checkExternalPlagiarism(
  questionId,
  currentSubmission,
  pastSubmissions,  // ALL submissions, no filtering
  language
);
```

### Step 3: External API Receives
```javascript
{
  "main_student": {
    "id": "current_check",
    "code": "... current submission code ..."
  },
  "other_students": [
    // ALL submissions for this question
    { "id": "student1", "code": "..." },
    { "id": "student2", "code": "..." },
    { "id": "student3", "code": "..." },
    // ... (could be hundreds)
  ],
  "language": "python",
  "tools": ["copydetect", "difflib", "treesitter_python"]
}
```

## ✅ Benefits

### 1. **Independent Detection**
- Local system: Checks semantic similarity
- External API: Checks structural similarity
- Both work independently with full data

### 2. **Complete Coverage**
```
Example:
- Student A copies from Student B
- Changes variable names, reorders functions
- Local similarity: 45% (no match)
- External API: 95% match (caught!)
```

### 3. **No False Negatives**
```
Bad approach (old):
if (localMatches.length === 0) {
  // Don't call external API ❌
  // Might miss plagiarism!
}

Good approach (new):
// ALWAYS call external API ✅
// Send ALL submissions ✅
// Let external API decide ✅
```

## 📊 Performance Considerations

### Question: Won't this be slow?

**Answer:** External API is designed to handle this:
- Uses efficient AST comparison algorithms
- Parallel processing of comparisons
- Optimized for batch checking

### Limits in Place

**Only one limit:** Pinecone's `topK: 10000`
- This is a technical limit (Pinecone max results per query)
- Not a filtering decision
- Practically unlimited for real-world use (most questions have <100 submissions)

### No Other Limits
- ❌ No "top 5" or "top 20" limits
- ❌ No similarity threshold filtering
- ❌ No confidence-based filtering
- ✅ Send everything we have

## 🎯 Expected Behavior

### Scenario 1: Question with 50 submissions
```
[Check] Fetching ALL submissions for question Q123...
[Check] Found 50 total submissions in database
[Check] Sending ALL 50 submissions to external API (no filtering applied)
[Check] External API will compare against EVERY submission using AST/copydetect/tree-sitter
```

### Scenario 2: Question with 2 submissions
```
[Check] Fetching ALL submissions for question Q456...
[Check] Found 2 total submissions in database
[Check] Sending ALL 2 submissions to external API (no filtering applied)
```

### Scenario 3: First submission for a question
```
[Check] Fetching ALL submissions for question Q789...
[Check] Found 0 total submissions in database
[Check] Sending ALL 0 submissions to external API (no filtering applied)
[External API] No other students to compare against, checking for patterns/online sources
```

## 🔒 What Gets Filtered (The Only Filter)

**Only one filter:** `questionId`
- We only fetch submissions for the SAME question
- This is logical - comparing Java question to Python question makes no sense
- This is NOT arbitrary filtering - it's query scoping

```javascript
// The ONLY filter applied
filter: {
  type: { $eq: 'submission' },
  questionId: { $eq: questionId }  // Only filter: same question
}
```

## 🚀 Summary

### What Changed

**Before:**
```javascript
// Only sent top 5 similar submissions
const pastSubmissions = similarSubmissions.slice(0, 5).map(...)
// If no similar submissions, sent empty array
```

**After:**
```javascript
// Send ALL submissions for the question
const allSubmissions = await vectorDb.getSubmissionsByQuestion(questionId);
const pastSubmissions = allSubmissions.map(...)  // NO slice, NO filter
```

### Results

✅ External API **always** receives ALL submissions
✅ No false negatives due to filtering
✅ Complete independent dual detection
✅ Better plagiarism detection overall

---

## 📞 Questions?

If you see fewer submissions being sent than expected:
1. Check database - are all submissions saved? (`/api/submissions/:questionId`)
2. Check Pinecone - are vectors stored properly?
3. Check logs for exact count: `[Check] Found X total submissions`

The system is designed to be transparent - logs show exactly what's being sent!
