/**
 * Database Connection and Query Utilities
 * Handles PostgreSQL connection with pgvector support
 */

import pg from 'pg';
import pgvector from 'pgvector/pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Create PostgreSQL connection pool
// Support both DATABASE_URL (Railway, Heroku) and individual env vars (local)
let poolConfig;

if (process.env.DATABASE_URL) {
  // Railway/Heroku style - use connection string
  console.log('[DB] Using DATABASE_URL connection string');
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL !== 'false' ? {
      rejectUnauthorized: false // Required for Railway/Heroku
    } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
} else {
  // Local development - use individual env vars
  console.log('[DB] Using individual environment variables');
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'plagiarism_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
}

const pool = new Pool(poolConfig);

// Test database connection
pool.on('connect', async (client) => {
  await pgvector.registerType(client);
  console.log('[DB] New database connection established');
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err);
});

// Verify connection on startup
(async () => {
  try {
    const client = await pool.connect();
    console.log('[DB] ✅ Database connection successful');
    const result = await client.query('SELECT NOW()');
    console.log('[DB] Server time:', result.rows[0].now);
    client.release();
  } catch (err) {
    console.error('[DB] ❌ Database connection failed:', err.message);
    console.error('[DB] Please check your DATABASE_URL or database configuration');
  }
})();

/**
 * Execute a query with error handling
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('[DB Query]', { text: text.substring(0, 80), duration, rows: result.rowCount });
    return result;
  } catch (error) {
    console.error('[DB Error]', { text, error: error.message });
    throw error;
  }
}

/**
 * Save a submission to the database
 * @param {string} studentId - Student identifier
 * @param {string} questionId - Question identifier
 * @param {string} code - Code text
 * @returns {Promise<number>} Submission ID
 */
export async function saveSubmission(studentId, questionId, code) {
  const result = await query(
    `INSERT INTO submissions (student_id, question_id, code)
     VALUES ($1, $2, $3)
     ON CONFLICT (student_id, question_id) 
     DO UPDATE SET code = EXCLUDED.code, created_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [studentId, questionId, code]
  );
  return result.rows[0].id;
}

/**
 * Save whole-submission embedding
 * @param {number} submissionId - Submission ID
 * @param {Array<number>} embedding - 1536-dimensional embedding vector
 * @returns {Promise<number>} Vector ID
 */
export async function saveSubmissionVector(submissionId, embedding) {
  // Delete existing vectors for this submission (in case of resubmission)
  await query('DELETE FROM submission_vectors WHERE submission_id = $1', [submissionId]);
  
  const result = await query(
    'INSERT INTO submission_vectors (submission_id, embedding) VALUES ($1, $2) RETURNING id',
    [submissionId, pgvector.toSql(embedding)]
  );
  return result.rows[0].id;
}

/**
 * Save chunk embeddings
 * @param {number} submissionId - Submission ID
 * @param {Array<Object>} chunks - Array of {index, text, embedding}
 * @returns {Promise<void>}
 */
export async function saveSubmissionChunks(submissionId, chunks) {
  // Delete existing chunks for this submission
  await query('DELETE FROM submission_chunks WHERE submission_id = $1', [submissionId]);
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    for (const chunk of chunks) {
      await client.query(
        `INSERT INTO submission_chunks (submission_id, chunk_index, chunk_text, embedding)
         VALUES ($1, $2, $3, $4)`,
        [submissionId, chunk.index, chunk.text, pgvector.toSql(chunk.embedding)]
      );
    }
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Find similar submissions using whole-submission embeddings
 * @param {Array<number>} embedding - Query embedding vector
 * @param {string} questionId - Question to search within
 * @param {number} limit - Number of results to return
 * @param {number} minSimilarity - Minimum similarity threshold (0-1)
 * @returns {Promise<Array>} Similar submissions with scores
 */
export async function findSimilarSubmissions(embedding, questionId, limit = 5, minSimilarity = 0.7) {
  const result = await query(
    `SELECT 
      s.id,
      s.student_id,
      s.question_id,
      s.code,
      1 - (sv.embedding <=> $1::vector) as similarity
    FROM submission_vectors sv
    JOIN submissions s ON s.id = sv.submission_id
    WHERE s.question_id = $2
      AND 1 - (sv.embedding <=> $1::vector) >= $3
    ORDER BY sv.embedding <=> $1::vector
    LIMIT $4`,
    [pgvector.toSql(embedding), questionId, minSimilarity, limit]
  );
  
  return result.rows;
}

/**
 * Find similar chunks across all submissions
 * @param {Array<number>} embedding - Query embedding vector
 * @param {string} questionId - Question to search within
 * @param {number} limit - Number of results to return
 * @param {number} minSimilarity - Minimum similarity threshold (0-1)
 * @returns {Promise<Array>} Similar chunks with scores
 */
export async function findSimilarChunks(embedding, questionId, limit = 10, minSimilarity = 0.75) {
  const result = await query(
    `SELECT 
      s.id as submission_id,
      s.student_id,
      s.question_id,
      sc.chunk_index,
      sc.chunk_text,
      1 - (sc.embedding <=> $1::vector) as similarity
    FROM submission_chunks sc
    JOIN submissions s ON s.id = sc.submission_id
    WHERE s.question_id = $2
      AND 1 - (sc.embedding <=> $1::vector) >= $3
    ORDER BY sc.embedding <=> $1::vector
    LIMIT $4`,
    [pgvector.toSql(embedding), questionId, minSimilarity, limit]
  );
  
  return result.rows;
}

/**
 * Get submission by ID
 * @param {number} submissionId - Submission ID
 * @returns {Promise<Object|null>} Submission data
 */
export async function getSubmission(submissionId) {
  const result = await query(
    'SELECT * FROM submissions WHERE id = $1',
    [submissionId]
  );
  return result.rows[0] || null;
}

/**
 * Get all submissions for a question
 * @param {string} questionId - Question ID
 * @returns {Promise<Array>} All submissions
 */
export async function getSubmissionsByQuestion(questionId) {
  const result = await query(
    'SELECT * FROM submissions WHERE question_id = $1 ORDER BY created_at DESC',
    [questionId]
  );
  return result.rows;
}

/**
 * Close the database connection pool
 */
export async function closePool() {
  await pool.end();
}

export default {
  query,
  saveSubmission,
  saveSubmissionVector,
  saveSubmissionChunks,
  findSimilarSubmissions,
  findSimilarChunks,
  getSubmission,
  getSubmissionsByQuestion,
  closePool,
};

