# Project Structure

Overview of the Semantic Code Plagiarism Detection System architecture and file organization.

## 📁 Directory Structure

```
Plag Detect/
│
├── 🚀 Core Application Files
│   ├── index.js              # Main Express server & API endpoints
│   ├── db.js                 # PostgreSQL connection & query utilities
│   ├── embeddings.js         # OpenAI embedding generation
│   └── chunking.js           # Code parsing & chunking logic
│
├── 🗄️  Database
│   └── schema.sql            # PostgreSQL + pgvector schema
│
├── ⚙️  Configuration
│   ├── package.json          # Dependencies & scripts
│   ├── env.template          # Environment variables template
│   └── .env                  # Your actual config (create from template)
│
├── 📚 Documentation
│   ├── README.md             # Complete documentation
│   ├── QUICKSTART.md         # 5-minute setup guide
│   ├── SETUP.md              # Detailed setup instructions
│   ├── API-EXAMPLES.md       # API usage examples
│   └── PROJECT-STRUCTURE.md  # This file
│
└── 🧪 Testing & Examples
    ├── simple-test.js        # Automated test script
    └── test-examples.js      # Code examples for testing
```

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENT                              │
│              (Your Application / CURL / Postman)            │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP POST/GET
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXPRESS SERVER (index.js)                │
├─────────────────────────────────────────────────────────────┤
│  Routes:                                                    │
│    • POST /api/submit   - Submit code for analysis         │
│    • POST /api/check    - Check similarity                 │
│    • GET  /api/health   - Health check                     │
│    • GET  /api/submissions/:questionId                      │
│    • GET  /api/submission/:id                              │
└─────┬──────────────────────────┬────────────────────────────┘
      │                          │
      │                          │
      ▼                          ▼
┌─────────────────┐    ┌──────────────────────────────────────┐
│  EMBEDDINGS.JS  │    │          DB.JS                       │
│                 │    │  (PostgreSQL Client)                 │
│  OpenAI API     │    │                                      │
│  Integration    │    │  • saveSubmission()                  │
│                 │    │  • saveSubmissionVector()            │
│  Functions:     │    │  • saveSubmissionChunks()            │
│  • generate     │    │  • findSimilarSubmissions()          │
│    Embedding()  │    │  • findSimilarChunks()               │
│  • generate     │    │  • getSubmission()                   │
│    CodeEmbedding│    └──────────────┬───────────────────────┘
│  • generate     │                   │
│    ChunkEmbeddings                  │
└────────┬────────┘                   │
         │                            │
         │                            ▼
         │              ┌──────────────────────────────────────┐
         │              │     PostgreSQL + pgvector            │
         │              ├──────────────────────────────────────┤
         │              │  Tables:                             │
         │              │    • submissions                     │
         │              │      (id, student_id, question_id,   │
         │              │       code, created_at)              │
         │              │                                      │
         │              │    • submission_vectors              │
         │              │      (id, submission_id,             │
         │              │       embedding VECTOR(1536))        │
         │              │                                      │
         │              │    • submission_chunks               │
         │              │      (id, submission_id,             │
         │              │       chunk_index, chunk_text,       │
         │              │       embedding VECTOR(1536))        │
         │              │                                      │
         │              │  Indexes:                            │
         │              │    • IVFFlat indexes on embeddings   │
         │              │      for fast similarity search      │
         │              └──────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│          CHUNKING.JS                        │
│                                             │
│  Code Analysis & Parsing                    │
│                                             │
│  Functions:                                 │
│  • extractCodeChunks()                      │
│  • extractJavaScriptFunctions()             │
│  • filterTrivialChunks()                    │
│  • slidingWindowChunks()                    │
│  • getChunkStats()                          │
└─────────────────────────────────────────────┘
```

## 🔄 Data Flow

### Submission Flow (POST /api/submit)

```
1. Client submits code
   └─> Express receives request
   
2. Save to database
   └─> db.saveSubmission(studentId, questionId, code)
   └─> Returns submissionId
   
3. Generate whole-code embedding
   └─> embeddings.generateCodeEmbedding(code)
   └─> Call OpenAI API
   └─> Returns 1536-dimensional vector
   └─> db.saveSubmissionVector(submissionId, embedding)
   
4. Chunk the code
   └─> chunking.extractCodeChunks(code)
   └─> Parse functions/blocks
   └─> Filter trivial chunks
   └─> Returns array of chunks
   
5. Generate chunk embeddings
   └─> embeddings.generateChunkEmbeddings(chunks)
   └─> Batch call to OpenAI API
   └─> Returns embeddings for each chunk
   └─> db.saveSubmissionChunks(submissionId, chunks)
   
6. Return success response
   └─> { submissionId, chunkCount, stats }
```

### Similarity Check Flow (POST /api/check)

```
1. Client submits code to check
   └─> Express receives request
   
2. Generate embedding for query code
   └─> embeddings.generateCodeEmbedding(code)
   └─> Returns 1536-dimensional vector
   
3. Find similar whole submissions
   └─> db.findSimilarSubmissions(embedding, questionId)
   └─> SQL: ORDER BY embedding <=> $1 (cosine distance)
   └─> Returns top N matches above threshold
   
4. Extract query chunks
   └─> chunking.extractCodeChunks(code)
   └─> Returns array of chunks
   
5. Generate chunk embeddings
   └─> embeddings.generateChunkEmbeddings(chunks)
   └─> Returns embeddings for each chunk
   
6. Find similar chunks (for each query chunk)
   └─> db.findSimilarChunks(chunkEmbedding, questionId)
   └─> Returns similar chunks from all submissions
   
7. Aggregate and format results
   └─> Calculate summary statistics
   └─> Format response with similarity scores
   └─> Return { summary, similarSubmissions, similarChunks }
```

## 📦 Module Responsibilities

### index.js (Main Server)
- **Purpose**: HTTP server & request handling
- **Responsibilities**:
  - Define API routes
  - Validate input
  - Orchestrate calls to other modules
  - Format responses
  - Error handling
  - Logging

### db.js (Database Layer)
- **Purpose**: Database operations
- **Responsibilities**:
  - Connection pooling
  - Query execution
  - Data persistence (submissions, vectors, chunks)
  - Vector similarity search
  - Transaction management

### embeddings.js (Embedding Generation)
- **Purpose**: Vector embedding creation
- **Responsibilities**:
  - Interface with OpenAI API
  - Generate embeddings for code
  - Batch processing
  - Text normalization
  - Error handling for API calls

### chunking.js (Code Analysis)
- **Purpose**: Code parsing & chunking
- **Responsibilities**:
  - Extract functions from JavaScript code
  - Filter trivial/boilerplate code
  - Provide chunk statistics
  - Support multiple chunking strategies

### schema.sql (Database Schema)
- **Purpose**: Database structure definition
- **Responsibilities**:
  - Table definitions
  - Index creation (including vector indexes)
  - Extension setup (pgvector)
  - Sample queries

## 🔑 Key Technologies

| Technology | Purpose | Version |
|-----------|---------|---------|
| **Node.js** | Runtime environment | 18+ |
| **Express** | Web framework | 4.18+ |
| **PostgreSQL** | Database | 12+ |
| **pgvector** | Vector similarity search | 0.1.8+ |
| **OpenAI API** | Embedding generation | 4.28+ |
| **pg** | PostgreSQL client | 8.11+ |

## 🎯 Design Patterns

### 1. **Modular Architecture**
- Separation of concerns
- Each module has a single responsibility
- Easy to test and maintain

### 2. **Async/Await Pattern**
- All I/O operations use async/await
- Consistent error handling
- Readable asynchronous code

### 3. **Connection Pooling**
- Reuse database connections
- Better performance under load
- Configurable pool size

### 4. **Batch Processing**
- Generate multiple embeddings in one API call
- Reduce latency and cost
- Efficient use of OpenAI API

### 5. **Vector Indexing**
- IVFFlat indexes for fast similarity search
- Trade-off between speed and accuracy
- Configurable based on dataset size

## 📊 Database Schema Details

### submissions Table
```sql
id          SERIAL PRIMARY KEY
student_id  VARCHAR(255) NOT NULL
question_id VARCHAR(255) NOT NULL
code        TEXT NOT NULL
created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
UNIQUE (student_id, question_id)
```

### submission_vectors Table
```sql
id            SERIAL PRIMARY KEY
submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE
embedding     VECTOR(1536) NOT NULL
created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### submission_chunks Table
```sql
id            SERIAL PRIMARY KEY
submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE
chunk_index   INTEGER NOT NULL
chunk_text    TEXT NOT NULL
embedding     VECTOR(1536) NOT NULL
created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

## 🚦 API Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Health check |
| POST | `/api/submit` | Submit code & generate embeddings |
| POST | `/api/check` | Check code similarity |
| GET | `/api/submissions/:questionId` | List submissions for question |
| GET | `/api/submission/:id` | Get specific submission |

## 🔐 Environment Variables

```env
OPENAI_API_KEY    # OpenAI API key for embeddings
DB_HOST           # PostgreSQL host (default: localhost)
DB_PORT           # PostgreSQL port (default: 5432)
DB_NAME           # Database name (default: plagiarism_db)
DB_USER           # Database user (default: postgres)
DB_PASSWORD       # Database password
PORT              # Server port (default: 3000)
NODE_ENV          # Environment (development/production)
```

## 📈 Scalability Considerations

### Current Limitations:
- Single server instance
- Synchronous embedding generation
- No caching layer

### Potential Improvements:
1. **Add Redis caching** for frequently checked code
2. **Queue system** (Bull, RabbitMQ) for async processing
3. **Load balancer** for multiple server instances
4. **Read replicas** for PostgreSQL
5. **CDN** for API responses
6. **Rate limiting** per student/IP
7. **Database sharding** by question_id

## 🧪 Testing Strategy

1. **Unit Tests**: Test individual functions
2. **Integration Tests**: Test API endpoints
3. **Performance Tests**: Measure response times
4. **Load Tests**: Test under concurrent requests
5. **Manual Tests**: Use `simple-test.js`

## 📝 Development Workflow

1. **Make changes** to source files
2. **Test locally** using `simple-test.js`
3. **Check logs** for errors
4. **Query database** to verify data
5. **Test API** with curl or Postman
6. **Monitor costs** on OpenAI dashboard

## 🎓 Learning Resources

- **pgvector docs**: https://github.com/pgvector/pgvector
- **OpenAI Embeddings**: https://platform.openai.com/docs/guides/embeddings
- **Express.js**: https://expressjs.com/
- **PostgreSQL**: https://www.postgresql.org/docs/

---

For more details, see the other documentation files.

