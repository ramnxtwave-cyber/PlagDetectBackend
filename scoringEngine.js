/**
 * Plagiarism Scoring Engine
 * Provides balanced, multi-method scoring with proper weight distribution
 * FIXES: Prevents embedding dominance, shows real percentages, proper thresholds
 */

import * as codeNormalizer from './codeNormalizer.js';

/**
 * Calculate weighted plagiarism score from multiple detection methods
 * 
 * SCORING WEIGHTS (Tree-Sitter AST emphasized for structural detection):
 * - Semantic Embeddings: 20%
 * - CopyDetect: 20%
 * - Tree-Sitter AST: 40% (best at detecting structural differences)
 * - Difflib: 20%
 * 
 * STRUCTURAL PENALTY:
 * - Applied when function/class decomposition differs significantly
 * - Prevents high scores for semantically similar but structurally different code
 * 
 * This ensures no single method dominates and template code doesn't score 100%
 * 
 * @param {Object} localResult - Local embedding results
 * @param {Object} externalResult - External API tool results
 * @param {Object} options - Additional options (currentCode, comparedCode, language)
 * @returns {Object} Weighted score with breakdown
 */
export function calculateWeightedScore(localResult, externalResult, options = {}) {
  const scores = {
    semantic_embeddings: 0,
    copydetect: 0,
    treesitter: 0,
    difflib: 0
  };
  
  const weights = {
    semantic_embeddings: 0.20, // 20%
    copydetect: 0.20,          // 20%
    treesitter: 0.40,          // 40% - best at detecting structural differences
    difflib: 0.20              // 20%
  };
  
  const available = {
    semantic_embeddings: false,
    copydetect: false,
    treesitter: false,
    difflib: false
  };
  
  // 1. Semantic Embeddings Score (Local)
  // Note: Even if maxSimilarity is 0, it means embeddings ran but found no matches above threshold
  // This is different from embeddings not running at all
  if (localResult?.maxSimilarity !== undefined && localResult.maxSimilarity !== null) {
    scores.semantic_embeddings = Math.max(0, Math.min(1, localResult.maxSimilarity));
    available.semantic_embeddings = true;
  } else if (localResult?.hasMatches === false && localResult !== undefined) {
    // Embeddings ran but found no matches
    scores.semantic_embeddings = 0;
    available.semantic_embeddings = true;
  }
  
  // 2. External Tool Scores
  if (externalResult?.comparisons) {
    externalResult.comparisons.forEach(comp => {
      if (!comp.available || !comp.results || comp.results.length === 0) return;
      
      const maxSim = Math.max(...comp.results.map(r => r.similarity || 0));
      
      if (comp.tool === 'copydetect') {
        scores.copydetect = Math.max(0, Math.min(1, maxSim));
        available.copydetect = true;
      } else if (comp.tool.startsWith('treesitter')) {
        scores.treesitter = Math.max(0, Math.min(1, maxSim));
        available.treesitter = true;
      } else if (comp.tool === 'difflib') {
        scores.difflib = Math.max(0, Math.min(1, maxSim));
        available.difflib = true;
      }
    });
  }
  
  // Calculate weighted score (only from available methods)
  let totalWeight = 0;
  let weightedSum = 0;
  
  Object.keys(weights).forEach(method => {
    if (available[method]) {
      weightedSum += scores[method] * weights[method];
      totalWeight += weights[method];
    }
  });
  
  // Normalize by available weight
  let overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  
  // Apply structural penalty if codes are provided
  let structuralPenalty = 1.0; // No penalty by default
  let penaltyDetails = null;
  if (options.currentCode && options.comparedCode && options.language) {
    const penaltyResult = codeNormalizer.calculateStructuralPenalty(
      options.currentCode,
      options.comparedCode,
      options.language
    );
    structuralPenalty = penaltyResult.penaltyFactor;
    penaltyDetails = penaltyResult;
    overallScore = overallScore * structuralPenalty;
    // Log penalty details for debugging
    const { funcDiff, struct1, struct2 } = penaltyResult;
    console.log(`[Scoring] Structural penalty applied: ${(structuralPenalty * 100).toFixed(0)}% multiplier (${(100 - structuralPenalty * 100).toFixed(0)}% penalty)`);
    console.log(`[Scoring]   Reason: funcDiff=${funcDiff} (Code1: ${struct1.functions} functions, Code2: ${struct2.functions} functions)`);
    if (funcDiff >= 3) {
      console.log(`[Scoring]   Tier: funcDiff>=3 → 70% penalty (modular vs monolithic)`);
    } else if (funcDiff === 2) {
      console.log(`[Scoring]   Tier: funcDiff=2 → 50% penalty`);
    } else if (funcDiff === 1) {
      console.log(`[Scoring]   Tier: funcDiff=1 → 25% penalty`);
    } else {
      console.log(`[Scoring]   Tier: funcDiff=0 → no penalty`);
    }
  }
  
  // Calculate method count
  const methodCount = Object.values(available).filter(v => v).length;
  
  return {
    overallScore: Math.max(0, Math.min(1, overallScore)), // Clamp to [0, 1]
    structuralPenalty,
    breakdown: {
      semantic_embeddings: {
        score: scores.semantic_embeddings,
        weight: weights.semantic_embeddings,
        contribution: available.semantic_embeddings ? scores.semantic_embeddings * weights.semantic_embeddings : 0,
        available: available.semantic_embeddings
      },
      copydetect: {
        score: scores.copydetect,
        weight: weights.copydetect,
        contribution: available.copydetect ? scores.copydetect * weights.copydetect : 0,
        available: available.copydetect
      },
      treesitter: {
        score: scores.treesitter,
        weight: weights.treesitter,
        contribution: available.treesitter ? scores.treesitter * weights.treesitter : 0,
        available: available.treesitter
      },
      difflib: {
        score: scores.difflib,
        weight: weights.difflib,
        contribution: available.difflib ? scores.difflib * weights.difflib : 0,
        available: available.difflib
      }
    },
    methodCount,
    confidence: calculateConfidence(overallScore, methodCount)
  };
}

/**
 * Calculate confidence level based on score and method agreement
 * @param {number} score - Overall plagiarism score
 * @param {number} methodCount - Number of methods that detected similarity
 * @returns {string} Confidence level
 */
function calculateConfidence(score, methodCount) {
  if (score >= 0.90 && methodCount >= 3) return 'very_high';
  if (score >= 0.85 && methodCount >= 2) return 'high';
  if (score >= 0.75) return 'high';
  if (score >= 0.65) return 'medium';
  if (score >= 0.50) return 'low';
  return 'very_low';
}

/**
 * Classify plagiarism type based on score patterns
 * This helps explain WHY the score is what it is
 * 
 * @param {Object} scoreBreakdown - Score breakdown from calculateWeightedScore
 * @returns {Object} Classification with explanation
 */
export function classifyPlagiarismType(scoreBreakdown) {
  const { breakdown, overallScore, structuralPenalty } = scoreBreakdown;
  
  const embedding = breakdown.semantic_embeddings.score;
  const copy = breakdown.copydetect.score;
  const ast = breakdown.treesitter.score;
  const diff = breakdown.difflib.score;
  
  // Check if structural penalty was applied (codes have different organization)
  const hasStructuralDifference = structuralPenalty < 0.85;
  
  // Exact/Near-Exact Copy
  if (copy >= 0.95 && ast >= 0.95 && diff >= 0.90) {
    return {
      type: 'exact_copy',
      severity: 'critical',
      explanation: 'Nearly identical code detected across all checks'
    };
  }
  
  // Variable Renaming / Cosmetic Changes
  if (ast >= 0.90 && copy >= 0.80 && diff < 0.70) {
    return {
      type: 'variable_rename',
      severity: 'high',
      explanation: 'Same structure and logic, different variable names'
    };
  }
  
  // Structural Similarity (same algorithm, different implementation)
  if (ast >= 0.80 && embedding >= 0.75 && copy < 0.70) {
    return {
      type: 'structural_similarity',
      severity: 'medium',
      explanation: 'Similar algorithmic approach and structure'
    };
  }
  
  // Different Implementation (semantically similar but structurally different)
  // This catches cases where logic is similar but organization differs (3 functions vs 1)
  if (hasStructuralDifference && embedding >= 0.70) {
    return {
      type: 'different_implementation',
      severity: 'low',
      explanation: 'Similar logic but different code organization (function decomposition, structure)'
    };
  }
  
  // Template/Skeleton Code
  if (embedding >= 0.85 && ast < 0.60 && copy < 0.60) {
    return {
      type: 'template_code',
      severity: 'low',
      explanation: 'High semantic similarity but different implementation (likely template/starter code)'
    };
  }
  
  // Logic Transformation (recursive ↔ iterative)
  if (embedding >= 0.70 && ast < 0.65 && (copy < 0.60 || diff < 0.60)) {
    return {
      type: 'logic_transformation',
      severity: 'medium',
      explanation: 'Same logic with different control flow (e.g., recursive vs iterative)'
    };
  }
  
  // Low Similarity
  if (overallScore < 0.50) {
    return {
      type: 'different_implementation',
      severity: 'none',
      explanation: 'Different implementations with minimal similarity'
    };
  }
  
  // Default: Moderate Similarity
  return {
    type: 'moderate_similarity',
    severity: 'medium',
    explanation: 'Some similarity detected across multiple checks'
  };
}

/**
 * Generate final plagiarism report with proper thresholds
 * ALWAYS returns actual percentages, never suppresses low scores
 * 
 * @param {Object} localResult - Local results with maxSimilarity
 * @param {Object} externalResult - External API results
 * @param {number} threshold - Detection threshold (default 0.75)
 * @param {Object} options - Additional options (currentCode, comparedCode, language)
 * @returns {Object} Final report
 */
export function generatePlagiarismReport(localResult, externalResult, threshold = 0.75, options = {}) {
  // Calculate weighted score with structural penalty
  const scoreData = calculateWeightedScore(localResult, externalResult, options);
  const classification = classifyPlagiarismType(scoreData);
  
  const overallScore = scoreData.overallScore;
  const isPlagiarism = overallScore >= threshold;
  
  // Collect detection methods
  const detectionMethods = [];
  const reasoning = [];
  
  if (scoreData.breakdown.semantic_embeddings.available) {
    detectionMethods.push('semantic_embeddings');
    reasoning.push(
      `Semantic similarity: ${(scoreData.breakdown.semantic_embeddings.score * 100).toFixed(1)}%`
    );
  }
  
  if (scoreData.breakdown.copydetect.available) {
    detectionMethods.push('copydetect');
    reasoning.push(
      `Copy detection: ${(scoreData.breakdown.copydetect.score * 100).toFixed(1)}%`
    );
  }
  
  if (scoreData.breakdown.treesitter.available) {
    detectionMethods.push('treesitter_ast');
    reasoning.push(
      `AST similarity: ${(scoreData.breakdown.treesitter.score * 100).toFixed(1)}%`
    );
  }
  
  if (scoreData.breakdown.difflib.available) {
    detectionMethods.push('difflib');
    reasoning.push(
      `Text similarity: ${(scoreData.breakdown.difflib.score * 100).toFixed(1)}%`
    );
  }
  
  return {
    // Core metrics (ALWAYS show actual score, never 0)
    plagiarismDetected: isPlagiarism,
    overallScore: overallScore,
    overallPercentage: `${(overallScore * 100).toFixed(1)}%`,
    
    // Classification
    plagiarismType: classification.type,
    severity: classification.severity,
    
    // Confidence
    confidence: scoreData.confidence,
    methodCount: scoreData.methodCount,
    
    // Detailed breakdown
    scoreBreakdown: scoreData.breakdown,
    
    // Detection details
    detectionMethods,
    reasoning,
    
    // Threshold context
    threshold,
    isAboveThreshold: isPlagiarism,
    
    // Explanation
    explanation: classification.explanation,
    
    // Structural penalty info
    structuralPenalty: scoreData.structuralPenalty,
    structuralPenaltyApplied: scoreData.structuralPenalty < 1.0,
    
    // Display message
    displayMessage: isPlagiarism
      ? `Plagiarism detected with ${(overallScore * 100).toFixed(1)}% similarity (${classification.type})`
      : overallScore > 0.01
        ? `Low similarity: ${(overallScore * 100).toFixed(1)}% (${classification.type}) - Below ${(threshold * 100).toFixed(0)}% threshold`
        : 'No significant similarity detected'
  };
}

export default {
  calculateWeightedScore,
  classifyPlagiarismType,
  generatePlagiarismReport
};
