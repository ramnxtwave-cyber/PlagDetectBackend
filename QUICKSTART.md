# Quick Start Guide - 5 Minutes to Running

Get the Semantic Code Plagiarism Detection System up and running in 5 minutes.

## Prerequisites Check

```bash
# Check Node.js version (need 18+)
node --version

# Check PostgreSQL
psql --version

# If not installed:
# Ubuntu: sudo apt install postgresql postgresql-contrib
# macOS: brew install postgresql
```

## 1. Install Dependencies (1 minute)

```bash
npm install
```

## 2. Setup Database (2 minutes)

```bash
# Start PostgreSQL (if not running)
sudo service postgresql start

# Create database
sudo -u postgres createdb plagiarism_db

# Install pgvector extension
sudo -u postgres psql -d plagiarism_db -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Apply schema
sudo -u postgres psql -d plagiarism_db -f schema.sql

# Verify
sudo -u postgres psql -d plagiarism_db -c "\dt"
```

You should see: `submissions`, `submission_vectors`, `submission_chunks`

## 3. Configure API Key (1 minute)

```bash
# Copy environment template
cp env.template .env

# Edit .env file
nano .env  # or use any editor
```

Add your OpenAI API key:
```
OPENAI_API_KEY=sk-proj-your-actual-key-here
```

Get your key from: https://platform.openai.com/api-keys

## 4. Start Server (30 seconds)

```bash
npm start
```

You should see:
```
🚀 Semantic Plagiarism Detection Server running on http://localhost:3000
📊 Embedding Model: text-embedding-3-small
📐 Vector Dimensions: 1536
```

## 5. Test It! (30 seconds)

Open a new terminal and run:

```bash
# Test 1: Health check
curl http://localhost:3000/api/health

# Test 2: Submit code
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{"code": "function add(a,b){return a+b;}", "studentId": "test1", "questionId": "q1"}'

# Test 3: Check similarity
curl -X POST http://localhost:3000/api/check \
  -H "Content-Type: application/json" \
  -d '{"code": "const sum=(x,y)=>x+y;", "questionId": "q1"}'
```

## Troubleshooting

### "Cannot connect to database"
```bash
# Check PostgreSQL is running
sudo service postgresql status

# Start it
sudo service postgresql start

# Check connection
psql -U postgres -d plagiarism_db -c "SELECT 1;"
```

### "pgvector extension not found"
```bash
# Install pgvector
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make
sudo make install

# Enable in database
sudo -u postgres psql -d plagiarism_db -c "CREATE EXTENSION vector;"
```

### "OpenAI API key invalid"
- Check `.env` file has correct key
- Verify key at https://platform.openai.com/api-keys
- Ensure no extra spaces or quotes

### Port 3000 in use
```bash
# Edit .env
PORT=3001

# Or kill existing process
lsof -ti:3000 | xargs kill -9
```

## Run Complete Tests

```bash
# Run automated test suite
node simple-test.js
```

## What's Next?

1. **Read API Examples**: `API-EXAMPLES.md`
2. **Full Documentation**: `README.md`
3. **Detailed Setup**: `SETUP.md`
4. **Code Examples**: `test-examples.js`

## Quick Commands

```bash
# Start server
npm start

# View database
sudo -u postgres psql -d plagiarism_db

# Check submissions
sudo -u postgres psql -d plagiarism_db -c "SELECT * FROM submissions;"

# Clear all data
sudo -u postgres psql -d plagiarism_db -c "TRUNCATE submissions CASCADE;"

# View logs
# (logs are in the terminal where you ran npm start)
```

## Common Use Case

```bash
# Submit 3 students' code
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{"code": "function fib(n){if(n<=1)return n;return fib(n-1)+fib(n-2);}", "studentId": "alice", "questionId": "fib"}'

curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{"code": "const fib=n=>n<2?n:fib(n-1)+fib(n-2);", "studentId": "bob", "questionId": "fib"}'

curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{"code": "function fib(n){let a=0,b=1;for(let i=0;i<n;i++){[a,b]=[b,a+b];}return a;}", "studentId": "charlie", "questionId": "fib"}'

# Check for plagiarism
curl -X POST http://localhost:3000/api/check \
  -H "Content-Type: application/json" \
  -d '{"code": "function fibonacci(x){return x<=1?x:fibonacci(x-1)+fibonacci(x-2);}", "questionId": "fib"}'
```

You'll see Alice and Bob have high similarity (both recursive), Charlie has lower similarity (iterative).

---

**That's it!** You now have a working semantic plagiarism detection system. 🎉

For production use, see the security and deployment sections in `README.md`.

