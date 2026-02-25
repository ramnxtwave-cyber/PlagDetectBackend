/**
 * External Plagiarism API Service
 * Calls external plagiarism detection API with multiple tool checks
 */

import axios from "axios";
import dotenv from "dotenv";

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
    console.log(response.data, "response data");
    console.log(
      `[External API] Tools run: ${response.data.comparisons?.length || 0}`,
    );

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
 * @returns {Object} - Formatted result
 */
export function formatExternalResult(externalResult) {
  if (!externalResult) {
    return {
      available: false,
      summary: [],
      comparisons: [],
    };
  }

  try {
    return {
      available: true,
      mainStudentId: externalResult.main_student_id,
      summary: (externalResult.summary || []).map((item) => ({
        studentId: item.other_student_id,
        avgSimilarity: item.avg_similarity,
        toolCount: item.tool_count,
      })),
      comparisons: (externalResult.comparisons || []).map((comp) => ({
        tool: comp.tool,
        available: comp.available,
        mainStudentId: comp.main_student_id,
        results: (comp.results || []).map((result) => ({
          studentId: result.other_student_id,
          similarity: result.similarity,
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
 * Determine final plagiarism decision based on all detection layers
 * @param {boolean} localMatch - Whether local similarity found matches
 * @param {Object} externalResult - Formatted external API result
 * @param {number} threshold - Similarity threshold for plagiarism
 * @returns {Object} - Final decision with confidence and methods used
 */
export function determineFinalDecision(
  localMatch,
  externalResult,
  threshold = 0.75,
) {
  const detectionMethods = [];
  let plagiarismConfirmed = false;
  let highestSimilarity = 0;
  let reasoning = [];
  const toolResults = {};

  // Layer 1: Semantic Embeddings (Local)
  if (localMatch) {
    detectionMethods.push("semantic_embeddings");
    plagiarismConfirmed = true;
    reasoning.push("Semantic similarity detected via embeddings");
  }

  // Process external API tool results
  if (externalResult?.available && externalResult.comparisons) {
    externalResult.comparisons.forEach((comparison) => {
      if (!comparison.available) return;

      const maxSimilarity = Math.max(
        ...comparison.results.map((r) => r.similarity),
      );

      if (maxSimilarity >= threshold) {
        detectionMethods.push(comparison.tool);
        plagiarismConfirmed = true;
        reasoning.push(
          `${comparison.tool} detected similarity: ${(maxSimilarity * 100).toFixed(1)}%`,
        );
      }

      toolResults[comparison.tool] = {
        available: true,
        maxSimilarity,
        matchCount: comparison.results.filter((r) => r.similarity >= threshold)
          .length,
      };

      highestSimilarity = Math.max(highestSimilarity, maxSimilarity);
    });
  }

  // Determine confidence based on number of detection methods
  let confidence = "low";
  if (detectionMethods.length >= 4) {
    confidence = "very_high";
  } else if (detectionMethods.length === 3) {
    confidence = "high";
  } else if (detectionMethods.length === 2) {
    confidence = "medium";
  } else if (detectionMethods.length === 1) {
    confidence = "low";
  }

  return {
    plagiarismDetected: plagiarismConfirmed,
    confidence,
    highestSimilarity,
    detectionMethods,
    reasoning,
    toolResults,
    totalChecksRun: Object.keys(toolResults).length + 1,
  };
}

export default {
  checkExternalPlagiarism,
  formatExternalResult,
  determineFinalDecision,
};
