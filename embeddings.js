/**
 * OpenAI Embeddings Module
 * Generates vector embeddings for code using OpenAI's API
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// Embedding model configuration
export const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dimensions
export const EMBEDDING_DIMENSIONS = 1536;

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
 * Generate embedding for a single text
 * @param {string} text - Text to embed
 * @param {string} customApiKey - Optional custom API key
 * @returns {Promise<Array<number>>} Embedding vector (1536 dimensions)
 */
export async function generateEmbedding(text, customApiKey = null) {
  try {
    // Normalize text: remove excessive whitespace and normalize line endings
    const normalizedText = text.trim().replace(/\s+/g, ' ');
    
    if (!normalizedText) {
      throw new Error('Cannot generate embedding for empty text');
    }
    
    console.log(`[Embeddings] Generating embedding for text (${normalizedText.length} chars)`);
    
    const client = getOpenAIClient(customApiKey);
    
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: normalizedText,
      encoding_format: 'float',
    });
    
    const embedding = response.data[0].embedding;
    
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Expected ${EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length}`);
    }
    
    console.log(`[Embeddings] Successfully generated embedding`);
    return embedding;
  } catch (error) {
    console.error('[Embeddings Error]', error.message);
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

/**
 * Generate embeddings for multiple texts in batch
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
    
    const embeddings = response.data.map(item => item.embedding);
    
    console.log(`[Embeddings] Successfully generated ${embeddings.length} embeddings`);
    return embeddings;
  } catch (error) {
    console.error('[Embeddings Batch Error]', error.message);
    throw new Error(`Failed to generate batch embeddings: ${error.message}`);
  }
}

/**
 * Generate embedding for code with semantic preprocessing
 * Adds context to help the model understand it's code
 * @param {string} code - Code text
 * @param {string} language - Programming language (e.g., 'javascript', 'python')
 * @param {string} customApiKey - Optional custom API key
 * @returns {Promise<Array<number>>} Embedding vector
 */
export async function generateCodeEmbedding(code, language = 'javascript', customApiKey = null) {
  // Add semantic context to help the model understand this is code
  // This can improve the quality of embeddings for code similarity
  const contextualizedCode = `${language} code:\n${code}`;
  return generateEmbedding(contextualizedCode, customApiKey);
}

/**
 * Generate embeddings for code chunks with context
 * @param {Array<Object>} chunks - Array of {index, text} objects
 * @param {string} language - Programming language
 * @param {string} customApiKey - Optional custom API key
 * @returns {Promise<Array<Object>>} Array of {index, text, embedding} objects
 */
export async function generateChunkEmbeddings(chunks, language = 'javascript', customApiKey = null) {
  if (!chunks || chunks.length === 0) {
    return [];
  }
  
  console.log(`[Embeddings] Generating embeddings for ${chunks.length} chunks`);
  
  // Add context to each chunk
  const contextualizedTexts = chunks.map(chunk => 
    `${language} code:\n${chunk.text}`
  );
  
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
 * Note: In production, pgvector handles this, but this is useful for testing
 * @param {Array<number>} embedding1 - First embedding vector
 * @param {Array<number>} embedding2 - Second embedding vector
 * @returns {number} Cosine similarity (0-1, higher is more similar)
 */
export function cosineSimilarity(embedding1, embedding2) {
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
    return 0;
  }
  
  return dotProduct / (norm1 * norm2);
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

