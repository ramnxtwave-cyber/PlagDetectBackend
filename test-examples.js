/**
 * Example Test Cases for Semantic Plagiarism Detection
 * Run this after setting up the server to test the system
 */

// Example 1: Original submission
const example1Original = `
function calculateFactorial(n) {
  if (n === 0 || n === 1) {
    return 1;
  }
  return n * calculateFactorial(n - 1);
}

function calculateSum(arr) {
  let total = 0;
  for (let i = 0; i < arr.length; i++) {
    total += arr[i];
  }
  return total;
}
`;

// Example 2: Paraphrased version (should have high similarity)
const example1Paraphrased = `
const factorial = (num) => {
  if (num <= 1) return 1;
  return num * factorial(num - 1);
};

const sumArray = (numbers) => {
  let sum = 0;
  for (const num of numbers) {
    sum += num;
  }
  return sum;
};
`;

// Example 3: Very different approach (should have low similarity)
const example1Different = `
function quickSort(arr) {
  if (arr.length <= 1) return arr;
  
  const pivot = arr[0];
  const left = arr.slice(1).filter(x => x < pivot);
  const right = arr.slice(1).filter(x => x >= pivot);
  
  return [...quickSort(left), pivot, ...quickSort(right)];
}
`;

// Example 4: More sophisticated example
const fibonacciOriginal = `
function fibonacci(n) {
  if (n <= 1) {
    return n;
  }
  
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    let temp = a + b;
    a = b;
    b = temp;
  }
  return b;
}

function isPrime(num) {
  if (num < 2) return false;
  for (let i = 2; i <= Math.sqrt(num); i++) {
    if (num % i === 0) return false;
  }
  return true;
}
`;

const fibonacciPlagiarized = `
const fib = (number) => {
  if (number < 2) return number;
  
  let prev = 0, curr = 1;
  for (let idx = 2; idx <= number; idx++) {
    const next = prev + curr;
    prev = curr;
    curr = next;
  }
  return curr;
};

const checkPrime = (n) => {
  if (n <= 1) return false;
  for (let j = 2; j * j <= n; j++) {
    if (n % j === 0) return false;
  }
  return true;
};
`;

// API call examples (using fetch)
async function testSubmit() {
  const response = await fetch('http://localhost:3000/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: example1Original,
      studentId: 'student_001',
      questionId: 'problem_1',
      language: 'javascript'
    })
  });
  
  const result = await response.json();
  console.log('Submit Result:', result);
  return result;
}

async function testCheck() {
  const response = await fetch('http://localhost:3000/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: example1Paraphrased,
      questionId: 'problem_1',
      similarityThreshold: 0.75,
      maxResults: 5
    })
  });
  
  const result = await response.json();
  console.log('Check Result:', result);
  return result;
}

// Export for use in tests
export {
  example1Original,
  example1Paraphrased,
  example1Different,
  fibonacciOriginal,
  fibonacciPlagiarized,
  testSubmit,
  testCheck
};

// If running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Example code snippets for testing:');
  console.log('\n1. Original:', example1Original);
  console.log('\n2. Paraphrased:', example1Paraphrased);
  console.log('\n3. Different:', example1Different);
}

