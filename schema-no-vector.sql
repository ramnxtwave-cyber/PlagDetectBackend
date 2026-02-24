-- PostgreSQL Schema WITHOUT pgvector (temporary workaround)
-- This creates tables without vector support - for basic functionality only

-- Table: submissions
CREATE TABLE IF NOT EXISTS submissions (
    id SERIAL PRIMARY KEY,
    student_id VARCHAR(255) NOT NULL,
    question_id VARCHAR(255) NOT NULL,
    code TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, question_id)
);

-- Note: Vector tables cannot be created without pgvector extension
-- You will need to enable pgvector on Railway to use the full system

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS submissions_question_id_idx ON submissions(question_id);
CREATE INDEX IF NOT EXISTS submissions_student_id_idx ON submissions(student_id);

-- Verify tables were created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;


