/**
 * External Plagiarism API Service
 * Calls external plagiarism detection API for additional verification
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// External API configuration
const EXTERNAL_API_URL = process.env.EXTERNAL_PLAGIARISM_API_URL || 'https://plagdetectbackendpy-production.up.railway.app/api/check';
const EXTERNAL_API_TIMEOUT = 30000; // 30 seconds (increased for external service)
const EXTERNAL_API_KEY = process.env.EXTERNAL_PLAGIARISM_API_KEY || '';

/**
 * Call external plagiarism detection API
 * @param {Object} checkData - Data to send to external API
 * @returns {Promise<Object>} External API response
 */
export async function checkExternalPlagiarism(checkData) {
  try {
    const { questionId, currentSubmission, pastSubmissions } = checkData;
    
    // Validate input
    if (!questionId || !currentSubmission || !pastSubmissions) {
      throw new Error('Missing required fields for external API call');
    }
    
    console.log(`[External API] Calling external plagiarism API for question ${questionId}`);
    console.log(`[External API] Checking ${pastSubmissions.length} past submissions`);
    
    // Prepare request payload
    const payload = {
      question_id: questionId,
      current_submission: {
        student_id: currentSubmission.studentId,
        submission_id: currentSubmission.submissionId,
        code: currentSubmission.code
      },
      past_submissions: pastSubmissions.map(sub => ({
        student_id: sub.studentId,
        submission_id: sub.submissionId,
        code: sub.code
      }))
    };
    
    // Make API request
    const response = await axios.post(EXTERNAL_API_URL, payload, {
      timeout: EXTERNAL_API_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        ...(EXTERNAL_API_KEY && { 'Authorization': `Bearer ${EXTERNAL_API_KEY}` })
      }
    });
    
    console.log(`[External API] Response received with dual detection methods`);
    console.log(`[External API] - copy_detect: ${response.data.copy_detect?.matches_found}`);
    console.log(`[External API] - tree_sitter_python: ${response.data.tree_sitter_python?.matches_found}`);
    
    return {
      success: true,
      data: response.data,
      source: 'external_api'
    };
    
  } catch (error) {
    console.error('[External API Error]', error.message);
    
    // Return error but don't fail the entire request
    return {
      success: false,
      error: error.message || 'External API call failed',
      data: {
        matches_found: false,
        matches: [],
        error: error.message
      },
      source: 'external_api'
    };
  }
}

/**
 * Format external API results for consistent response structure
 * NEW FORMAT: Handles dual detection methods (copy_detect + AST detection for any language)
 * @param {Object} externalResult - Raw external API result
 * @returns {Object} Formatted result
 */
export function formatExternalResult(externalResult) {
  if (!externalResult || !externalResult.success) {
    return {
      available: false,
      error: externalResult?.error || 'External API unavailable',
      copyDetect: null,
      astDetect: null,
      matches: []
    };
  }
  
  const data = externalResult.data;
  
  // Format copy_detect results (works for all languages)
  const copyDetect = data.copy_detect ? {
    matchesFound: data.copy_detect.matches_found || false,
    thresholdUsed: data.copy_detect.threshold_used || 0.85,
    matches: (data.copy_detect.matches || []).map(match => ({
      matchedStudentId: match.matched_student_id,
      matchedSubmissionId: match.matched_submission_id,
      similarityScore: match.similarity_score,
      matchedCode: match.matched_code || '',
      detectionMethod: 'copy_detect'
    }))
  } : null;
  
  // Format AST detection results (language-agnostic)
  // Supports: tree_sitter_python, tree_sitter_javascript, tree_sitter_java, etc.
  let astDetect = null;
  let astDetectionKey = null;
  
  // Find any tree_sitter_* key in the response
  for (const key in data) {
    if (key.startsWith('tree_sitter_')) {
      astDetectionKey = key;
      astDetect = {
        language: key.replace('tree_sitter_', ''),
        matchesFound: data[key].matches_found || false,
        thresholdUsed: data[key].threshold_used || 0.85,
        matches: (data[key].matches || []).map(match => ({
          matchedStudentId: match.matched_student_id,
          matchedSubmissionId: match.matched_submission_id,
          similarityScore: match.similarity_score,
          matchedCode: match.matched_code || '',
          detectionMethod: key
        }))
      };
      break; // Use the first tree_sitter_* key found
    }
  }
  
  // Combine all matches from both methods
  const allMatches = [
    ...(copyDetect?.matches || []),
    ...(astDetect?.matches || [])
  ];
  
  // Determine if any detection method found matches
  const anyMatchesFound = 
    (copyDetect?.matchesFound || false) || 
    (astDetect?.matchesFound || false);
  
  return {
    available: true,
    matchesFound: anyMatchesFound,
    copyDetect: copyDetect,
    astDetect: astDetect,
    // Keep backward compatibility
    treeSitterPython: astDetectionKey === 'tree_sitter_python' ? astDetect : null,
    matches: allMatches,
    rawResponse: data
  };
}

/**
 * Determine final plagiarism decision based on local and external results
 * @param {Object} localResult - Local similarity check result
 * @param {Object} externalResult - External API result
 * @param {number} confidenceThreshold - Minimum confidence for plagiarism
 * @returns {Object} Final decision
 */
export function determineFinalDecision(localResult, externalResult, confidenceThreshold = 0.85) {
  let decision = 'NO_PLAGIARISM';
  let confidence = 0;
  let reasons = [];
  
  // Check local results
  const localMatches = localResult.similarSubmissions || [];
  const hasLocalHighSimilarity = localMatches.some(m => m.similarity >= confidenceThreshold);
  
  // Check external results
  const externalMatches = externalResult.available ? externalResult.matches : [];
  const hasExternalMatches = externalMatches.length > 0;
  const hasExternalHighSimilarity = externalMatches.some(m => m.similarityScore >= confidenceThreshold);
  
  // Decision logic
  if (hasLocalHighSimilarity && hasExternalHighSimilarity) {
    decision = 'PLAGIARISM_CONFIRMED';
    confidence = 0.95;
    reasons.push('High similarity detected by both local and external systems');
  } else if (hasLocalHighSimilarity && externalResult.available) {
    if (hasExternalMatches) {
      decision = 'PLAGIARISM_LIKELY';
      confidence = 0.80;
      reasons.push('High similarity in local check, moderate match in external check');
    } else {
      decision = 'SUSPICIOUS';
      confidence = 0.65;
      reasons.push('High similarity in local check, but external check found no matches');
    }
  } else if (hasLocalHighSimilarity && !externalResult.available) {
    decision = 'SUSPICIOUS';
    confidence = 0.70;
    reasons.push('High similarity in local check, external API unavailable');
  } else if (hasExternalHighSimilarity && !hasLocalHighSimilarity) {
    decision = 'SUSPICIOUS';
    confidence = 0.60;
    reasons.push('External API detected matches, but local similarity is below threshold');
  } else if (hasLocalMatches && hasExternalMatches) {
    decision = 'LOW_CONFIDENCE_MATCH';
    confidence = 0.50;
    reasons.push('Both systems found some similarity but below high confidence threshold');
  } else {
    decision = 'NO_PLAGIARISM';
    confidence = 0.95;
    reasons.push('No significant similarity detected by either system');
  }
  
  return {
    decision,
    confidence,
    reasons,
    localMatchCount: localMatches.length,
    externalMatchCount: externalMatches.length,
    externalApiAvailable: externalResult.available
  };
}

export default {
  checkExternalPlagiarism,
  formatExternalResult,
  determineFinalDecision
};

