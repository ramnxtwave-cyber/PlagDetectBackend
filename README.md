# Semantic Code Plagiarism Detection System

A prototype system for detecting semantically similar code submissions using OpenAI embeddings and PostgreSQL with pgvector. This system goes beyond simple text matching to identify paraphrased or restructured code that maintains similar functionality.

## 🎯 Overview

This system implements Layer 7 (Embedding Layer) plagiarism detection by:
1. Converting code into high-dimensional vector embeddings using OpenAI's API
2. Storing embeddings in PostgreSQL with the pgvector extension
3. Performing efficient similarity searches using cosine distance
4. Supporting both whole-submission and chunk-level analysis

## ✨ Features

- **Semantic Understanding**: Detects similar code even when variable names, structure, or style differ
- **Chunk-Level Analysis**: Identifies similar functions or code blocks within submissions
- **Efficient Vector Search**: Uses pgvector for fast similarity queries
- **Threshold-Based Detection**: Configurable similarity thresholds for different use cases
- **REST API**: Easy integration with existing systems

## 🏗️ Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP POST
       ▼
┌─────────────────────────────────┐
│   Express Server (index.js)     │
├─────────────────────────────────┤
│  • /api/submit                  │
│  • /api/check                   │
│  • /api/submissions/:questionId │
└───┬─────────────┬───────────────┘
    │             │
    │             │
    ▼             ▼
┌─────────┐   ┌──────────────┐
│ OpenAI  │   │ PostgreSQL   │
│   API   │   │ + pgvector   │
│         │   │              │
│Embedding│   │ • submissions│
│  Model  │   │ • vectors    │
│         │   │ • chunks     │
└─────────┘   └──────────────┘
```

## 📋 Prerequisites

- **Node.js** 18+ (for ES modules support)
- **PostgreSQL** 12+ 
- **pgvector** extension for PostgreSQL
- **OpenAI API key**

## 🚀 Installation

### 1. Clone and Install Dependencies

```bash
cd "Plag Detect"
npm install
```

### 2. Set Up PostgreSQL with pgvector

#### Install pgvector extension:

```bash
# On Ubuntu/Debian
sudo apt-get install postgresql-server-dev-all
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make
sudo make install
```

#### Create database and run schema:

```bash
# Create database
createdb plagiarism_db

# Or using psql
psql -U postgres -c "CREATE DATABASE plagiarism_db;"

# Apply schema
psql -U postgres -d plagiarism_db -f schema.sql
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
OPENAI_API_KEY=sk-your-api-key-here
DB_HOST=localhost
DB_PORT=5432
DB_NAME=plagiarism_db
DB_USER=postgres
DB_PASSWORD=your_password
PORT=3000
```

### 4. Start the Server

```bash
npm start
```

The server will start on `http://localhost:3000`

## 📡 API Endpoints

### 1. Health Check

```bash
GET /api/health
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

### 2. Submit Code

Submit a new code submission and generate embeddings.

```bash
POST /api/submit
Content-Type: application/json

{
  "code": "function calculateSum(a, b) { return a + b; }",
  "studentId": "student123",
  "questionId": "q1",
  "language": "javascript"
}
```

**Response:**
```json
{
  "success": true,
  "submissionId": 1,
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

### 3. Check for Similar Submissions

Check if submitted code is similar to existing submissions.

```bash
POST /api/check
Content-Type: application/json

{
  "code": "const add = (x, y) => x + y;",
  "questionId": "q1",
  "language": "javascript",
  "similarityThreshold": 0.75,
  "maxResults": 5
}
```

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
      "submissionId": 1,
      "studentId": "student123",
      "similarity": 0.892,
      "codePreview": "function calculateSum(a, b) { return a + b; }",
      "codeLength": 45
    }
  ],
  "similarChunks": [
    {
      "submissionId": 1,
      "studentId": "student123",
      "similarity": 0.887,
      "queryChunkIndex": 0,
      "queryChunkPreview": "const add = (x, y) => x + y;",
      "matchedChunkText": "function calculateSum(a, b) { return a + b; }",
      "matchedChunkIndex": 0
    }
  ],
  "timestamp": "2026-02-19T10:35:00.000Z"
}
```

### 4. Get Submissions by Question

```bash
GET /api/submissions/:questionId
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
    }
  ]
}
```

### 5. Get Specific Submission

```bash
GET /api/submission/:id
```

## 🧪 Testing the System

### Example Test Flow:

```bash
# 1. Submit first student's code
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "code": "function fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n-1) + fibonacci(n-2);\n}",
    "studentId": "alice",
    "questionId": "fib-problem"
  }'

# 2. Submit second student's code (semantically similar)
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "code": "const fib = (num) => {\n  if (num < 2) return num;\n  return fib(num - 1) + fib(num - 2);\n}",
    "studentId": "bob",
    "questionId": "fib-problem"
  }'

# 3. Check for plagiarism
curl -X POST http://localhost:3000/api/check \
  -H "Content-Type: application/json" \
  -d '{
    "code": "function fib(x) {\n  return x <= 1 ? x : fib(x-1) + fib(x-2);\n}",
    "questionId": "fib-problem",
    "similarityThreshold": 0.75
  }'
```

## 🔧 Configuration

### Similarity Thresholds

Adjust thresholds based on your use case:

- **0.95 - 1.0**: Nearly identical (very high confidence plagiarism)
- **0.85 - 0.95**: Very similar (high confidence, minor variations)
- **0.75 - 0.85**: Similar (moderate confidence, different style/structure)
- **0.60 - 0.75**: Somewhat similar (low confidence, same algorithm)
- **< 0.60**: Different approaches

### Chunk Configuration

In `chunking.js`, you can adjust:

```javascript
// Minimum lines for a valid chunk
filterTrivialChunks(chunks, minLines = 3, minChars = 50)

// Sliding window parameters (alternative strategy)
slidingWindowChunks(code, linesPerChunk = 20, overlapLines = 5)
```

## 📊 Database Schema

### Tables:

1. **submissions**: Stores original code submissions
2. **submission_vectors**: Stores whole-submission embeddings (1536D)
3. **submission_chunks**: Stores chunk-level embeddings

### Vector Similarity Search:

The system uses pgvector's cosine distance operator (`<=>`):

```sql
-- Find similar submissions
SELECT 
  s.id, s.student_id,
  1 - (sv.embedding <=> $1::vector) as similarity
FROM submission_vectors sv
JOIN submissions s ON s.id = sv.submission_id
WHERE s.question_id = $2
ORDER BY sv.embedding <=> $1::vector
LIMIT 5;
```

## 🏗️ Project Structure

```
Plag Detect/
├── index.js           # Main Express server
├── db.js              # Database connection and queries
├── embeddings.js      # OpenAI embedding generation
├── chunking.js        # Code chunking utilities
├── schema.sql         # PostgreSQL schema
├── package.json       # Dependencies
├── .env.example       # Environment template
├── .gitignore         # Git ignore rules
└── README.md          # This file
```

## 🔍 How It Works

### 1. Code Submission Flow:

1. Student submits code via `/api/submit`
2. System saves code to `submissions` table
3. OpenAI generates 1536-dimensional embedding
4. Code is split into chunks (functions)
5. Each chunk gets its own embedding
6. All embeddings stored in PostgreSQL with pgvector

### 2. Similarity Check Flow:

1. New code submitted to `/api/check`
2. Generate embedding for query code
3. Perform vector similarity search using cosine distance
4. Return top matches above threshold
5. Also check chunk-level similarities

### 3. Semantic Understanding:

The system detects similarity even when:
- Variable names are different
- Code style varies (arrow functions vs regular functions)
- Comments are added/removed
- Whitespace and formatting differ
- Logic is restructured but semantically equivalent

## ⚡ Performance Considerations

### Vector Index:

For datasets > 10k submissions, the IVFFlat index significantly speeds up queries:

```sql
CREATE INDEX submission_vectors_embedding_idx 
ON submission_vectors 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### Batch Processing:

The system uses OpenAI's batch embedding API for efficiency when processing multiple chunks.

### Connection Pooling:

Database connection pool is configured for concurrent requests:

```javascript
max: 20,
idleTimeoutMillis: 30000,
connectionTimeoutMillis: 2000
```

## 🚨 Limitations & Future Improvements

### Current Limitations:

1. **Language Support**: Currently optimized for JavaScript
2. **Code Length**: Very long submissions may need truncation
3. **Cost**: OpenAI API calls incur costs (≈$0.00002 per submission)
4. **Obfuscation**: Heavily obfuscated code may reduce accuracy

### Potential Improvements:

1. Add support for Python, Java, C++
2. Implement AST-based analysis for better accuracy
3. Add caching layer for frequently checked code
4. Support cross-language similarity detection
5. Add visualization dashboard
6. Implement incremental updates (avoid re-embedding on small changes)

## 📈 Monitoring & Debugging

### Logs:

The system logs key operations:

```
[Submit] Processing submission from student123 for question q1
[Submit] Saved submission with ID: 1
[Embeddings] Generating embedding for text (150 chars)
[DB Query] { text: 'INSERT INTO submission_vectors...', duration: 45, rows: 1 }
```

### Database Queries:

Monitor query performance:

```sql
-- Check vector search performance
EXPLAIN ANALYZE
SELECT 1 - (embedding <=> '[...]'::vector) as similarity
FROM submission_vectors
ORDER BY embedding <=> '[...]'::vector
LIMIT 5;
```

## 🔐 Security Considerations

For production deployment:

1. Add authentication (JWT, OAuth)
2. Rate limiting on API endpoints
3. Input validation and sanitization
4. SQL injection protection (using parameterized queries)
5. HTTPS/TLS encryption
6. API key rotation
7. Student privacy (anonymize data)

## 📝 License

MIT

## 🤝 Contributing

This is a prototype/proof-of-concept. Feel free to extend and improve!

## 📧 Support

For issues or questions, please refer to the documentation or create an issue in your repository.

---

**Built with:** Node.js, Express, PostgreSQL, pgvector, OpenAI Embeddings API

