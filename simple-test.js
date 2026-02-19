/**
 * Simple Test Script for Plagiarism Detection System
 * Run this with: node simple-test.js
 * 
 * Make sure the server is running first: npm start
 */

const BASE_URL = 'http://localhost:3000';

// Test code samples
const testCases = {
  original: {
    studentId: 'alice',
    code: `function fibonacci(n) {
  if (n <= 1) {
    return n;
  }
  return fibonacci(n - 1) + fibonacci(n - 2);
}

function factorial(n) {
  if (n === 0 || n === 1) return 1;
  return n * factorial(n - 1);
}`
  },
  
  paraphrased: {
    studentId: 'bob',
    code: `const fib = (num) => {
  if (num < 2) return num;
  return fib(num - 1) + fib(num - 2);
};

const fact = (x) => {
  return x <= 1 ? 1 : x * fact(x - 1);
};`
  },
  
  different: {
    studentId: 'charlie',
    code: `function quickSort(arr) {
  if (arr.length <= 1) return arr;
  const pivot = arr[0];
  const left = arr.slice(1).filter(x => x < pivot);
  const right = arr.slice(1).filter(x => x >= pivot);
  return [...quickSort(left), pivot, ...quickSort(right)];
}`
  }
};

// Helper function to make API calls
async function apiCall(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await response.json();
    return { success: response.ok, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Test functions
async function testHealthCheck() {
  console.log('\n📊 Test 1: Health Check');
  console.log('=' .repeat(50));
  
  const result = await apiCall('/api/health');
  if (result.success) {
    console.log('✅ Server is healthy');
    console.log(`   Model: ${result.data.model}`);
    console.log(`   Status: ${result.data.status}`);
  } else {
    console.log('❌ Health check failed:', result.error);
  }
  
  return result.success;
}

async function testSubmissions() {
  console.log('\n📝 Test 2: Submit Code Samples');
  console.log('=' .repeat(50));
  
  const questionId = 'test-problem-' + Date.now();
  
  for (const [name, data] of Object.entries(testCases)) {
    console.log(`\nSubmitting ${name} code from ${data.studentId}...`);
    
    const result = await apiCall('/api/submit', 'POST', {
      code: data.code,
      studentId: data.studentId,
      questionId: questionId,
      language: 'javascript'
    });
    
    if (result.success) {
      console.log(`✅ Submission successful`);
      console.log(`   ID: ${result.data.submissionId}`);
      console.log(`   Chunks: ${result.data.chunkCount}`);
    } else {
      console.log(`❌ Submission failed:`, result.error || result.data.error);
    }
  }
  
  return questionId;
}

async function testSimilarityCheck(questionId) {
  console.log('\n🔍 Test 3: Check for Similar Code');
  console.log('=' .repeat(50));
  
  // Check a paraphrased version
  const testCode = `function fib(x) {
  return x <= 1 ? x : fib(x - 1) + fib(x - 2);
}`;
  
  console.log('\nChecking code for similarity...');
  console.log('Test code:', testCode.substring(0, 60) + '...');
  
  const result = await apiCall('/api/check', 'POST', {
    code: testCode,
    questionId: questionId,
    similarityThreshold: 0.70,
    maxResults: 5
  });
  
  if (result.success) {
    console.log('\n✅ Similarity check complete');
    console.log('\nSummary:');
    console.log(`   Total matches: ${result.data.summary.totalMatchedSubmissions}`);
    console.log(`   High similarity: ${result.data.summary.highSimilarity}`);
    console.log(`   Moderate similarity: ${result.data.summary.moderateSimilarity}`);
    console.log(`   Max similarity: ${(result.data.summary.maxSimilarity * 100).toFixed(1)}%`);
    
    if (result.data.similarSubmissions.length > 0) {
      console.log('\nTop Similar Submissions:');
      result.data.similarSubmissions.forEach((sub, i) => {
        console.log(`   ${i + 1}. Student: ${sub.studentId}`);
        console.log(`      Similarity: ${(sub.similarity * 100).toFixed(1)}%`);
        console.log(`      Preview: ${sub.codePreview.substring(0, 50)}...`);
      });
    }
    
    if (result.data.similarChunks.length > 0) {
      console.log('\nSimilar Code Chunks:');
      result.data.similarChunks.slice(0, 3).forEach((chunk, i) => {
        console.log(`   ${i + 1}. From student: ${chunk.studentId}`);
        console.log(`      Similarity: ${(chunk.similarity * 100).toFixed(1)}%`);
        console.log(`      Matched: ${chunk.matchedChunkText?.substring(0, 50)}...`);
      });
    }
  } else {
    console.log('❌ Similarity check failed:', result.error || result.data.error);
  }
}

async function testGetSubmissions(questionId) {
  console.log('\n📋 Test 4: Get All Submissions');
  console.log('=' .repeat(50));
  
  const result = await apiCall(`/api/submissions/${questionId}`);
  
  if (result.success) {
    console.log(`✅ Found ${result.data.count} submissions`);
    result.data.submissions.forEach((sub, i) => {
      console.log(`   ${i + 1}. ID: ${sub.id}, Student: ${sub.studentId}`);
    });
  } else {
    console.log('❌ Failed to get submissions:', result.error);
  }
}

// Main test runner
async function runTests() {
  console.log('\n🚀 Starting Plagiarism Detection System Tests');
  console.log('=' .repeat(50));
  console.log('Make sure the server is running on http://localhost:3000\n');
  
  try {
    // Test 1: Health check
    const healthy = await testHealthCheck();
    if (!healthy) {
      console.log('\n❌ Server is not healthy. Please start the server first.');
      process.exit(1);
    }
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 2: Submit code
    const questionId = await testSubmissions();
    
    // Wait for embeddings to be generated
    console.log('\n⏳ Waiting for embeddings to be generated...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test 3: Check similarity
    await testSimilarityCheck(questionId);
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 4: Get submissions
    await testGetSubmissions(questionId);
    
    // Summary
    console.log('\n' + '=' .repeat(50));
    console.log('✅ All tests completed!');
    console.log('=' .repeat(50));
    console.log('\nNext steps:');
    console.log('1. Check the server logs for detailed information');
    console.log('2. Try the API with your own code samples');
    console.log('3. Adjust similarity thresholds in the API calls');
    console.log('4. Explore the database to see stored embeddings');
    console.log('\nDatabase query example:');
    console.log('  psql -d plagiarism_db -c "SELECT * FROM submissions LIMIT 5;"');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
runTests();

