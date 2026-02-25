/**
 * Semantic Code Plagiarism Detection System
 * Main Express Server with API Endpoints
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Import modules
import * as vectorDb from "./vectorDb.js";
import * as embeddings from "./embeddings.js";
import * as chunking from "./chunking.js";
import * as externalPlagiarism from "./externalPlagiarismService.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - Configure CORS for production
app.use(
  cors({
    origin: "*", // Allow all origins (adjust in production)
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-OpenAI-API-Key"],
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" })); // Support large code submissions

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "semantic-plagiarism-detector",
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
app.post("/api/submit", async (req, res) => {
  try {
    const { code, studentId, questionId, language = "javascript" } = req.body;

    // Get custom API key from header if provided
    const customApiKey = req.headers["x-openai-api-key"] || null;

    // Validate input
    if (!code || !studentId || !questionId) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: code, studentId, questionId",
      });
    }

    if (code.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Code cannot be empty",
      });
    }

    console.log(
      `[Submit] Processing submission from ${studentId} for question ${questionId}`,
    );
    if (customApiKey) {
      console.log(`[Submit] Using custom API key`);
    }

    // Generate submission ID
    const submissionId = `${studentId}_${questionId}_${Date.now()}`;
    console.log(`[Submit] Generated submission ID: ${submissionId}`);

    // Step 1: Generate whole-code embedding
    const wholeCodeEmbedding = await embeddings.generateCodeEmbedding(
      code,
      language,
      customApiKey,
    );
    console.log(`[Submit] Generated whole-code embedding`);

    // Step 2: Extract and embed chunks
    const codeChunks = chunking.extractCodeChunks(code, language);
    console.log(`[Submit] Extracted ${codeChunks.length} chunks`);

    const chunksWithEmbeddings =
      codeChunks.length > 0
        ? await embeddings.generateChunkEmbeddings(
            codeChunks,
            language,
            customApiKey,
          )
        : [];

    // Step 3: Save everything to Pinecone
    await vectorDb.saveSubmission({
      submissionId,
      studentId,
      questionId,
      code,
      embedding: wholeCodeEmbedding,
      chunks: chunksWithEmbeddings,
    });
    console.log(
      `[Submit] Saved to vector database with ${chunksWithEmbeddings.length} chunks`,
    );

    const chunkStats = chunking.getChunkStats(codeChunks);

    res.json({
      success: true,
      submissionId,
      chunkCount: codeChunks.length,
      chunkStats,
      message: "Submission processed successfully",
    });
  } catch (error) {
    console.error("[Submit Error]", error);

    // Check if it's a Pinecone error
    if (error.message && error.message.includes("Pinecone")) {
      return res.status(503).json({
        success: false,
        error:
          "Vector database not configured. Please set PINECONE_API_KEY in your backend .env file. Get free API key from https://www.pinecone.io/",
        errorType: "PINECONE_NOT_CONFIGURED",
      });
    }

    // Check if it's an OpenAI API quota/key error
    if (error.message && error.message.includes("quota")) {
      return res.status(402).json({
        success: false,
        error:
          'OpenAI API quota exceeded. Please provide a valid API key with available credits using the "OpenAI API Key" field in the frontend.',
        errorType: "QUOTA_EXCEEDED",
      });
    }

    if (error.message && error.message.includes("API key")) {
      return res.status(401).json({
        success: false,
        error:
          'Invalid or missing OpenAI API key. Please provide a valid API key using the "OpenAI API Key" field in the frontend.',
        errorType: "INVALID_API_KEY",
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
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
app.post("/api/check", async (req, res) => {
  try {
    const {
      code,
      questionId,
      language = "javascript",
      similarityThreshold = 0.75,
      maxResults = 5,
    } = req.body;

    // Get custom API key from header if provided
    const customApiKey = req.headers["x-openai-api-key"] || null;

    // Validate input
    if (!code || !questionId) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: code, questionId",
      });
    }

    if (code.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Code cannot be empty",
      });
    }

    console.log(`[Check] Checking similarity for question ${questionId}`);
    if (customApiKey) {
      console.log(`[Check] Using custom API key`);
    }

    // Step 1: Generate embedding for the submitted code (with custom API key if provided)
    const codeEmbedding = await embeddings.generateCodeEmbedding(
      code,
      language,
      customApiKey,
    );
    console.log(`[Check] Generated embedding for submission`);

    // Step 2: Find similar whole submissions
    const similarSubmissions = await vectorDb.findSimilarSubmissions(
      codeEmbedding,
      questionId,
      maxResults,
      similarityThreshold,
    );
    console.log(
      `[Check] Found ${similarSubmissions.length} similar submissions`,
    );

    // Step 3: Extract and check chunks
    const codeChunks = chunking.extractCodeChunks(code, language);
    console.log(
      `[Check] Extracted ${codeChunks.length} chunks from query code`,
    );

    let similarChunks = [];
    if (codeChunks.length > 0) {
      const queryChunksWithEmbeddings =
        await embeddings.generateChunkEmbeddings(
          codeChunks,
          language,
          customApiKey,
        );

      const chunkSimilarityPromises = queryChunksWithEmbeddings.map(
        async (chunk) => {
          const matches = await vectorDb.findSimilarChunks(
            chunk.embedding,
            questionId,
            5,
            similarityThreshold,
          );

          return matches.map((match) => ({
            ...match,
            query_chunk_index: chunk.index,
            query_chunk_text: chunk.text,
          }));
        },
      );

      const chunkResults = await Promise.all(chunkSimilarityPromises);
      similarChunks = chunkResults.flat();

      similarChunks.sort((a, b) => b.similarity - a.similarity);
      console.log(`[Check] Found ${similarChunks.length} similar chunks`);
    }

    // Step 4: Build response with summary
    const uniqueMatchedSubmissions = new Set([
      ...similarSubmissions.map((s) => s.id),
      ...similarChunks.map((c) => c.submission_id),
    ]);

    const highSimilaritySubmissions = similarSubmissions.filter(
      (s) => s.similarity >= 0.85,
    );
    const moderateSimilaritySubmissions = similarSubmissions.filter(
      (s) => s.similarity >= 0.75 && s.similarity < 0.85,
    );

    const summary = {
      totalMatchedSubmissions: uniqueMatchedSubmissions.size,
      highSimilarity: highSimilaritySubmissions.length,
      moderateSimilarity: moderateSimilaritySubmissions.length,
      matchedChunks: similarChunks.length,
      maxSimilarity:
        similarSubmissions.length > 0 ? similarSubmissions[0].similarity : 0,
      threshold: similarityThreshold,
    };

    // Format response (limit code length in response)
    const formatSubmission = (sub) => ({
      submissionId: sub.id,
      studentId: sub.student_id,
      similarity: Math.round(sub.similarity * 1000) / 1000, // Round to 3 decimals
      codePreview:
        sub.code.substring(0, 200) + (sub.code.length > 200 ? "..." : ""),
      codeLength: sub.code.length,
    });

    const formatChunk = (chunk) => ({
      submissionId: chunk.submission_id,
      studentId: chunk.student_id,
      similarity: Math.round(chunk.similarity * 1000) / 1000,
      queryChunkIndex: chunk.query_chunk_index,
      queryChunkPreview:
        chunk.query_chunk_text?.substring(0, 150) +
        (chunk.query_chunk_text?.length > 150 ? "..." : ""),
      matchedChunkText:
        chunk.chunk_text?.substring(0, 150) +
        (chunk.chunk_text?.length > 150 ? "..." : ""),
      matchedChunkIndex: chunk.chunk_index,
    });

    // Step 5: Call external plagiarism API (always, regardless of local matches)
    let externalResult = null;
    let finalDecision = null;

    console.log(`[Check] Calling external plagiarism API...`);
    console.log(`[Check] Local matches found: ${similarSubmissions.length}`);

    try {
      // Prepare submissions for external API
      // Include top 5 local matches, or check against empty array if no local matches
      const pastSubmissions =
        similarSubmissions.length > 0
          ? similarSubmissions.slice(0, 5).map((sub) => ({
              studentId: sub.student_id,
              code: sub.code,
            }))
          : []; // Empty array - external API can still check for patterns/online sources

      // Call external API with language parameter
      const externalApiResponse =
        await externalPlagiarism.checkExternalPlagiarism(
          questionId,
          {
            studentId: "current_check",
            code: code,
          },
          pastSubmissions,
          language,
        );

      externalResult =
        externalPlagiarism.formatExternalResult(externalApiResponse);

      // Determine final decision based on both local and external results
      const hasLocalMatch = similarSubmissions.length > 0;
      finalDecision = externalPlagiarism.determineFinalDecision(
        hasLocalMatch,
        externalResult,
        similarityThreshold,
      );

      console.log(
        `[Check] Final decision: Plagiarism=${finalDecision.plagiarismDetected}, Confidence=${finalDecision.confidence}`,
      );
    } catch (error) {
      console.error("[Check] External API call failed:", error.message);
      externalResult = {
        available: false,
        error: error.message,
        matches: [],
      };

      // Fallback decision when external API fails
      if (similarSubmissions.length > 0) {
        finalDecision = {
          plagiarismDetected: similarSubmissions[0].similarity >= 0.85,
          confidence:
            similarSubmissions[0].similarity >= 0.85 ? "high" : "medium",
          highestSimilarity: similarSubmissions[0].similarity,
          detectionMethods: ["local_vector_search"],
          reasoning: [
            "External API unavailable, decision based on local similarity only",
          ],
          toolResults: { local_similarity: similarSubmissions[0].similarity },
          totalChecksRun: 1,
        };
      } else {
        finalDecision = {
          plagiarismDetected: false,
          confidence: "very_low",
          highestSimilarity: 0,
          detectionMethods: [],
          reasoning: ["No local matches found", "External API unavailable"],
          toolResults: {},
          totalChecksRun: 1,
        };
      }
    }

    // Calculate individual verdicts for each detection method
    const localVerdict = {
      method: "Local Vector Similarity (Semantic)",
      plagiarism_detected:
        similarSubmissions.length > 0 &&
        similarSubmissions[0].similarity >= similarityThreshold,
      confidence:
        similarSubmissions.length > 0
          ? similarSubmissions[0].similarity >= 0.85
            ? "high"
            : similarSubmissions[0].similarity >= 0.75
              ? "medium"
              : "low"
          : "none",
      max_similarity:
        similarSubmissions.length > 0
          ? Math.round(similarSubmissions[0].similarity * 100)
          : 0,
      matches_found: similarSubmissions.length,
      summary:
        similarSubmissions.length > 0
          ? `Found ${similarSubmissions.length} similar submission(s). Highest similarity: ${Math.round(similarSubmissions[0].similarity * 100)}%`
          : "No similar submissions found in local database",
      details: {
        threshold_used: Math.round(similarityThreshold * 100),
        top_matches: similarSubmissions
          .slice(0, maxResults)
          .map(formatSubmission),
        similar_chunks: similarChunks.slice(0, 10).map(formatChunk),
      },
    };

    const externalVerdict = {
      method: "External API (AST + Code Structure)",
      plagiarism_detected:
        externalResult?.available && finalDecision?.plagiarismDetected === true,
      confidence: finalDecision?.confidence || "unknown",
      max_similarity: finalDecision?.highestSimilarity
        ? Math.round(finalDecision.highestSimilarity * 100)
        : 0,
      matches_found: externalResult?.summary?.length || 0,
      summary: externalResult?.available
        ? externalResult.summary && externalResult.summary.length > 0
          ? `External API detected ${externalResult.summary.length} potential match(es)`
          : "External API found no matches"
        : externalResult?.error
          ? `External API unavailable: ${externalResult.error}`
          : "External API unavailable",
      details: externalResult || { available: false },
    };

    // Overall assessment (for display purposes only - doesn't override individual results)
    const overallAssessment = {
      status:
        localVerdict.plagiarism_detected || externalVerdict.plagiarism_detected
          ? "PLAGIARISM_DETECTED"
          : "NO_PLAGIARISM",
      priority:
        localVerdict.plagiarism_detected && externalVerdict.plagiarism_detected
          ? "HIGH_PRIORITY"
          : localVerdict.plagiarism_detected ||
              externalVerdict.plagiarism_detected
            ? "MEDIUM_PRIORITY"
            : "LOW_PRIORITY",
      recommendation:
        localVerdict.plagiarism_detected || externalVerdict.plagiarism_detected
          ? "Review required - one or more detection methods flagged this submission"
          : "No plagiarism detected by any method",
      methods_flagged: [
        ...(localVerdict.plagiarism_detected
          ? ["Local Vector Similarity"]
          : []),
        ...(externalVerdict.plagiarism_detected
          ? ["External API Analysis"]
          : []),
      ],
    };

    // Build comprehensive response with clear separation
    res.json({
      success: true,

      // Individual detection results - displayed independently
      detection_results: {
        local: localVerdict,
        external: externalVerdict,
      },

      // Overall assessment (combines both, but doesn't compromise either)
      overall: overallAssessment,

      // Detailed data for each method
      local_result: {
        summary,
        similarSubmissions: similarSubmissions
          .slice(0, maxResults)
          .map(formatSubmission),
        similarChunks: similarChunks.slice(0, 10).map(formatChunk),
      },

      external_result: externalResult,

      // Legacy final_decision (kept for backward compatibility)
      final_decision: finalDecision,

      // Backward compatibility - keep original structure
      summary,
      similarSubmissions: similarSubmissions
        .slice(0, maxResults)
        .map(formatSubmission),
      similarChunks: similarChunks.slice(0, 10).map(formatChunk),

      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Check Error]", error);

    // Check if it's a Pinecone error
    if (error.message && error.message.includes("Pinecone")) {
      return res.status(503).json({
        success: false,
        error:
          "Vector database not configured. Please set PINECONE_API_KEY in your backend .env file. Get free API key from https://www.pinecone.io/",
        errorType: "PINECONE_NOT_CONFIGURED",
      });
    }

    // Check if it's an OpenAI API quota/key error
    if (error.message && error.message.includes("quota")) {
      return res.status(402).json({
        success: false,
        error:
          'OpenAI API quota exceeded. Please provide a valid API key with available credits using the "OpenAI API Key" field in the frontend.',
        errorType: "QUOTA_EXCEEDED",
      });
    }

    if (error.message && error.message.includes("API key")) {
      return res.status(401).json({
        success: false,
        error:
          'Invalid or missing OpenAI API key. Please provide a valid API key using the "OpenAI API Key" field in the frontend.',
        errorType: "INVALID_API_KEY",
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
});

/**
 * GET /api/submissions/:questionId
 * Get all submissions for a question
 */
app.get("/api/submissions/:questionId", async (req, res) => {
  try {
    const { questionId } = req.params;
    const submissions = await vectorDb.getSubmissionsByQuestion(questionId);

    res.json({
      success: true,
      questionId,
      count: submissions.length,
      submissions: submissions.map((s) => ({
        id: s.id,
        studentId: s.student_id,
        codeLength: s.code.length,
        createdAt: s.created_at,
      })),
    });
  } catch (error) {
    console.error("[Get Submissions Error]", error);
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
app.get("/api/submission/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const submission = await vectorDb.getSubmission(id);

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: "Submission not found",
      });
    }

    res.json({
      success: true,
      submission,
    });
  } catch (error) {
    console.error("[Get Submission Error]", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("[Express Error]", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

// Initialize and start server
async function startServer() {
  try {
    // Try to initialize Pinecone (non-fatal if it fails)
    const pineconeInitialized = await vectorDb.initializeIndex();

    // Start Express server
    app.listen(PORT, () => {
      console.log(
        `\n🚀 Semantic Plagiarism Detection Server running on http://localhost:${PORT}`,
      );
      console.log(`📊 Embedding Model: ${embeddings.EMBEDDING_MODEL}`);
      console.log(`📐 Vector Dimensions: ${embeddings.EMBEDDING_DIMENSIONS}`);
      console.log(
        `🎯 Vector Database: Pinecone (Cloud) ${pineconeInitialized ? "✓" : "✗ NOT CONFIGURED"}`,
      );

      if (!pineconeInitialized) {
        console.log(`\n⚠️  WARNING: Pinecone is not configured!`);
        console.log(
          `   Set PINECONE_API_KEY in .env to enable vector storage.`,
        );
        console.log(`   Get free API key: https://www.pinecone.io/`);
      }

      console.log(`\nAPI Endpoints:`);
      console.log(`  POST /api/submit  - Submit code for analysis`);
      console.log(`  POST /api/check   - Check code for similarity`);
      console.log(`  GET  /api/health  - Health check`);
      console.log(`\n`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down...");
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("\nSIGINT received, shutting down...");
  process.exit(0);
});

export default app;
