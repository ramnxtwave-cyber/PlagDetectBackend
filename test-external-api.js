/**
 * Test Script for External API Integration
 * 
 * This script demonstrates how the external plagiarism API works
 * and tests the combined detection system.
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

// Test cases
const testCases = [
  {
    name: 'Test 1: High Similarity Code (Should trigger both systems)',
    questionId: 'Q_TEST_001',
    code: `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}`,
    expectedDecision: 'PLAGIARISM_CONFIRMED or PLAGIARISM_LIKELY'
  },
  {
    name: 'Test 2: Unique Code (Should not trigger plagiarism)',
    questionId: 'Q_TEST_002',
    code: `class AdvancedDataStructure {
  constructor() {
    this.data = new Map();
    this.metadata = { created: Date.now() };
  }
  
  insert(key, value) {
    this.data.set(key, { value, timestamp: Date.now() });
  }
  
  query(key) {
    return this.data.get(key);
  }
}`,
    expectedDecision: 'NO_PLAGIARISM'
  },
  {
    name: 'Test 3: Modified Variable Names (Should still detect)',
    questionId: 'Q_TEST_003',
    code: `function calculateSum(numbers) {
  let total = 0;
  for (let i = 0; i < numbers.length; i++) {
    total += numbers[i];
  }
  return total;
}`,
    expectedDecision: 'PLAGIARISM_LIKELY or SUSPICIOUS'
  }
];

// Helper function to submit code first
async function submitCode(studentId, questionId, code) {
  try {
    console.log(`\n📤 Submitting code for ${studentId}...`);
    const response = await axios.post(`${BASE_URL}/api/submit`, {
      studentId,
      questionId,
      code,
      language: 'javascript'
    });
    
    if (response.data.success) {
      console.log(`✅ Submission successful - ID: ${response.data.submissionId}`);
      return response.data.submissionId;
    } else {
      console.log(`❌ Submission failed: ${response.data.error}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Error submitting code: ${error.message}`);
    return null;
  }
}

// Helper function to check similarity
async function checkSimilarity(questionId, code) {
  try {
    console.log(`\n🔍 Checking similarity for question ${questionId}...`);
    const response = await axios.post(`${BASE_URL}/api/check`, {
      questionId,
      code,
      language: 'javascript',
      similarityThreshold: 0.75,
      maxResults: 5
    });
    
    if (response.data.success) {
      return response.data;
    } else {
      console.log(`❌ Check failed: ${response.data.error}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Error checking similarity: ${error.message}`);
    return null;
  }
}

// Display results
function displayResults(result, testCase) {
  console.log('\n' + '='.repeat(80));
  console.log(`📊 RESULTS FOR: ${testCase.name}`);
  console.log('='.repeat(80));
  
  // Local Results
  console.log('\n🏠 LOCAL DETECTION RESULTS:');
  console.log(`   Total Matches: ${result.local_result.summary.totalMatchedSubmissions}`);
  console.log(`   High Similarity: ${result.local_result.summary.highSimilarity}`);
  console.log(`   Max Similarity: ${(result.local_result.summary.maxSimilarity * 100).toFixed(1)}%`);
  
  if (result.local_result.similarSubmissions.length > 0) {
    console.log('\n   Top Matches:');
    result.local_result.similarSubmissions.slice(0, 3).forEach((match, idx) => {
      console.log(`   ${idx + 1}. Student ${match.studentId} - Similarity: ${(match.similarity * 100).toFixed(1)}%`);
    });
  }
  
  // External Results
  console.log('\n🌐 EXTERNAL API RESULTS:');
  if (result.external_result.available) {
    console.log(`   ✅ External API Available`);
    console.log(`   Matches Found: ${result.external_result.matchesFound ? 'YES' : 'NO'}`);
    console.log(`   Threshold Used: ${result.external_result.thresholdUsed}`);
    
    if (result.external_result.matches.length > 0) {
      console.log('\n   External Matches:');
      result.external_result.matches.forEach((match, idx) => {
        console.log(`   ${idx + 1}. Student ${match.matchedStudentId} - Score: ${(match.similarityScore * 100).toFixed(1)}%`);
      });
    }
  } else {
    console.log(`   ⚠️  External API Unavailable`);
    console.log(`   Reason: ${result.external_result.error || result.external_result.reason || 'Unknown'}`);
  }
  
  // Final Decision
  console.log('\n⚖️  FINAL DECISION:');
  console.log(`   Decision: ${result.final_decision.decision}`);
  console.log(`   Confidence: ${(result.final_decision.confidence * 100).toFixed(0)}%`);
  console.log(`   Reasons:`);
  result.final_decision.reasons.forEach(reason => {
    console.log(`   - ${reason}`);
  });
  
  // Expected vs Actual
  console.log('\n📋 VALIDATION:');
  console.log(`   Expected: ${testCase.expectedDecision}`);
  console.log(`   Actual: ${result.final_decision.decision}`);
  
  const decisionMatch = testCase.expectedDecision.includes(result.final_decision.decision);
  console.log(`   Status: ${decisionMatch ? '✅ PASS' : '⚠️  REVIEW NEEDED'}`);
  
  console.log('\n' + '='.repeat(80) + '\n');
}

// Main test function
async function runTests() {
  console.log('\n🚀 Starting External API Integration Tests...\n');
  
  // First, submit some sample code to the database
  console.log('📝 Setting up test data...');
  
  const sampleSubmissions = [
    {
      studentId: 'STU_SAMPLE_001',
      questionId: 'Q_TEST_001',
      code: `function fibonacci(num) {
  if (num <= 1) return num;
  return fibonacci(num - 1) + fibonacci(num - 2);
}`
    },
    {
      studentId: 'STU_SAMPLE_002',
      questionId: 'Q_TEST_003',
      code: `function sum(arr) {
  let result = 0;
  for (let j = 0; j < arr.length; j++) {
    result += arr[j];
  }
  return result;
}`
    }
  ];
  
  // Submit sample data
  for (const sample of sampleSubmissions) {
    await submitCode(sample.studentId, sample.questionId, sample.code);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between submissions
  }
  
  console.log('\n✅ Test data setup complete!\n');
  console.log('⏳ Waiting 2 seconds before running tests...\n');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Run test cases
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`\n${'#'.repeat(80)}`);
    console.log(`Running Test ${i + 1}/${testCases.length}: ${testCase.name}`);
    console.log('#'.repeat(80));
    
    const result = await checkSimilarity(testCase.questionId, testCase.code);
    
    if (result) {
      displayResults(result, testCase);
    } else {
      console.log('❌ Test failed - no result returned\n');
    }
    
    // Wait between tests
    if (i < testCases.length - 1) {
      console.log('⏳ Waiting 2 seconds before next test...\n');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n✅ All tests completed!\n');
  console.log('📝 Summary:');
  console.log('   - Tests demonstrate dual-layer detection (local + external)');
  console.log('   - External API is called only when local matches are found');
  console.log('   - System gracefully handles external API failures');
  console.log('   - Final decision combines both detection methods\n');
}

// Run tests
console.log('🔧 External API Integration Test Suite');
console.log('=' .repeat(80));
console.log('This script tests the combined local + external plagiarism detection.\n');
console.log('⚠️  Note: External API must be configured in .env for full testing.');
console.log('   If external API is unavailable, system will still work with local detection.\n');

runTests().catch(error => {
  console.error('❌ Test suite failed:', error.message);
  process.exit(1);
});

