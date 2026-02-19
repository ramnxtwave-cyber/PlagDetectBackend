# API Examples & Usage Guide

Quick reference for using the Plagiarism Detection API.

## Base URL

```
http://localhost:3000
```

## API Endpoints

### 1. Health Check

Check if the server is running and configured correctly.

**Request:**
```bash
curl http://localhost:3000/api/health
```

**Response:**
```json
{
  "status": "ok",
  "service": "semantic-plagiarism-detector",
  "model": "text-embedding-3-small",
  "timestamp": "2026-02-19T10:30:00.000Z"
}
```

---

### 2. Submit Code

Submit a code submission for a student and generate embeddings.

**Request:**
```bash
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "code": "function add(a, b) {\n  return a + b;\n}",
    "studentId": "student123",
    "questionId": "q1",
    "language": "javascript"
  }'
```

**Parameters:**
- `code` (required): The code text to analyze
- `studentId` (required): Unique identifier for the student
- `questionId` (required): Identifier for the question/problem
- `language` (optional): Programming language, defaults to "javascript"

**Response:**
```json
{
  "success": true,
  "submissionId": 42,
  "chunkCount": 1,
  "chunkStats": {
    "count": 1,
    "totalChars": 45,
    "avgChars": 45,
    "avgLines": 1
  },
  "message": "Submission processed successfully"
}
```

---

### 3. Check for Similarity

Check if submitted code is similar to existing submissions.

**Request:**
```bash
curl -X POST http://localhost:3000/api/check \
  -H "Content-Type: application/json" \
  -d '{
    "code": "const sum = (x, y) => x + y;",
    "questionId": "q1",
    "language": "javascript",
    "similarityThreshold": 0.75,
    "maxResults": 5
  }'
```

**Parameters:**
- `code` (required): The code to check
- `questionId` (required): Question ID to search within
- `language` (optional): Programming language, defaults to "javascript"
- `similarityThreshold` (optional): Minimum similarity (0-1), defaults to 0.75
- `maxResults` (optional): Maximum results to return, defaults to 5

**Response:**
```json
{
  "success": true,
  "summary": {
    "totalMatchedSubmissions": 2,
    "highSimilarity": 1,
    "moderateSimilarity": 1,
    "matchedChunks": 3,
    "maxSimilarity": 0.892,
    "threshold": 0.75
  },
  "similarSubmissions": [
    {
      "submissionId": 42,
      "studentId": "student123",
      "similarity": 0.892,
      "codePreview": "function add(a, b) {\n  return a + b;\n}",
      "codeLength": 45
    }
  ],
  "similarChunks": [
    {
      "submissionId": 42,
      "studentId": "student123",
      "similarity": 0.887,
      "queryChunkIndex": 0,
      "queryChunkPreview": "const sum = (x, y) => x + y;",
      "matchedChunkText": "function add(a, b) { return a + b; }",
      "matchedChunkIndex": 0
    }
  ],
  "timestamp": "2026-02-19T10:35:00.000Z"
}
```

---

### 4. Get All Submissions for a Question

Retrieve all submissions for a specific question.

**Request:**
```bash
curl http://localhost:3000/api/submissions/q1
```

**Response:**
```json
{
  "success": true,
  "questionId": "q1",
  "count": 5,
  "submissions": [
    {
      "id": 1,
      "studentId": "student123",
      "codeLength": 150,
      "createdAt": "2026-02-19T10:00:00.000Z"
    },
    {
      "id": 2,
      "studentId": "student456",
      "codeLength": 200,
      "createdAt": "2026-02-19T10:05:00.000Z"
    }
  ]
}
```

---

### 5. Get Specific Submission

Retrieve a single submission by its ID.

**Request:**
```bash
curl http://localhost:3000/api/submission/42
```

**Response:**
```json
{
  "success": true,
  "submission": {
    "id": 42,
    "student_id": "student123",
    "question_id": "q1",
    "code": "function add(a, b) {\n  return a + b;\n}",
    "created_at": "2026-02-19T10:00:00.000Z"
  }
}
```

---

## Complete Workflow Example

### Scenario: Detecting Plagiarism in a Fibonacci Problem

#### Step 1: Submit First Student's Code

```bash
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "code": "function fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n-1) + fibonacci(n-2);\n}",
    "studentId": "alice",
    "questionId": "fibonacci-problem"
  }'
```

Response: `submissionId: 1`

#### Step 2: Submit Second Student's Code (Paraphrased)

```bash
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "code": "const fib = (num) => {\n  if (num < 2) return num;\n  return fib(num - 1) + fib(num - 2);\n}",
    "studentId": "bob",
    "questionId": "fibonacci-problem"
  }'
```

Response: `submissionId: 2`

#### Step 3: Submit Third Student's Code (Different Approach)

```bash
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "code": "function fib(n) {\n  let a = 0, b = 1;\n  for(let i = 0; i < n; i++) {\n    [a, b] = [b, a + b];\n  }\n  return a;\n}",
    "studentId": "charlie",
    "questionId": "fibonacci-problem"
  }'
```

Response: `submissionId: 3`

#### Step 4: Check a New Submission for Plagiarism

```bash
curl -X POST http://localhost:3000/api/check \
  -H "Content-Type: application/json" \
  -d '{
    "code": "function calcFib(x) {\n  return x <= 1 ? x : calcFib(x-1) + calcFib(x-2);\n}",
    "questionId": "fibonacci-problem",
    "similarityThreshold": 0.75
  }'
```

**Expected Results:**
- High similarity with Alice's and Bob's submissions (both recursive)
- Lower similarity with Charlie's submission (iterative approach)

---

## Understanding Similarity Scores

| Similarity Range | Interpretation | Action |
|-----------------|----------------|---------|
| 0.95 - 1.0 | Nearly identical | High confidence plagiarism |
| 0.85 - 0.95 | Very similar | Investigate further |
| 0.75 - 0.85 | Similar approach | Possible plagiarism |
| 0.60 - 0.75 | Same algorithm | Low confidence |
| < 0.60 | Different | Not plagiarism |

---

## JavaScript/Node.js Usage

### Using `fetch` (Node 18+):

```javascript
// Submit code
const submitCode = async () => {
  const response = await fetch('http://localhost:3000/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'function add(a, b) { return a + b; }',
      studentId: 'student123',
      questionId: 'q1'
    })
  });
  
  const result = await response.json();
  console.log(result);
};

// Check similarity
const checkSimilarity = async () => {
  const response = await fetch('http://localhost:3000/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'const sum = (x, y) => x + y;',
      questionId: 'q1',
      similarityThreshold: 0.75
    })
  });
  
  const result = await response.json();
  console.log('Similar submissions:', result.similarSubmissions);
};
```

---

## Python Usage

### Using `requests`:

```python
import requests

# Submit code
def submit_code():
    response = requests.post('http://localhost:3000/api/submit', json={
        'code': 'function add(a, b) { return a + b; }',
        'studentId': 'student123',
        'questionId': 'q1'
    })
    print(response.json())

# Check similarity
def check_similarity():
    response = requests.post('http://localhost:3000/api/check', json={
        'code': 'const sum = (x, y) => x + y;',
        'questionId': 'q1',
        'similarityThreshold': 0.75
    })
    result = response.json()
    print('Similar submissions:', result['similarSubmissions'])
```

---

## Error Responses

### 400 Bad Request - Missing Fields

```json
{
  "success": false,
  "error": "Missing required fields: code, studentId, questionId"
}
```

### 404 Not Found - Submission Not Found

```json
{
  "success": false,
  "error": "Submission not found"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "error": "Internal server error"
}
```

---

## Advanced Usage

### Adjusting Similarity Thresholds

For stricter detection:
```bash
curl -X POST http://localhost:3000/api/check \
  -d '{"code": "...", "questionId": "q1", "similarityThreshold": 0.85}'
```

For broader detection:
```bash
curl -X POST http://localhost:3000/api/check \
  -d '{"code": "...", "questionId": "q1", "similarityThreshold": 0.65}'
```

### Getting More Results

```bash
curl -X POST http://localhost:3000/api/check \
  -d '{"code": "...", "questionId": "q1", "maxResults": 10}'
```

---

## Testing Tips

1. **Test with known similar code** - Start with obviously similar submissions
2. **Test edge cases** - Empty code, very long code, special characters
3. **Test different approaches** - Same algorithm but different implementation styles
4. **Monitor response times** - First query may be slower (cold start)
5. **Check logs** - Server logs provide detailed information about processing

---

## Rate Limits & Costs

- **OpenAI API**: text-embedding-3-small costs ~$0.00002 per 1K tokens
- **Average submission**: 200-500 tokens = ~$0.00001-0.00002 per submission
- **Recommended**: Implement caching for frequently checked code
- **Batch processing**: Use for bulk analysis to reduce API calls

---

For more information, see the main `README.md` file.

