/**
 * Semantic Code Plagiarism Detection System
 * Main Express Server with API Endpoints
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Import modules
import * as db from './db.js';
import * as embeddings from './embeddings.js';
import * as chunking from './chunking.js';
import * as externalPlagiarism from './externalPlagiarismService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - Configure CORS for production
app.use(cors({
  origin: '*', // Allow all origins (adjust in production)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-OpenAI-API-Key'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' })); // Support large code submissions

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'semantic-plagiarism-detector',
    model: embeddings.EMBEDDING_MODEL,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/submit
 * Submit code and generate embeddings
 * 
 * Request Body:
 * {
 *   "code": "function foo() { ... }",
 *   "studentId": "student123",
 *   "questionId": "q1",
 *   "language": "javascript" (optional, defaults to "javascript")
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "submissionId": 42,
 *   "chunkCount": 3,
 *   "message": "Submission processed successfully"
 * }
 */
app.post('/api/submit', async (req, res) => {
  try {
    const { code, studentId, questionId, language = 'javascript' } = req.body;
    
    // Get custom API key from header if provided
    const customApiKey = req.headers['x-openai-api-key'] || null;
    
    // Validate input
    if (!code || !studentId || !questionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: code, studentId, questionId',
      });
    }
    
    if (code.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Code cannot be empty',
      });
    }
    
    console.log(`[Submit] Processing submission from ${studentId} for question ${questionId}`);
    if (customApiKey) {
      console.log(`[Submit] Using custom API key`);
    }
    
    // Step 1: Save submission to database
    const submissionId = await db.saveSubmission(studentId, questionId, code);
    console.log(`[Submit] Saved submission with ID: ${submissionId}`);
    
    // Step 2: Generate whole-code embedding (with custom API key if provided)
    const wholeCodeEmbedding = await embeddings.generateCodeEmbedding(code, language, customApiKey);
    await db.saveSubmissionVector(submissionId, wholeCodeEmbedding);
    console.log(`[Submit] Saved whole-code embedding`);
    
    // Step 3: Extract and embed chunks
    const codeChunks = chunking.extractCodeChunks(code, language);
    console.log(`[Submit] Extracted ${codeChunks.length} chunks`);
    
    if (codeChunks.length > 0) {
      const chunksWithEmbeddings = await embeddings.generateChunkEmbeddings(codeChunks, language, customApiKey);
      await db.saveSubmissionChunks(submissionId, chunksWithEmbeddings);
      console.log(`[Submit] Saved ${chunksWithEmbeddings.length} chunk embeddings`);
    }
    
    const chunkStats = chunking.getChunkStats(codeChunks);
    
    res.json({
      success: true,
      submissionId,
      chunkCount: codeChunks.length,
      chunkStats,
      message: 'Submission processed successfully',
    });
    
  } catch (error) {
    console.error('[Submit Error]', error);
    
    // Check if it's an OpenAI API quota/key error
    if (error.message && error.message.includes('quota')) {
      return res.status(402).json({
        success: false,
        error: 'OpenAI API quota exceeded. Please provide a valid API key with available credits using the "OpenAI API Key" field in the frontend.',
        errorType: 'QUOTA_EXCEEDED'
      });
    }
    
    if (error.message && error.message.includes('API key')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or missing OpenAI API key. Please provide a valid API key using the "OpenAI API Key" field in the frontend.',
        errorType: 'INVALID_API_KEY'
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

/**
 * POST /api/check
 * Check code for similarity with existing submissions
 * 
 * Request Body:
 * {
 *   "code": "function foo() { ... }",
 *   "questionId": "q1",
 *   "language": "javascript" (optional),
 *   "similarityThreshold": 0.75 (optional, 0-1),
 *   "maxResults": 5 (optional)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "similarSubmissions": [...],
 *   "similarChunks": [...],
 *   "summary": { ... }
 * }
 */
app.post('/api/check', async (req, res) => {
  try {
    const { 
      code, 
      questionId, 
      language = 'javascript',
      similarityThreshold = 0.75,
      maxResults = 5,
    } = req.body;
    
    // Get custom API key from header if provided
    const customApiKey = req.headers['x-openai-api-key'] || null;
    
    // Validate input
    if (!code || !questionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: code, questionId',
      });
    }
    
    if (code.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Code cannot be empty',
      });
    }
    
    console.log(`[Check] Checking similarity for question ${questionId}`);
    if (customApiKey) {
      console.log(`[Check] Using custom API key`);
    }
    
    // Step 1: Generate embedding for the submitted code (with custom API key if provided)
    const codeEmbedding = await embeddings.generateCodeEmbedding(code, language, customApiKey);
    console.log(`[Check] Generated embedding for submission`);
    
    // Step 2: Find similar whole submissions
    const similarSubmissions = await db.findSimilarSubmissions(
      codeEmbedding,
      questionId,
      maxResults,
      similarityThreshold
    );
    console.log(`[Check] Found ${similarSubmissions.length} similar submissions`);
    
    // Step 3: Extract and check chunks
    const codeChunks = chunking.extractCodeChunks(code, language);
    console.log(`[Check] Extracted ${codeChunks.length} chunks from query code`);
    
    let similarChunks = [];
    if (codeChunks.length > 0) {
      // Generate embeddings for chunks (with custom API key if provided)
      const queryChunksWithEmbeddings = await embeddings.generateChunkEmbeddings(codeChunks, language, customApiKey);
      
      // Find similar chunks for each query chunk
      const chunkSimilarityPromises = queryChunksWithEmbeddings.map(async (chunk) => {
        const matches = await db.findSimilarChunks(
          chunk.embedding,
          questionId,
          5, // Top 5 per chunk
          similarityThreshold
        );
        
        return matches.map(match => ({
          ...match,
          query_chunk_index: chunk.index,
          query_chunk_text: chunk.text,
        }));
      });
      
      const chunkResults = await Promise.all(chunkSimilarityPromises);
      similarChunks = chunkResults.flat();
      
      // Sort by similarity and deduplicate
      similarChunks.sort((a, b) => b.similarity - a.similarity);
      console.log(`[Check] Found ${similarChunks.length} similar chunks`);
    }
    
    // Step 4: Build response with summary
    const uniqueMatchedSubmissions = new Set(
      [...similarSubmissions.map(s => s.id), ...similarChunks.map(c => c.submission_id)]
    );
    
    const highSimilaritySubmissions = similarSubmissions.filter(s => s.similarity >= 0.85);
    const moderateSimilaritySubmissions = similarSubmissions.filter(
      s => s.similarity >= 0.75 && s.similarity < 0.85
    );
    
    const summary = {
      totalMatchedSubmissions: uniqueMatchedSubmissions.size,
      highSimilarity: highSimilaritySubmissions.length,
      moderateSimilarity: moderateSimilaritySubmissions.length,
      matchedChunks: similarChunks.length,
      maxSimilarity: similarSubmissions.length > 0 ? similarSubmissions[0].similarity : 0,
      threshold: similarityThreshold,
    };
    
    // Format response (limit code length in response)
    const formatSubmission = (sub) => ({
      submissionId: sub.id,
      studentId: sub.student_id,
      similarity: Math.round(sub.similarity * 1000) / 1000, // Round to 3 decimals
      codePreview: sub.code.substring(0, 200) + (sub.code.length > 200 ? '...' : ''),
      codeLength: sub.code.length,
    });
    
    const formatChunk = (chunk) => ({
      submissionId: chunk.submission_id,
      studentId: chunk.student_id,
      similarity: Math.round(chunk.similarity * 1000) / 1000,
      queryChunkIndex: chunk.query_chunk_index,
      queryChunkPreview: chunk.query_chunk_text?.substring(0, 150) + 
        (chunk.query_chunk_text?.length > 150 ? '...' : ''),
      matchedChunkText: chunk.chunk_text?.substring(0, 150) +
        (chunk.chunk_text?.length > 150 ? '...' : ''),
      matchedChunkIndex: chunk.chunk_index,
    });
    
    // Step 5: Call external plagiarism API (if similar submissions found)
    let externalResult = null;
    let finalDecision = null;
    
    if (similarSubmissions.length > 0) {
      console.log(`[Check] Calling external plagiarism API...`);
      
      try {
        // Prepare data for external API
        const externalCheckData = {
          questionId: questionId,
          currentSubmission: {
            studentId: 'current_check', // Placeholder since this is a check, not a saved submission
            submissionId: 'temp_' + Date.now(),
            code: code
          },
          pastSubmissions: similarSubmissions.slice(0, 5).map(sub => ({
            studentId: sub.student_id,
            submissionId: sub.id.toString(),
            code: sub.code
          }))
        };
        
        // Call external API (non-blocking - won't fail if API is down)
        const externalApiResult = await externalPlagiarism.checkExternalPlagiarism(externalCheckData);
        externalResult = externalPlagiarism.formatExternalResult(externalApiResult);
        
        // Determine final decision based on both local and external results
        const localResultForDecision = {
          similarSubmissions: similarSubmissions,
          summary: summary
        };
        
        finalDecision = externalPlagiarism.determineFinalDecision(
          localResultForDecision,
          externalResult,
          0.85 // High confidence threshold
        );
        
        console.log(`[Check] Final decision: ${finalDecision.decision} (confidence: ${finalDecision.confidence})`);
        
      } catch (error) {
        console.error('[Check] External API call failed:', error.message);
        externalResult = {
          available: false,
          error: error.message,
          matches: []
        };
      }
    } else {
      console.log(`[Check] No local matches found, skipping external API call`);
      externalResult = {
        available: false,
        skipped: true,
        reason: 'No local matches to verify',
        matches: []
      };
      
      finalDecision = {
        decision: 'NO_PLAGIARISM',
        confidence: 0.95,
        reasons: ['No similar submissions found in local database'],
        localMatchCount: 0,
        externalMatchCount: 0,
        externalApiAvailable: false
      };
    }
    
    // Build combined response
    res.json({
      success: true,
      
      // Local results (existing)
      local_result: {
        summary,
        similarSubmissions: similarSubmissions.slice(0, maxResults).map(formatSubmission),
        similarChunks: similarChunks.slice(0, 10).map(formatChunk),
      },
      
      // External API results (new)
      external_result: externalResult,
      
      // Final decision (new)
      final_decision: finalDecision,
      
      // Backward compatibility - keep original structure
      summary,
      similarSubmissions: similarSubmissions.slice(0, maxResults).map(formatSubmission),
      similarChunks: similarChunks.slice(0, 10).map(formatChunk),
      
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('[Check Error]', error);
    
    // Check if it's an OpenAI API quota/key error
    if (error.message && error.message.includes('quota')) {
      return res.status(402).json({
        success: false,
        error: 'OpenAI API quota exceeded. Please provide a valid API key with available credits using the "OpenAI API Key" field in the frontend.',
        errorType: 'QUOTA_EXCEEDED'
      });
    }
    
    if (error.message && error.message.includes('API key')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or missing OpenAI API key. Please provide a valid API key using the "OpenAI API Key" field in the frontend.',
        errorType: 'INVALID_API_KEY'
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

/**
 * GET /api/submissions/:questionId
 * Get all submissions for a question
 */
app.get('/api/submissions/:questionId', async (req, res) => {
  try {
    const { questionId } = req.params;
    const submissions = await db.getSubmissionsByQuestion(questionId);
    
    res.json({
      success: true,
      questionId,
      count: submissions.length,
      submissions: submissions.map(s => ({
        id: s.id,
        studentId: s.student_id,
        codeLength: s.code.length,
        createdAt: s.created_at,
      })),
    });
  } catch (error) {
    console.error('[Get Submissions Error]', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/submission/:id
 * Get a specific submission by ID
 */
app.get('/api/submission/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const submission = await db.getSubmission(parseInt(id));
    
    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found',
      });
    }
    
    res.json({
      success: true,
      submission,
    });
  } catch (error) {
    console.error('[Get Submission Error]', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Express Error]', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Semantic Plagiarism Detection Server running on http://localhost:${PORT}`);
  console.log(`📊 Embedding Model: ${embeddings.EMBEDDING_MODEL}`);
  console.log(`📐 Vector Dimensions: ${embeddings.EMBEDDING_DIMENSIONS}`);
  console.log(`\nAPI Endpoints:`);
  console.log(`  POST /api/submit  - Submit code for analysis`);
  console.log(`  POST /api/check   - Check code for similarity`);
  console.log(`  GET  /api/health  - Health check`);
  console.log(`\n`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database connection...');
  await db.closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT received, closing database connection...');
  await db.closePool();
  process.exit(0);
});

export default app;

