-- PostgreSQL Schema for Semantic Code Plagiarism Detection
-- Requires PostgreSQL 12+ with pgvector extension

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Table: submissions
-- Stores the original code submissions from students
CREATE TABLE IF NOT EXISTS submissions (
    id SERIAL PRIMARY KEY,
    student_id VARCHAR(255) NOT NULL,
    question_id VARCHAR(255) NOT NULL,
    code TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, question_id)
);

-- Table: submission_vectors
-- Stores whole-submission embeddings (1536 dimensions for text-embedding-3-small)
CREATE TABLE IF NOT EXISTS submission_vectors (
    id SERIAL PRIMARY KEY,
    submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    embedding VECTOR(1536) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: submission_chunks
-- Stores chunk-level embeddings (e.g., per function or code block)
CREATE TABLE IF NOT EXISTS submission_chunks (
    id SERIAL PRIMARY KEY,
    submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding VECTOR(1536) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient vector similarity search using cosine distance
-- Using ivfflat index for faster approximate nearest neighbor search
-- Note: For small datasets (<10k), you can skip indexes as seq scan may be faster

-- Index for submission_vectors
CREATE INDEX IF NOT EXISTS submission_vectors_embedding_idx 
ON submission_vectors 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Index for submission_chunks
CREATE INDEX IF NOT EXISTS submission_chunks_embedding_idx 
ON submission_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS submissions_question_id_idx ON submissions(question_id);
CREATE INDEX IF NOT EXISTS submissions_student_id_idx ON submissions(student_id);
CREATE INDEX IF NOT EXISTS submission_vectors_submission_id_idx ON submission_vectors(submission_id);
CREATE INDEX IF NOT EXISTS submission_chunks_submission_id_idx ON submission_chunks(submission_id);

-- Sample query examples:
-- 
-- Find top 5 similar submissions using cosine distance:
-- SELECT 
--     s.id, s.student_id, s.question_id,
--     1 - (sv.embedding <=> $1::vector) as similarity
-- FROM submission_vectors sv
-- JOIN submissions s ON s.id = sv.submission_id
-- WHERE s.question_id = $2
-- ORDER BY sv.embedding <=> $1::vector
-- LIMIT 5;
--
-- Find similar chunks:
-- SELECT 
--     s.id, s.student_id, sc.chunk_text,
--     1 - (sc.embedding <=> $1::vector) as similarity
-- FROM submission_chunks sc
-- JOIN submissions s ON s.id = sc.submission_id
-- WHERE s.question_id = $2
-- ORDER BY sc.embedding <=> $1::vector
-- LIMIT 5;

