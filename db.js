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

// Railway provides both private (internal) and public URLs
// Prefer DATABASE_PUBLIC_URL for better reliability, fallback to DATABASE_URL
const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;

if (databaseUrl) {
  // Railway/Heroku style - use connection string
  const urlType = process.env.DATABASE_PUBLIC_URL ? 'DATABASE_PUBLIC_URL' : 'DATABASE_URL';
  console.log(`[DB] Using ${urlType} connection string`);
  
  // Check if using internal hostname (Railway private network)
  if (databaseUrl.includes('railway.internal')) {
    console.log('[DB] ⚠️  Using Railway internal hostname - only works within Railway network');
  }
  
  poolConfig = {
    connectionString: databaseUrl,
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
    console.log('[DB] 🔄 Testing database connection...');
    console.log('[DB] Environment check:');
    console.log('[DB]   DATABASE_PUBLIC_URL:', process.env.DATABASE_PUBLIC_URL ? 'SET ✓' : 'NOT SET');
    console.log('[DB]   DATABASE_URL:', process.env.DATABASE_URL ? 'SET ✓' : 'NOT SET');
    
    if (!process.env.DATABASE_PUBLIC_URL && !process.env.DATABASE_URL) {
      console.log('[DB] Fallback config:', {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'plagiarism_db',
        user: process.env.DB_USER || 'postgres'
      });
    }
    
    const client = await pool.connect();
    console.log('[DB] ✅ Database connection successful');
    const result = await client.query('SELECT NOW()');
    console.log('[DB] Server time:', result.rows[0].now);
    
    // Check if pgvector extension is installed
    const vectorCheck = await client.query(
      "SELECT * FROM pg_extension WHERE extname = 'vector'"
    );
    if (vectorCheck.rows.length > 0) {
      console.log('[DB] ✅ pgvector extension is installed');
    } else {
      console.warn('[DB] ⚠️  pgvector extension NOT found - you may need to run: CREATE EXTENSION vector;');
    }
    
    client.release();
  } catch (err) {
    console.error('[DB] ❌ Database connection failed:', err.message);
    console.error('[DB] Error code:', err.code);
    
    if (err.code === 'ECONNREFUSED') {
      console.error('[DB] ⚠️  CONNECTION REFUSED - Database server is not accessible');
      console.error('[DB] 💡 On Railway: Make sure you have added a PostgreSQL database to your project');
      console.error('[DB] 💡 Check that DATABASE_URL environment variable is set in Railway dashboard');
    } else if (err.code === 'ENOTFOUND') {
      console.error('[DB] ⚠️  HOSTNAME NOT FOUND - Cannot resolve database hostname');
      if (err.message.includes('railway.internal')) {
        console.error('[DB] 💡 SOLUTION: Use DATABASE_PUBLIC_URL instead of DATABASE_URL in Railway');
        console.error('[DB] 💡 In Railway dashboard:');
        console.error('[DB]    1. Go to your PostgreSQL database → Variables/Connect tab');
        console.error('[DB]    2. Copy the DATABASE_PUBLIC_URL (should contain .railway.app)');
        console.error('[DB]    3. Go to your backend service → Variables tab');
        console.error('[DB]    4. Update DATABASE_URL to use DATABASE_PUBLIC_URL');
      }
    }
    
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

