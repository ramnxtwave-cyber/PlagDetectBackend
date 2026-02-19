# Full Stack Setup Guide

Complete guide to run the entire Plagiarism Detection System (Backend + Frontend)

## 📋 System Overview

```
┌─────────────────────────────────────────────┐
│          React Frontend (Port 5173)         │
│  - Submit Code UI                           │
│  - Check Similarity UI                      │
│  - Results Display                          │
└─────────────────┬───────────────────────────┘
                  │ HTTP Requests
                  ▼
┌─────────────────────────────────────────────┐
│      Node.js Backend (Port 3000)            │
│  - Express API Server                       │
│  - OpenAI Embeddings                        │
│  - Code Chunking                            │
└─────────────────┬───────────────────────────┘
                  │ SQL Queries
                  ▼
┌─────────────────────────────────────────────┐
│     PostgreSQL + pgvector (Port 5432)       │
│  - Submissions Storage                      │
│  - Vector Embeddings                        │
│  - Similarity Search                        │
└─────────────────────────────────────────────┘
```

## 🚀 Quick Start (10 Minutes)

### Prerequisites

- Node.js 18+
- PostgreSQL 12+
- OpenAI API Key

### Step 1: Setup Database (3 minutes)

```bash
# Install PostgreSQL (if not installed)
sudo apt install postgresql postgresql-contrib

# Start PostgreSQL
sudo service postgresql start

# Install pgvector extension
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make
sudo make install
cd ..

# Create database and apply schema
sudo -u postgres createdb plagiarism_db
sudo -u postgres psql -d plagiarism_db -f schema.sql
```

### Step 2: Setup Backend (3 minutes)

```bash
# Install backend dependencies
npm install

# Configure environment
cp env.template .env
nano .env  # Add your OpenAI API key

# Start backend server
npm start
```

You should see:
```
🚀 Semantic Plagiarism Detection Server running on http://localhost:3000
```

### Step 3: Setup Frontend (3 minutes)

```bash
# Open new terminal
cd frontend

# Install frontend dependencies
npm install

# Start frontend dev server
npm run dev
```

You should see:
```
➜  Local:   http://localhost:5173/
```

### Step 4: Test the System (1 minute)

1. Open http://localhost:5173 in browser
2. Submit a code sample on "Submit Code" page
3. Check for plagiarism on "Check Similarity" page

## 📂 Project Structure

```
Plag Detect/
├── 🔙 Backend (Node.js)
│   ├── index.js              # Express server
│   ├── db.js                 # Database layer
│   ├── embeddings.js         # OpenAI integration
│   ├── chunking.js           # Code parsing
│   ├── schema.sql            # Database schema
│   ├── package.json
│   └── .env                  # Backend config
│
├── 🎨 Frontend (React)
│   ├── src/
│   │   ├── api/
│   │   │   └── plagiarismApi.js    # API client
│   │   ├── components/              # Reusable UI
│   │   ├── pages/
│   │   │   ├── SubmitCode.jsx
│   │   │   └── CheckSimilarity.jsx
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
│
└── 📚 Documentation
    ├── README.md
    ├── QUICKSTART.md
    ├── SETUP.md
    └── API-EXAMPLES.md
```

## 🔄 Development Workflow

### Terminal 1: Backend
```bash
# In project root
npm start

# Or with auto-reload
npm run dev
```

### Terminal 2: Frontend
```bash
# In frontend directory
cd frontend
npm run dev
```

### Terminal 3: Database (optional)
```bash
# Monitor database
sudo -u postgres psql -d plagiarism_db

# Useful queries:
SELECT COUNT(*) FROM submissions;
SELECT COUNT(*) FROM submission_vectors;
SELECT * FROM submissions ORDER BY created_at DESC LIMIT 5;
```

## 🧪 End-to-End Testing

### Test Case 1: Submit Multiple Students

**Student 1 (Alice)**:
```bash
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "studentId": "alice",
    "questionId": "fibonacci",
    "code": "function fib(n) { if (n <= 1) return n; return fib(n-1) + fib(n-2); }"
  }'
```

**Student 2 (Bob - Paraphrased)**:
```bash
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "studentId": "bob",
    "questionId": "fibonacci",
    "code": "const fibonacci = num => num < 2 ? num : fibonacci(num-1) + fibonacci(num-2);"
  }'
```

**Student 3 (Charlie - Different)**:
```bash
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "studentId": "charlie",
    "questionId": "fibonacci",
    "code": "function fib(n) { let a=0, b=1; for(let i=0; i<n; i++) [a,b]=[b,a+b]; return a; }"
  }'
```

### Test Case 2: Check Similarity

```bash
curl -X POST http://localhost:3000/api/check \
  -H "Content-Type: application/json" \
  -d '{
    "questionId": "fibonacci",
    "code": "function calcFib(x) { return x<=1 ? x : calcFib(x-1) + calcFib(x-2); }",
    "similarityThreshold": 0.75
  }'
```

**Expected**: High similarity with Alice & Bob, lower with Charlie

## 🌐 Using the Frontend

### Submit Code Page (`/`)

1. Navigate to http://localhost:5173
2. Fill in:
   - **Student ID**: `alice`
   - **Question ID**: `fibonacci`
   - **Code**: Your implementation
3. Click "Save Submission"
4. Wait for success message

### Check Similarity Page (`/check`)

1. Navigate to http://localhost:5173/check
2. Fill in:
   - **Question ID**: `fibonacci`
   - **Code**: Code to check
   - **Threshold**: 75% (adjust as needed)
3. Click "Check for Plagiarism"
4. View results:
   - Summary statistics
   - Similar submissions
   - Matched code chunks

## 📊 Understanding Results

### Similarity Scores

Frontend displays color-coded results:

- 🔴 **95%+** - Very High (Red badge)
- 🟠 **85-95%** - High (Orange badge)
- 🟡 **75-85%** - Moderate (Yellow badge)
- 🟢 **<75%** - Low (Green badge)

### Result Components

1. **Summary Card**:
   - Total matches
   - High similarity count
   - Moderate similarity count
   - Maximum similarity score

2. **Similar Submissions**:
   - Student ID
   - Submission ID
   - Similarity percentage
   - Code preview (expandable)

3. **Similar Chunks**:
   - Matched function/block
   - Side-by-side comparison
   - Chunk-level similarity

## 🔧 Configuration

### Backend Configuration (`.env`)

```env
# OpenAI
OPENAI_API_KEY=sk-proj-your-key-here

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=plagiarism_db
DB_USER=postgres
DB_PASSWORD=your_password

# Server
PORT=3000
NODE_ENV=development
```

### Frontend Configuration (`frontend/.env`)

```env
VITE_API_URL=http://localhost:3000
```

### Vite Proxy (Default)

Frontend is pre-configured with a proxy in `vite.config.js`:

```javascript
proxy: {
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: true,
  }
}
```

This allows the frontend to make requests to `/api/*` which are proxied to the backend.

## 🚨 Troubleshooting

### Issue: Frontend shows "Unable to connect to backend"

**Check 1**: Is backend running?
```bash
curl http://localhost:3000/api/health
```

**Check 2**: Check backend logs for errors

**Check 3**: Verify ports in both servers

### Issue: "pgvector extension not found"

```bash
# Reinstall pgvector
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make
sudo make install

# Enable in database
sudo -u postgres psql -d plagiarism_db -c "CREATE EXTENSION vector;"
```

### Issue: "OpenAI API key invalid"

- Verify key in `.env` file
- Check key at https://platform.openai.com/api-keys
- Ensure no extra spaces or quotes

### Issue: CORS errors in browser

Backend already has CORS enabled. If issues persist:

```javascript
// In index.js
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
```

## 📈 Performance Tips

### 1. Database Indexing

For large datasets (10k+ submissions), ensure indexes are created:

```sql
-- Check if indexes exist
\di

-- Recreate if needed
CREATE INDEX submission_vectors_embedding_idx 
ON submission_vectors 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### 2. API Response Time

- First request: 3-5 seconds (cold start + embedding generation)
- Subsequent requests: 1-2 seconds
- Chunk processing adds 0.5-1 second per 5 chunks

### 3. Frontend Performance

- Results render immediately as data arrives
- Large code previews are collapsed by default
- Pagination recommended for 20+ results

## 🔒 Security Checklist

For production deployment:

- [ ] Change all default passwords
- [ ] Enable HTTPS/TLS
- [ ] Add rate limiting
- [ ] Implement authentication
- [ ] Validate all inputs
- [ ] Set up CORS properly
- [ ] Use environment variables
- [ ] Enable request logging
- [ ] Set up monitoring
- [ ] Regular backups

## 📦 Deployment

### Backend Deployment

**Option 1: Docker**
```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

**Option 2: PM2**
```bash
npm install -g pm2
pm2 start index.js --name plagiarism-api
pm2 save
```

### Frontend Deployment

```bash
# Build
cd frontend
npm run build

# Deploy dist/ folder to:
# - Vercel
# - Netlify
# - GitHub Pages
# - Your own server (nginx)
```

### Database Deployment

- Use managed PostgreSQL (AWS RDS, DigitalOcean, Heroku)
- Ensure pgvector is supported
- Set up automated backups
- Configure connection pooling

## 📝 Development Tips

### Hot Reload

Both servers support hot reload:
- **Backend**: Use `nodemon` or `node --watch`
- **Frontend**: Vite automatically reloads

### Debugging

**Backend**:
```javascript
console.log('[Debug]', variable);
```

**Frontend**:
```javascript
console.log('[Debug]', state);
```

Use browser DevTools (F12) to inspect network requests and component state.

### Code Organization

- Keep components small (< 200 lines)
- Extract reusable logic to utils
- Use meaningful names
- Add comments for complex logic

## 🎓 Learning Path

1. **Week 1**: Understand project structure
2. **Week 2**: Modify existing components
3. **Week 3**: Add new features
4. **Week 4**: Optimize and refactor

## 📚 Additional Resources

- Backend API Docs: `API-EXAMPLES.md`
- Frontend Guide: `frontend/README.md`
- Component Guide: `frontend/COMPONENT-GUIDE.md`
- Database Schema: `schema.sql`

---

## ✅ Verification Checklist

After setup, verify everything works:

- [ ] Backend starts on port 3000
- [ ] Database connection successful
- [ ] Frontend starts on port 5173
- [ ] Can submit code via UI
- [ ] Can check similarity via UI
- [ ] Results display correctly
- [ ] No console errors
- [ ] Server status shows "online"

---

**You're all set!** 🎉

Start developing by modifying components or adding new features. Happy coding!

