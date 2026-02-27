/**
 * Code Chunking Module
 * Splits code into semantic chunks (functions, blocks) for fine-grained similarity detection
 */

/**
 * Extract functions from JavaScript code
 * Supports: function declarations, arrow functions, function expressions
 * @param {string} code - JavaScript code text
 * @returns {Array<Object>} Array of {index, text, type, name} chunks
 */
export function extractJavaScriptFunctions(code) {
  const chunks = [];
  const lines = code.split('\n');
  
  // Patterns to detect function starts
  const patterns = [
    // Function declarations: function foo() { ... }
    /^\s*function\s+(\w+)\s*\(/,
    // Arrow functions assigned to const/let/var: const foo = () => { ... }
    /^\s*(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/,
    // Arrow functions with single param: const foo = x => { ... }
    /^\s*(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(\w+)\s*=>/,
    // Function expressions: const foo = function() { ... }
    /^\s*(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?function\s*\(/,
    // Class methods: methodName() { ... }
    /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*{/,
    // Export function: export function foo() { ... }
    /^\s*export\s+(?:async\s+)?function\s+(\w+)\s*\(/,
    // Export const arrow: export const foo = () => { ... }
    /^\s*export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/,
  ];
  
  let currentChunk = null;
  let braceDepth = 0;
  let chunkIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Skip empty lines and comments when not in a chunk
    if (!currentChunk && (trimmedLine === '' || trimmedLine.startsWith('//'))) {
      continue;
    }
    
    // Check if this line starts a new function
    if (!currentChunk) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          const functionName = match[1] || 'anonymous';
          currentChunk = {
            index: chunkIndex++,
            startLine: i,
            name: functionName,
            type: 'function',
            lines: [line],
          };
          
          // Count braces in this line
          braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
          break;
        }
      }
    } else {
      // We're inside a function, add the line
      currentChunk.lines.push(line);
      
      // Update brace depth
      braceDepth += (line.match(/{/g) || []).length;
      braceDepth -= (line.match(/}/g) || []).length;
      
      // If braces are balanced, the function is complete
      if (braceDepth <= 0) {
        currentChunk.text = currentChunk.lines.join('\n');
        currentChunk.endLine = i;
        delete currentChunk.lines; // Clean up intermediate data
        
        chunks.push(currentChunk);
        currentChunk = null;
        braceDepth = 0;
      }
    }
  }
  
  // Handle incomplete chunks (shouldn't happen with valid code)
  if (currentChunk) {
    currentChunk.text = currentChunk.lines.join('\n');
    currentChunk.endLine = lines.length - 1;
    delete currentChunk.lines;
    chunks.push(currentChunk);
  }
  
  return chunks;
}

/**
 * Filter out trivial chunks that are too small or likely boilerplate
 * @param {Array<Object>} chunks - Array of code chunks
 * @param {number} minLines - Minimum number of lines
 * @param {number} minChars - Minimum number of characters
 * @returns {Array<Object>} Filtered chunks
 */
export function filterTrivialChunks(chunks, minLines = 3, minChars = 50) {
  return chunks.filter(chunk => {
    const lineCount = chunk.text.split('\n').length;
    const charCount = chunk.text.trim().length;
    
    // Filter out very small chunks
    if (lineCount < minLines || charCount < minChars) {
      return false;
    }
    
    // Filter out likely boilerplate (e.g., empty functions, simple exports)
    const codeWithoutWhitespace = chunk.text.replace(/\s+/g, '');
    if (codeWithoutWhitespace.match(/^(const|let|var)\w+=\(\)=>{}$/)) {
      return false; // Empty arrow function
    }
    
    return true;
  });
}

/**
 * Extract functions/methods from brace-delimited code (Java, C, C++).
 * Uses language-specific patterns to detect method/function starts, then
 * tracks brace depth to find the end of each block.
 * @param {string} code - Source code
 * @param {Array<RegExp>} patterns - Regex patterns that match a line and capture group 1 = name
 * @returns {Array<Object>} Array of {index, text, type, name} chunks
 */
export function extractBraceBasedFunctions(code, patterns) {
  const chunks = [];
  const lines = code.split('\n');
  let currentChunk = null;
  let braceDepth = 0;
  let chunkIndex = 0;

  const isCommentLine = (trimmed) =>
    trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!currentChunk) {
      if (trimmed === '' || isCommentLine(trimmed)) continue;

      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          currentChunk = {
            index: chunkIndex++,
            startLine: i,
            name: match[1] || 'anonymous',
            type: 'function',
            lines: [line],
          };
          braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
          break;
        }
      }
    } else {
      currentChunk.lines.push(line);
      braceDepth += (line.match(/{/g) || []).length;
      braceDepth -= (line.match(/}/g) || []).length;

      if (braceDepth <= 0) {
        currentChunk.text = currentChunk.lines.join('\n');
        currentChunk.endLine = i;
        delete currentChunk.lines;
        chunks.push(currentChunk);
        currentChunk = null;
        braceDepth = 0;
      }
    }
  }

  if (currentChunk) {
    currentChunk.text = currentChunk.lines.join('\n');
    currentChunk.endLine = lines.length - 1;
    delete currentChunk.lines;
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Extract top-level functions and classes from Python code using indentation.
 * Detects `def` and `class` at the module level (indent=0), collects all lines
 * that belong to them, and stops when a new top-level statement begins.
 * @param {string} code - Python source code
 * @returns {Array<Object>} Array of {index, text, type, name} chunks
 */
export function extractPythonFunctions(code) {
  const chunks = [];
  const lines = code.split('\n');
  let currentChunk = null;
  let chunkIndex = 0;

  const flushChunk = (upToLine) => {
    if (!currentChunk) return;
    currentChunk.text = currentChunk.lines.join('\n').trimEnd();
    currentChunk.endLine = upToLine;
    delete currentChunk.lines;
    chunks.push(currentChunk);
    currentChunk = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Determine indentation level of this non-empty line
    const indent = trimmed.length > 0 ? line.length - line.trimStart().length : null;

    // A top-level def/class starts a new chunk (indent === 0)
    const topLevelDef = indent === 0 && /^(def|class)\s+(\w+)/.exec(trimmed);

    if (topLevelDef) {
      // Flush previous chunk if any
      flushChunk(i - 1);
      currentChunk = {
        index: chunkIndex++,
        startLine: i,
        name: topLevelDef[2],
        type: topLevelDef[1] === 'class' ? 'class' : 'function',
        lines: [line],
      };
    } else if (currentChunk) {
      // Any non-empty line at indent 0 that isn't a def/class ends the current chunk
      if (indent === 0 && trimmed.length > 0 && !trimmed.startsWith('#')) {
        flushChunk(i - 1);
        // Don't lose this line — it belongs to the module-level scope (not chunked)
      } else {
        currentChunk.lines.push(line);
      }
    }
  }
  flushChunk(lines.length - 1);

  return chunks;
}

/** Normalize language aliases to canonical names */
function resolveLanguage(lang) {
  const aliases = {
    js: 'javascript',
    ts: 'javascript',
    typescript: 'javascript',
    py: 'python',
    'c++': 'cpp',
    cc: 'cpp',
  };
  return aliases[lang?.toLowerCase?.()] || lang;
}

/** Java method-start patterns (modifiers + return type + name + () */
const JAVA_METHOD_PATTERNS = [
  /^\s*(?:(?:public|private|protected|static|final|abstract|synchronized)\s+)*[\w<>\[\]\s,?]+\s+(\w+)\s*\(/,
];

/** C/C++ function-start patterns (return type + name + () */
const C_CPP_METHOD_PATTERNS = [
  /^\s*(?:[\w:*&<>\[\]\s]+\s+)+(\w+)\s*\([^)]*\)\s*\{?/,
];

/**
 * Extract code chunks with intelligent splitting
 * @param {string} code - Code text
 * @param {string} language - Programming language
 * @returns {Array<Object>} Array of {index, text, type, name} chunks
 */
export function extractCodeChunks(code, language = 'javascript') {
  if (!code || code.trim().length === 0) {
    return [];
  }

  const lang = resolveLanguage(language);
  let chunks = [];

  if (lang === 'javascript') {
    chunks = extractJavaScriptFunctions(code);
  } else if (lang === 'python') {
    chunks = extractPythonFunctions(code);
    if (chunks.length === 0) {
      chunks = [{ index: 0, text: code, type: 'whole', name: 'main' }];
    }
  } else if (lang === 'java') {
    chunks = extractBraceBasedFunctions(code, JAVA_METHOD_PATTERNS);
    if (chunks.length === 0) {
      chunks = [{ index: 0, text: code, type: 'whole', name: 'main' }];
    }
  } else if (lang === 'cpp' || lang === 'c') {
    chunks = extractBraceBasedFunctions(code, C_CPP_METHOD_PATTERNS);
    if (chunks.length === 0) {
      chunks = [{ index: 0, text: code, type: 'whole', name: 'main' }];
    }
  } else {
    chunks = [{
      index: 0,
      text: code,
      type: 'whole',
      name: 'main',
    }];
  }
  
  // Filter out trivial chunks
  const filteredChunks = filterTrivialChunks(chunks);
  
  // Re-index after filtering
  return filteredChunks.map((chunk, i) => ({
    ...chunk,
    index: i,
  }));
}

/**
 * Split code into sliding window chunks (alternative strategy)
 * Useful when function extraction doesn't work well
 * @param {string} code - Code text
 * @param {number} linesPerChunk - Lines per chunk
 * @param {number} overlapLines - Lines of overlap between chunks
 * @returns {Array<Object>} Array of chunks
 */
export function slidingWindowChunks(code, linesPerChunk = 20, overlapLines = 5) {
  const lines = code.split('\n');
  const chunks = [];
  let chunkIndex = 0;
  
  for (let i = 0; i < lines.length; i += (linesPerChunk - overlapLines)) {
    const chunkLines = lines.slice(i, i + linesPerChunk);
    
    if (chunkLines.length > 0) {
      chunks.push({
        index: chunkIndex++,
        text: chunkLines.join('\n'),
        type: 'window',
        startLine: i,
        endLine: Math.min(i + linesPerChunk - 1, lines.length - 1),
      });
    }
  }
  
  return chunks;
}

/**
 * Get chunk statistics for debugging/logging
 * @param {Array<Object>} chunks - Array of chunks
 * @returns {Object} Statistics
 */
export function getChunkStats(chunks) {
  if (!chunks || chunks.length === 0) {
    return { count: 0, totalChars: 0, avgChars: 0, avgLines: 0 };
  }
  
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
  const totalLines = chunks.reduce((sum, chunk) => sum + chunk.text.split('\n').length, 0);
  
  return {
    count: chunks.length,
    totalChars,
    avgChars: Math.round(totalChars / chunks.length),
    avgLines: Math.round(totalLines / chunks.length),
    types: chunks.reduce((acc, chunk) => {
      acc[chunk.type] = (acc[chunk.type] || 0) + 1;
      return acc;
    }, {}),
  };
}

export default {
  extractCodeChunks,
  extractJavaScriptFunctions,
  extractPythonFunctions,
  extractBraceBasedFunctions,
  filterTrivialChunks,
  slidingWindowChunks,
  getChunkStats,
};

