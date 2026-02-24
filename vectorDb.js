/**
 * Vector Database Module - Pinecone
 * Handles vector storage and similarity search using Pinecone cloud vector DB
 * No local database setup required!
 */

import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

const INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'plagiarism-detector';
let index = null;

/**
 * Initialize Pinecone index
 */
export async function initializeIndex() {
  try {
    index = pinecone.index(INDEX_NAME);
    console.log(`[Pinecone] Connected to index: ${INDEX_NAME}`);
    return true;
  } catch (error) {
    console.error('[Pinecone Init Error]', error.message);
    throw new Error(`Failed to initialize Pinecone: ${error.message}`);
  }
}

/**
 * Save submission with embedding
 * @param {Object} data - { submissionId, studentId, questionId, code, embedding, chunks }
 */
export async function saveSubmission(data) {
  const { submissionId, studentId, questionId, code, embedding, chunks } = data;
  
  try {
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
export async function findSimilarSubmissions(embedding, questionId, limit = 5, minSimilarity = 0.7) {
  try {
    const queryResponse = await index.query({
      vector: embedding,
      topK: 50,
      filter: {
        type: { $eq: 'submission' },
        questionId: { $eq: questionId }
      },
      includeMetadata: true
    });
    
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
    
    console.log(`[Pinecone] Found ${results.length} similar submissions`);
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
    const queryResponse = await index.query({
      vector: Array(1536).fill(0),
      topK: 10000,
      filter: {
        type: { $eq: 'submission' },
        questionId: { $eq: questionId }
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
    return [];
  }
}

/**
 * Get submission by ID
 */
export async function getSubmission(submissionId) {
  try {
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
