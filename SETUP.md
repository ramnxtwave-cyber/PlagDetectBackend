# Quick Setup Guide

Follow these steps to get the Semantic Code Plagiarism Detection System running.

## 1. Install Dependencies

```bash
npm install
```

## 2. Set Up PostgreSQL

### Install PostgreSQL (if not already installed)

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
```

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15
```

### Install pgvector Extension

```bash
# Clone and build pgvector
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make
sudo make install
cd ..
```

### Create Database

```bash
# Start PostgreSQL service (if not running)
sudo service postgresql start

# Create database
sudo -u postgres createdb plagiarism_db

# Or using psql
sudo -u postgres psql -c "CREATE DATABASE plagiarism_db;"
```

### Apply Database Schema

```bash
sudo -u postgres psql -d plagiarism_db -f schema.sql
```

### Verify Setup

```bash
sudo -u postgres psql -d plagiarism_db -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

You should see output confirming the vector extension is installed.

## 3. Configure Environment Variables

Create a `.env` file in the project root:

```bash
touch .env
```

Add the following content (replace with your actual values):

```env
# OpenAI API Configuration
OPENAI_API_KEY=sk-proj-your-actual-openai-api-key-here

# PostgreSQL Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=plagiarism_db
DB_USER=postgres
DB_PASSWORD=your_postgres_password

# Server Configuration
PORT=3000
NODE_ENV=development
```

### Get OpenAI API Key

1. Go to https://platform.openai.com/
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key
5. Copy and paste it into your `.env` file

## 4. Start the Server

```bash
npm start
```

You should see:

```
🚀 Semantic Plagiarism Detection Server running on http://localhost:3000
📊 Embedding Model: text-embedding-3-small
📐 Vector Dimensions: 1536

API Endpoints:
  POST /api/submit  - Submit code for analysis
  POST /api/check   - Check code for similarity
  GET  /api/health  - Health check
```

## 5. Test the System

### Test 1: Health Check

```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "semantic-plagiarism-detector",
  "model": "text-embedding-3-small",
  "timestamp": "2026-02-19T..."
}
```

### Test 2: Submit Code

```bash
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "code": "function add(a, b) { return a + b; }",
    "studentId": "student1",
    "questionId": "test1"
  }'
```

Expected response:
```json
{
  "success": true,
  "submissionId": 1,
  "chunkCount": 1,
  "message": "Submission processed successfully"
}
```

### Test 3: Check for Similarity

```bash
curl -X POST http://localhost:3000/api/check \
  -H "Content-Type: application/json" \
  -d '{
    "code": "const sum = (x, y) => x + y;",
    "questionId": "test1"
  }'
```

Expected response:
```json
{
  "success": true,
  "summary": {
    "totalMatchedSubmissions": 1,
    "highSimilarity": 1,
    "matchedChunks": 1,
    "maxSimilarity": 0.89
  },
  "similarSubmissions": [...]
}
```

## 6. Realistic Testing Scenario

### Submit Multiple Students' Code:

**Student 1 (Original):**
```bash
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "code": "function fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n-1) + fibonacci(n-2);\n}",
    "studentId": "alice",
    "questionId": "fib"
  }'
```

**Student 2 (Paraphrased - should detect as similar):**
```bash
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "code": "const fib = (num) => {\n  if (num < 2) return num;\n  return fib(num - 1) + fib(num - 2);\n}",
    "studentId": "bob",
    "questionId": "fib"
  }'
```

**Student 3 (Different approach):**
```bash
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "code": "function fib(n) {\n  let a = 0, b = 1;\n  for(let i = 0; i < n; i++) {\n    [a, b] = [b, a + b];\n  }\n  return a;\n}",
    "studentId": "charlie",
    "questionId": "fib"
  }'
```

**Check a new submission:**
```bash
curl -X POST http://localhost:3000/api/check \
  -H "Content-Type: application/json" \
  -d '{
    "code": "function calculateFibonacci(x) {\n  return x <= 1 ? x : calculateFibonacci(x-1) + calculateFibonacci(x-2);\n}",
    "questionId": "fib",
    "similarityThreshold": 0.75
  }'
```

## Troubleshooting

### Error: "Cannot connect to database"

- Check PostgreSQL is running: `sudo service postgresql status`
- Verify credentials in `.env` match your PostgreSQL setup
- Test connection: `psql -U postgres -d plagiarism_db`

### Error: "pgvector extension not found"

- Make sure pgvector is installed (see step 2)
- Run: `sudo -u postgres psql -d plagiarism_db -c "CREATE EXTENSION vector;"`

### Error: "OpenAI API key invalid"

- Verify your API key in `.env` is correct
- Check you have credits: https://platform.openai.com/usage
- Try regenerating the key

### Error: "MODULE_NOT_FOUND"

- Run: `npm install`
- Ensure you're using Node.js 18+: `node --version`

### Port 3000 already in use

- Change PORT in `.env` to another value (e.g., 3001)
- Or kill the process using port 3000

## Next Steps

1. Review the API documentation in `README.md`
2. Check out `test-examples.js` for more code examples
3. Explore the database schema in `schema.sql`
4. Customize chunking logic in `chunking.js`
5. Adjust similarity thresholds based on your use case

## Database Management

### View all submissions:
```bash
sudo -u postgres psql -d plagiarism_db -c "SELECT id, student_id, question_id, created_at FROM submissions;"
```

### Check vector counts:
```bash
sudo -u postgres psql -d plagiarism_db -c "SELECT COUNT(*) FROM submission_vectors;"
sudo -u postgres psql -d plagiarism_db -c "SELECT COUNT(*) FROM submission_chunks;"
```

### Clear all data (reset):
```bash
sudo -u postgres psql -d plagiarism_db -c "TRUNCATE submissions CASCADE;"
```

## Production Deployment Checklist

- [ ] Set `NODE_ENV=production` in `.env`
- [ ] Use strong database password
- [ ] Enable HTTPS/TLS
- [ ] Add authentication middleware
- [ ] Implement rate limiting
- [ ] Set up logging service
- [ ] Configure backup for PostgreSQL
- [ ] Monitor OpenAI API costs
- [ ] Add error reporting (e.g., Sentry)
- [ ] Set up CI/CD pipeline

---

**Need help?** Check the full documentation in `README.md`

