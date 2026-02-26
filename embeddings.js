/**
 * OpenAI Embeddings Module
 * Generates vector embeddings for code using OpenAI's API
 * FIXED: Added retry logic, validation, and error handling to prevent 0 scores
 * ENHANCED: Added code normalization for better variable renaming detection
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';
import * as codeNormalizer from './codeNormalizer.js';

dotenv.config();

// Embedding model configuration
export const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dimensions
export const EMBEDDING_DIMENSIONS = 1536;

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Cache for default OpenAI client (lazy initialization)
let defaultOpenai = null;

/**
 * Get OpenAI client with custom or default API key
 * @param {string} customApiKey - Optional custom API key
 * @returns {OpenAI} OpenAI client instance
 */
function getOpenAIClient(customApiKey) {
  if (customApiKey) {
    return new OpenAI({ apiKey: customApiKey });
  }
  
  // Lazy initialization of default client
  if (!defaultOpenai) {
    const serverApiKey = process.env.OPENAI_API_KEY;
    if (!serverApiKey) {
      throw new Error(
        'OpenAI API key is required. Either:\n' +
        '1. Set OPENAI_API_KEY in your .env file, OR\n' +
        '2. Provide a custom API key via the x-openai-api-key header in your request'
      );
    }
    defaultOpenai = new OpenAI({ apiKey: serverApiKey });
  }
  
  return defaultOpenai;
}

/**
 * Validate embedding vector
 * @param {Array<number>} embedding - Embedding vector to validate
 * @returns {boolean} True if valid
 */
function isValidEmbedding(embedding) {
  if (!embedding || !Array.isArray(embedding)) {
    console.error('[Embeddings Validation] Embedding is not an array');
    return false;
  }
  
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    console.error(`[Embeddings Validation] Wrong dimensions: ${embedding.length}, expected ${EMBEDDING_DIMENSIONS}`);
    return false;
  }
  
  // Check if all values are 0 (invalid)
  const allZero = embedding.every(val => val === 0);
  if (allZero) {
    console.error('[Embeddings Validation] All values are 0 - invalid embedding');
    return false;
  }
  
  // Check if any values are NaN or Infinity
  const hasInvalid = embedding.some(val => !isFinite(val));
  if (hasInvalid) {
    console.error('[Embeddings Validation] Contains NaN or Infinity values');
    return false;
  }
  
  // Calculate magnitude to ensure vector is meaningful
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude < 0.0001) {
    console.error('[Embeddings Validation] Vector magnitude too small');
    return false;
  }
  
  return true;
}

/**
 * Sleep utility for retries
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate embedding for a single text with retry logic
 * @param {string} text - Text to embed
 * @param {string} customApiKey - Optional custom API key
 * @returns {Promise<Array<number>>} Embedding vector (1536 dimensions)
 */
export async function generateEmbedding(text, customApiKey = null) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Normalize text: remove excessive whitespace and normalize line endings
      const normalizedText = text.trim().replace(/\s+/g, ' ');
      
      if (!normalizedText) {
        throw new Error('Cannot generate embedding for empty text');
      }
      
      console.log(`[Embeddings] Generating embedding (attempt ${attempt}/${MAX_RETRIES}, ${normalizedText.length} chars)`);
      
      const client = getOpenAIClient(customApiKey);
      
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: normalizedText,
        encoding_format: 'float',
      });
      
      if (!response || !response.data || !response.data[0]) {
        throw new Error('Invalid response from OpenAI API');
      }
      
      const embedding = response.data[0].embedding;
      
      // Validate embedding
      if (!isValidEmbedding(embedding)) {
        throw new Error('Generated embedding failed validation');
      }
      
      console.log(`[Embeddings] Successfully generated valid embedding (attempt ${attempt})`);
      return embedding;
      
    } catch (error) {
      lastError = error;
      console.error(`[Embeddings Error] Attempt ${attempt}/${MAX_RETRIES} failed:`, error.message);
      
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt; // Exponential backoff
        console.log(`[Embeddings] Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  
  // All retries failed
  console.error('[Embeddings] All retry attempts exhausted');
  throw new Error(`Failed to generate valid embedding after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

/**
 * Generate embeddings for multiple texts in batch with validation
 * @param {Array<string>} texts - Array of texts to embed
 * @param {string} customApiKey - Optional custom API key
 * @returns {Promise<Array<Array<number>>>} Array of embedding vectors
 */
export async function generateEmbeddingsBatch(texts, customApiKey = null) {
  try {
    if (!texts || texts.length === 0) {
      return [];
    }
    
    // Filter out empty texts
    const validTexts = texts.filter(t => t && t.trim().length > 0);
    
    if (validTexts.length === 0) {
      return [];
    }
    
    // Normalize texts
    const normalizedTexts = validTexts.map(text => 
      text.trim().replace(/\s+/g, ' ')
    );
    
    console.log(`[Embeddings] Generating ${normalizedTexts.length} embeddings in batch`);
    
    const client = getOpenAIClient(customApiKey);
    
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: normalizedTexts,
      encoding_format: 'float',
    });
    
    if (!response || !response.data) {
      throw new Error('Invalid batch response from OpenAI API');
    }
    
    const embeddings = response.data.map(item => item.embedding);
    
    // Validate all embeddings
    const validatedEmbeddings = [];
    for (let i = 0; i < embeddings.length; i++) {
      if (!isValidEmbedding(embeddings[i])) {
        console.warn(`[Embeddings] Embedding ${i} failed validation, regenerating...`);
        // Regenerate individual embedding
        const singleEmbedding = await generateEmbedding(normalizedTexts[i], customApiKey);
        validatedEmbeddings.push(singleEmbedding);
      } else {
        validatedEmbeddings.push(embeddings[i]);
      }
    }
    
    console.log(`[Embeddings] Successfully generated ${validatedEmbeddings.length} valid embeddings`);
    return validatedEmbeddings;
    
  } catch (error) {
    console.error('[Embeddings Batch Error]', error.message);
    throw new Error(`Failed to generate batch embeddings: ${error.message}`);
  }
}

/**
 * Generate embedding for code with semantic preprocessing
 * ENHANCED: Now includes normalized code to better detect variable renaming
 * @param {string} code - Code text
 * @param {string} language - Programming language (e.g., 'javascript', 'python')
 * @param {string} customApiKey - Optional custom API key
 * @returns {Promise<Array<number>>} Embedding vector
 */
export async function generateCodeEmbedding(code, language = 'javascript', customApiKey = null, useNormalization = true) {
  let contextualizedCode;
  
  if (useNormalization) {
    // Normalize code to reduce impact of variable names
    const normalizedCode = codeNormalizer.normalizeCode(code, language);
    const semanticSig = codeNormalizer.createSemanticSignature(code, language);
    
    // Create enhanced context that includes:
    // 1. Language context
    // 2. Normalized code (generic variable names)
    // 3. Semantic signature (structural pattern)
    // 4. Original code (for exact matches)
    contextualizedCode = `${language} code:
Normalized: ${normalizedCode}
Structure: ${semanticSig}
Original: ${code}`;
    
    console.log(`[Embeddings] Using enhanced normalization for ${language} code`);
  } else {
    // Use original code only (no normalization)
    contextualizedCode = `${language} code:\n${code}`;
    console.log(`[Embeddings] Using original code (normalization disabled) for ${language} code`);
  }
  
  return generateEmbedding(contextualizedCode, customApiKey);
}

/**
 * Generate embeddings for code chunks with context and normalization
 * ENHANCED: Includes normalized versions for better matching
 * @param {Array<Object>} chunks - Array of {index, text} objects
 * @param {string} language - Programming language
 * @param {string} customApiKey - Optional custom API key
 * @returns {Promise<Array<Object>>} Array of {index, text, embedding} objects
 */
export async function generateChunkEmbeddings(chunks, language = 'javascript', customApiKey = null, useNormalization = true) {
  if (!chunks || chunks.length === 0) {
    return [];
  }
  
  console.log(`[Embeddings] Generating embeddings for ${chunks.length} chunks (normalization: ${useNormalization ? 'ON' : 'OFF'})`);
  
  let contextualizedTexts;
  
  if (useNormalization) {
    // Add context and normalization to each chunk
    contextualizedTexts = chunks.map(chunk => {
      const normalizedChunk = codeNormalizer.normalizeCode(chunk.text, language);
      return `${language} code:\nNormalized: ${normalizedChunk}\nOriginal: ${chunk.text}`;
    });
  } else {
    // Use original text only
    contextualizedTexts = chunks.map(chunk => `${language} code:\n${chunk.text}`);
  }
  
  // Generate embeddings in batch for efficiency
  const embeddings = await generateEmbeddingsBatch(contextualizedTexts, customApiKey);
  
  // Combine chunks with their embeddings
  const chunksWithEmbeddings = chunks.map((chunk, i) => ({
    index: chunk.index,
    text: chunk.text,
    embedding: embeddings[i],
  }));
  
  return chunksWithEmbeddings;
}

/**
 * Calculate cosine similarity between two embeddings
 * FIXED: Added validation to prevent 0 results from invalid vectors
 * @param {Array<number>} embedding1 - First embedding vector
 * @param {Array<number>} embedding2 - Second embedding vector
 * @returns {number} Cosine similarity (0-1, higher is more similar)
 */
export function cosineSimilarity(embedding1, embedding2) {
  // Validate inputs
  if (!isValidEmbedding(embedding1) || !isValidEmbedding(embedding2)) {
    console.error('[Cosine Similarity] Invalid embedding vectors provided');
    throw new Error('Cannot calculate similarity with invalid embedding vectors');
  }
  
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same dimensions');
  }
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }
  
  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);
  
  if (norm1 === 0 || norm2 === 0) {
    console.error('[Cosine Similarity] Zero magnitude vector detected');
    throw new Error('Cannot calculate similarity with zero-magnitude vectors');
  }
  
  const similarity = dotProduct / (norm1 * norm2);
  
  // Clamp to [0, 1] range (cosine similarity can be -1 to 1, but for code similarity we use 0-1)
  return Math.max(0, Math.min(1, similarity));
}

export default {
  generateEmbedding,
  generateEmbeddingsBatch,
  generateCodeEmbedding,
  generateChunkEmbeddings,
  cosineSimilarity,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
};
