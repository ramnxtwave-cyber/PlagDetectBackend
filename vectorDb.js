/**
 * Vector Database Module - Pinecone
 * Handles vector storage and similarity search using Pinecone cloud vector DB
 * No local database setup required!
 */

import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

dotenv.config();

const INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'plagiarism-detector';
let pinecone = null;
let index = null;

/**
 * Get or create Pinecone client (lazy initialization)
 */
function getPineconeClient() {
  if (!pinecone) {
    const apiKey = process.env.PINECONE_API_KEY ?? 'pcsk_69ch9a_RPQLUArtXyReUKk87f7grMHiBzmz2EBWoqhENNJFufkbCPJ4DWJ9hrfq1DzcDXN';
    
    if (!apiKey || apiKey === 'your_pinecone_api_key_here') {
      throw new Error(
        'Pinecone API key is not configured. Please set PINECONE_API_KEY in your .env file. ' +
        'Get your free API key from https://www.pinecone.io/'
      );
    }
    
    pinecone = new Pinecone({ apiKey });
    console.log('[Pinecone] Client initialized');
  }
  
  return pinecone;
}

/**
 * Initialize Pinecone index
 */
export async function initializeIndex() {
  try {
    const client = getPineconeClient();
    index = client.index(INDEX_NAME);
    console.log(`[Pinecone] Connected to index: ${INDEX_NAME}`);
    return true;
  } catch (error) {
    console.error('[Pinecone Init Error]', error.message);
    console.warn('[Pinecone] Server will start but vector operations will fail until API key is configured');
    return false;
  }
}

/**
 * Save submission with embedding
 * @param {Object} data - { submissionId, studentId, questionId, code, embedding, chunks }
 */
export async function saveSubmission(data) {
  const { submissionId, studentId, questionId, code, embedding, chunks } = data;
  
  try {
    if (!index) {
      throw new Error('Pinecone index not initialized. Please configure PINECONE_API_KEY in .env file.');
    }
    
    const vectors = [];
    
    // Store whole-submission vector
    vectors.push({
      id: `sub_${submissionId}`,
      values: embedding,
      metadata: {
        type: 'submission',
        submissionId: submissionId,
        studentId: studentId,
        questionId: questionId,
        code: code.substring(0, 1000), // Pinecone metadata limit
        codeLength: code.length,
        timestamp: Date.now()
      }
    });
    
    // Store chunk vectors
    if (chunks && chunks.length > 0) {
      chunks.forEach((chunk, idx) => {
        vectors.push({
          id: `sub_${submissionId}_chunk_${idx}`,
          values: chunk.embedding,
          metadata: {
            type: 'chunk',
            submissionId: submissionId,
            studentId: studentId,
            questionId: questionId,
            chunkIndex: idx,
            chunkText: chunk.text.substring(0, 1000),
            timestamp: Date.now()
          }
        });
      });
    }
    
    // Upsert to Pinecone
    await index.upsert(vectors);
    console.log(`[Pinecone] Saved submission ${submissionId} with ${chunks.length} chunks`);
    
    return submissionId;
  } catch (error) {
    console.error('[Pinecone Save Error]', error.message);
    throw error;
  }
}

/**
 * Find similar submissions
 * @param {Array<number>} embedding - Query embedding vector
 * @param {string} questionId - Question to search within
 * @param {number} limit - Number of results
 * @param {number} minSimilarity - Minimum similarity threshold
 */
export async function findSimilarSubmissions(embedding, questionId, limit = 5, minSimilarity = 0.3) {
  try {
    if (!index) {
      throw new Error('Pinecone index not initialized. Please configure PINECONE_API_KEY in .env file.');
    }
    
    const queryResponse = await index.query({
      vector: embedding,
      topK: 100, // Get more results
      filter: {
        type: { $eq: 'submission' },
        questionId: { $eq: questionId }
      },
      includeMetadata: true
    });
    
    // Return ALL results above minSimilarity (even if low)
    // Scoring engine will handle the actual threshold filtering
    const results = queryResponse.matches
      .filter(match => match.score >= minSimilarity)
      .slice(0, limit)
      .map(match => ({
        id: match.metadata.submissionId,
        student_id: match.metadata.studentId,
        question_id: match.metadata.questionId,
        code: match.metadata.code,
        similarity: match.score
      }));
    
    console.log(`[Pinecone] Found ${results.length} submissions (threshold: ${minSimilarity})`);
    if (results.length > 0) {
      console.log(`[Pinecone] Top similarity: ${(results[0].similarity * 100).toFixed(1)}%`);
    }
    return results;
  } catch (error) {
    console.error('[Pinecone Search Error]', error.message);
    throw error;
  }
}

/**
 * Find similar chunks
 * @param {Array<number>} embedding - Query embedding vector
 * @param {string} questionId - Question to search within
 * @param {number} limit - Number of results
 * @param {number} minSimilarity - Minimum similarity threshold
 */
export async function findSimilarChunks(embedding, questionId, limit = 10, minSimilarity = 0.75) {
  try {
    if (!index) {
      throw new Error('Pinecone index not initialized. Please configure PINECONE_API_KEY in .env file.');
    }
    
    const queryResponse = await index.query({
      vector: embedding,
      topK: 100,
      filter: {
        type: { $eq: 'chunk' },
        questionId: { $eq: questionId }
      },
      includeMetadata: true
    });
    
    const results = queryResponse.matches
      .filter(match => match.score >= minSimilarity)
      .slice(0, limit)
      .map(match => ({
        submission_id: match.metadata.submissionId,
        student_id: match.metadata.studentId,
        question_id: match.metadata.questionId,
        chunk_index: match.metadata.chunkIndex,
        chunk_text: match.metadata.chunkText,
        similarity: match.score
      }));
    
    console.log(`[Pinecone] Found ${results.length} similar chunks`);
    return results;
  } catch (error) {
    console.error('[Pinecone Chunk Search Error]', error.message);
    throw error;
  }
}

/**
 * Get all submissions for a question
 */
export async function getSubmissionsByQuestion(questionId) {
  try {
    if (!index) {
      throw new Error('Pinecone index not initialized. Please configure PINECONE_API_KEY in .env file.');
    }

    const normalizedQuestionId = questionId?.trim?.();
    if (!normalizedQuestionId) {
      throw new Error('Question ID is required');
    }

    // Pinecone query vectors cannot be all zeros. Use a tiny non-zero probe
    // vector only to retrieve matches filtered by questionId.
    const probeVector = Array(1536).fill(0);
    probeVector[0] = 0.001;
    
    const queryResponse = await index.query({
      vector: probeVector,
      topK: 1000,
      filter: {
        type: { $eq: 'submission' },
        questionId: { $eq: normalizedQuestionId }
      },
      includeMetadata: true
    });
    
    return queryResponse.matches.map(match => ({
      id: match.metadata.submissionId,
      student_id: match.metadata.studentId,
      question_id: match.metadata.questionId,
      code: match.metadata.code,
      created_at: new Date(match.metadata.timestamp)
    }));
  } catch (error) {
    console.error('[Pinecone Get Error]', error.message);
    throw new Error(`[Pinecone Get Error] ${error.message}`);
  }
}

/**
 * Get submission by ID
 */
export async function getSubmission(submissionId) {
  try {
    if (!index) {
      throw new Error('Pinecone index not initialized. Please configure PINECONE_API_KEY in .env file.');
    }
    
    const fetchResponse = await index.fetch([`sub_${submissionId}`]);
    
    if (!fetchResponse.records || Object.keys(fetchResponse.records).length === 0) {
      return null;
    }
    
    const record = fetchResponse.records[`sub_${submissionId}`];
    
    return {
      id: record.metadata.submissionId,
      student_id: record.metadata.studentId,
      question_id: record.metadata.questionId,
      code: record.metadata.code,
      created_at: new Date(record.metadata.timestamp)
    };
  } catch (error) {
    console.error('[Pinecone Fetch Error]', error.message);
    return null;
  }
}

export default {
  initializeIndex,
  saveSubmission,
  findSimilarSubmissions,
  findSimilarChunks,
  getSubmissionsByQuestion,
  getSubmission
};
