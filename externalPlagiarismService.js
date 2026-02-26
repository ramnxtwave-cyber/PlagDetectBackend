/**
 * External Plagiarism API Service
 * Calls external plagiarism detection API with multiple tool checks
 */

import axios from "axios";
import dotenv from "dotenv";
import scoringEngine from "./scoringEngine.js";

dotenv.config();

// External API configuration
const EXTERNAL_API_URL =
  process.env.EXTERNAL_PLAGIAGARISM_API_URL ||
  "https://pd-uaj3.onrender.com/api/detect";
const EXTERNAL_API_TIMEOUT = 30000;

/**
 * Call external plagiarism API with new format
 * @param {string} questionId - Question identifier
 * @param {Object} currentSubmission - Current submission being checked
 * @param {Array} pastSubmissions - Array of past submissions to compare against
 * @param {string} language - Programming language
 * @returns {Promise<Object>} - External API response
 */
export async function checkExternalPlagiarism(
  questionId,
  currentSubmission,
  pastSubmissions,
  language = "python",
) {
  try {
    console.log("[External API] Calling external plagiarism check...");

    // Build request payload in new format
    const payload = {
      main_student: {
        id: currentSubmission.studentId || "current_check",
        code: currentSubmission.code,
      },
      other_students: pastSubmissions.map((sub) => ({
        id: sub.studentId || sub.student_id || sub.id,
        code: sub.code,
      })),
      language: language,
      tools: ["copydetect", "difflib", `treesitter_${language}`],
    };

    console.log(payload, "payload");

    console.log(
      `[External API] Checking against ${pastSubmissions.length} submissions`,
    );
    console.log(
      `[External API] Language: ${language}, Tools: ${payload.tools.join(", ")}`,
    );

    const response = await axios.post(EXTERNAL_API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: EXTERNAL_API_TIMEOUT,
    });

    console.log("[External API] Response received successfully");
    console.log(JSON.stringify(response.data), "response data");
    console.log(
      `[External API] Tools run: ${response.data.comparisons?.length || 0}`,
    );

    console.log(JSON.stringify(response.data), "response data");
    return response.data;
  } catch (error) {
    console.error("[External API Error]", error.message);

    if (error.response) {
      console.error("[External API] Status:", error.response.status);
      console.error("[External API] Response:", error.response.data);
    }

    return null;
  }
}

/**
 * Format external API result for frontend consumption
 * @param {Object} externalResult - Raw external API response
 * @param {Array} pastSubmissions - Original submissions with full code
 * @returns {Object} - Formatted result
 */
export function formatExternalResult(externalResult, pastSubmissions = []) {
  if (!externalResult) {
    return {
      available: false,
      summary: [],
      comparisons: [],
    };
  }

  try {
    // Create a map of student IDs to their full code
    const studentCodeMap = {};
    pastSubmissions.forEach((sub) => {
      const studentId = sub.studentId || sub.student_id || sub.id;
      studentCodeMap[studentId] = sub.code;
    });

    return {
      available: true,
      mainStudentId: externalResult.main_student_id,
      summary: (externalResult.summary || []).map((item) => ({
        studentId: item.other_student_id,
        avgSimilarity: item.avg_similarity,
        toolCount: item.tool_count,
        code: studentCodeMap[item.other_student_id] || null, // Add full code
      })),
      comparisons: (externalResult.comparisons || []).map((comp) => ({
        tool: comp.tool,
        available: comp.available,
        mainStudentId: comp.main_student_id,
        results: (comp.results || []).map((result) => ({
          studentId: result.other_student_id,
          similarity: result.similarity,
          code: studentCodeMap[result.other_student_id] || null, // Add full code
          details: result,
        })),
      })),
    };
  } catch (error) {
    console.error("[Format External Result Error]", error);
    return {
      available: false,
      summary: [],
      comparisons: [],
    };
  }
}

/**
 * Determine final plagiarism decision using new scoring engine
 * FIXED: Balanced scoring, proper weights, always shows real percentages
 *
 * @param {Object} localResult - Local similarity results with maxSimilarity
 * @param {Object} externalResult - Formatted external API result
 * @param {number} threshold - Similarity threshold for plagiarism (default 0.75)
 * @param {Object} structuralData - Data for structural penalty (currentCode, comparedCode, language)
 * @returns {Object} - Comprehensive plagiarism report
 */
export function determineFinalDecision(
  localResult,
  externalResult,
  threshold = 0.75,
  structuralData = {},
) {
  console.log(
    "[Plagiarism Scoring] Generating comprehensive report with new scoring engine",
  );

  // Use new scoring engine for balanced, accurate results with structural penalty
  const report = scoringEngine.generatePlagiarismReport(
    localResult,
    externalResult,
    threshold,
    structuralData,
  );

  // Add tool results for backward compatibility
  const toolResults = {};

  if (externalResult?.comparisons) {
    externalResult.comparisons.forEach((comp) => {
      if (!comp.available || !comp.results || comp.results.length === 0) return;

      const maxSimilarity = Math.max(
        ...comp.results.map((r) => r.similarity || 0),
      );

      toolResults[comp.tool] = {
        available: true,
        maxSimilarity,
        matchCount: comp.results.filter((r) => r.similarity >= threshold)
          .length,
      };
    });
  }

  // Log detailed breakdown
  console.log(
    "[Plagiarism Scoring] Overall Score:",
    (report.overallScore * 100).toFixed(1) + "%",
  );
  console.log("[Plagiarism Scoring] Type:", report.plagiarismType);
  console.log("[Plagiarism Scoring] Severity:", report.severity);
  console.log("[Plagiarism Scoring] Confidence:", report.confidence);
  console.log(
    "[Plagiarism Scoring] Methods:",
    report.detectionMethods.join(", "),
  );

  return {
    // Core decision (using new balanced scoring)
    plagiarismDetected: report.plagiarismDetected,
    overallScore: report.overallScore,
    overallPercentage: report.overallPercentage,

    // Classification
    plagiarismType: report.plagiarismType,
    severity: report.severity,

    // Confidence
    confidence: report.confidence,
    methodCount: report.methodCount,

    // Detailed breakdown
    scoreBreakdown: report.scoreBreakdown,

    // Detection details
    detectionMethods: report.detectionMethods,
    reasoning: report.reasoning,

    // Backward compatibility fields
    highestSimilarity: report.overallScore, // Use overall score, not just one method
    toolResults,
    totalChecksRun: report.methodCount,

    // Threshold context
    threshold,
    isAboveThreshold: report.isAboveThreshold,

    // User-friendly explanation
    explanation: report.explanation,
    displayMessage: report.displayMessage,
  };
}

export default {
  checkExternalPlagiarism,
  formatExternalResult,
  determineFinalDecision,
};
