/**
 * Code Normalizer Module
 * Normalizes code to reduce impact of variable names and cosmetic differences
 * This helps embeddings focus on logic and structure rather than naming
 */

/** Normalize language aliases to canonical names */
export function resolveLanguage(lang) {
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

/**
 * Normalize variable names to generic placeholders
 * This helps embeddings recognize similar logic despite different variable names
 * @param {string} code - Original code
 * @param {string} language - Programming language
 * @returns {string} Normalized code
 */
export function normalizeVariableNames(code, language) {
  try {
    // Create a copy to work with
    let normalized = code;
    
    // Extract variable declarations and create mapping
    const variableMap = new Map();
    let varCounter = 0;
    
    // Language-specific patterns
    const patterns = {
      python: [
        /def\s+([a-z_][a-z0-9_]*)\s*\(/gi,       // function definitions (first priority)
        /for\s+([a-z_][a-z0-9_]*)\s+in\b/gi,      // for loop variables
        /\b([a-z_][a-z0-9_]*)\s*=(?!=)/gi,         // assignments only (not == comparisons)
        /\(([a-z_][a-z0-9_]*)\s*[,\)]/gi,          // function parameters
      ],
      javascript: [
        /\b(?:const|let|var)\s+([a-z_$][a-z0-9_$]*)/gi,  // variable declarations
        /function\s+([a-z_$][a-z0-9_$]*)\s*\(/gi,  // function declarations
        /\(([a-z_$][a-z0-9_$]*)\s*(?:,|\))/gi,  // function parameters
      ],
      java: [
        /\b(?:public|private|protected|static|final)\s+[\w<>\[\]\s,?]+\s+([a-z_][a-z0-9_]*)\s*\(/gi,  // method params (capture first param name from decl)
        /\b(?:int|long|short|byte|char|String|boolean|double|float)\s+([a-z_][a-z0-9_]*)/gi,
        /\b(?:List|Map|Set|ArrayList|HashMap|HashSet)\s*<[^>]*>\s+([a-z_][a-z0-9_]*)/gi,
        /\b([a-z_][a-z0-9_]*)\s*=(?!=)/gi,  // assignments (not ==)
        /\(([a-z_][a-z0-9_]*)\s*[,\)]/gi,   // parameters
      ],
      cpp: [
        /\b(?:int|long|short|char|unsigned|size_t|string|bool|double|float|auto|void)\s+([a-z_][a-z0-9_]*)/gi,
        /\b(?:vector|map|set|unordered_map)\s*<[^>]*>\s+([a-z_][a-z0-9_]*)/gi,
        /\b([a-z_][a-z0-9_]*)\s*=(?!=)/gi,  // assignments (not ==)
        /\(([a-z_][a-z0-9_]*)\s*[,\)]/gi,   // parameters
      ]
    };
    
    // Get patterns for language (default to javascript patterns)
    const lang = resolveLanguage(language);
    const langPatterns = patterns[lang] || patterns.javascript;
    
    // Extract all variable names
    langPatterns.forEach(pattern => {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(code)) !== null) {
        const varName = match[1];
        // Skip common keywords and built-ins
        if (!isCommonKeyword(varName, lang) && !variableMap.has(varName)) {
          variableMap.set(varName, `var${varCounter++}`);
        }
      }
    });
    
    // Replace variable names with generic placeholders
    // Sort by length (longest first) to avoid partial replacements
    const sortedVars = Array.from(variableMap.keys()).sort((a, b) => b.length - a.length);
    
    sortedVars.forEach(originalName => {
      const genericName = variableMap.get(originalName);
      // Use word boundaries to avoid partial replacements
      const regex = new RegExp(`\\b${originalName}\\b`, 'g');
      normalized = normalized.replace(regex, genericName);
    });
    
    return normalized;
  } catch (error) {
    console.error('[Code Normalizer] Error normalizing variable names:', error.message);
    // Return original code if normalization fails
    return code;
  }
}

/**
 * Check if a name is a common keyword or built-in
 * @param {string} name - Variable name to check
 * @param {string} language - Programming language
 * @returns {boolean}
 */
function isCommonKeyword(name, language) {
  const keywords = {
    python: ['def', 'class', 'if', 'else', 'elif', 'for', 'while', 'return', 'import', 'from', 'True', 'False', 'None', 'print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set'],
    javascript: ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'import', 'export', 'class', 'true', 'false', 'null', 'undefined', 'console', 'log'],
    java: ['public', 'private', 'protected', 'class', 'interface', 'void', 'static', 'final', 'return', 'if', 'else', 'for', 'while', 'true', 'false', 'null', 'System', 'out', 'println', 'new', 'this', 'super', 'extends', 'implements', 'try', 'catch', 'throw', 'throws'],
    cpp: ['class', 'public', 'private', 'return', 'if', 'else', 'for', 'while', 'true', 'false', 'nullptr', 'std', 'cout', 'cin', 'include', 'using', 'namespace', 'struct', 'template', 'typename']
  };
  
  const langKeywords = keywords[language] || keywords.javascript;
  return langKeywords.includes(name);
}

/**
 * Normalize code for better semantic understanding
 * Combines multiple normalization techniques
 * @param {string} code - Original code
 * @param {string} language - Programming language
 * @returns {string} Normalized code
 */
export function normalizeCode(code, language = 'javascript') {
  try {
    const lang = resolveLanguage(language);
    let normalized = code;
    
    // 1. Normalize whitespace
    normalized = normalized.trim();
    normalized = normalized.replace(/\r\n/g, '\n'); // Normalize line endings
    normalized = normalized.replace(/\t/g, '  '); // Tabs to spaces
    
    // 2. Remove excessive blank lines
    normalized = normalized.replace(/\n{3,}/g, '\n\n');
    
    // 3. Remove comments BEFORE variable normalization (avoids capturing tokens from comments)
    normalized = removeComments(normalized, lang);
    
    // 4. Normalize string literals BEFORE variable normalization (avoids capturing from inside strings)
    normalized = normalized.replace(/"[^"]*"/g, '"STRING"');
    normalized = normalized.replace(/'[^']*'/g, "'STRING'");
    
    // 5. Normalize variable names (runs last so comments/strings don't pollute the variable map)
    normalized = normalizeVariableNames(normalized, lang);
    
    return normalized;
  } catch (error) {
    console.error('[Code Normalizer] Error normalizing code:', error.message);
    return code;
  }
}

/**
 * Remove comments from code
 * @param {string} code - Code with comments
 * @param {string} language - Programming language
 * @returns {string} Code without comments
 */
function removeComments(code, language) {
  try {
    let result = code;
    
    if (language === 'python') {
      // Remove # comments
      result = result.replace(/#[^\n]*/g, '');
      // Remove docstrings
      result = result.replace(/"""[\s\S]*?"""/g, '');
      result = result.replace(/'''[\s\S]*?'''/g, '');
    } else {
      // Remove // comments
      result = result.replace(/\/\/[^\n]*/g, '');
      // Remove /* */ comments
      result = result.replace(/\/\*[\s\S]*?\*\//g, '');
    }
    
    return result;
  } catch (error) {
    return code;
  }
}

/**
 * Create a dual embedding: one with normalized code, one with original
 * This gives us the best of both worlds for matching
 * @param {string} code - Original code
 * @param {string} language - Programming language
 * @returns {Object} Both original and normalized code
 */
export function prepareDualCode(code, language = 'javascript') {
  return {
    original: code,
    normalized: normalizeCode(code, language),
    // Create a "semantic signature" that focuses on structure
    semanticSignature: createSemanticSignature(code, language)
  };
}

/**
 * Create a semantic signature focusing on code structure
 * @param {string} code - Original code
 * @param {string} language - Programming language
 * @returns {string} Semantic signature
 */
export function createSemanticSignature(code, language) {
  try {
    // Extract structural patterns
    const signature = [];
    
    // Count control structures
    const ifCount = (code.match(/\bif\b/g) || []).length;
    const forCount = (code.match(/\bfor\b/g) || []).length;
    const whileCount = (code.match(/\bwhile\b/g) || []).length;
    const returnCount = (code.match(/\breturn\b/g) || []).length;
    
    signature.push(`control:if=${ifCount},for=${forCount},while=${whileCount},return=${returnCount}`);
    
    // Extract function/method patterns
    if (language === 'python') {
      const defCount = (code.match(/\bdef\s+\w+\s*\(/g) || []).length;
      signature.push(`functions:${defCount}`);
    } else {
      const funcCount = (code.match(/function\s+\w+\s*\(|=>\s*{/g) || []).length;
      signature.push(`functions:${funcCount}`);
    }
    
    // Approximate complexity
    const lines = code.split('\n').filter(l => l.trim().length > 0).length;
    signature.push(`lines:${lines}`);
    
    return signature.join(' ');
  } catch (error) {
    return '';
  }
}

/**
 * Analyze structural metrics of code
 * Used for calculating structural difference penalties
 * 
 * @param {string} code - Code to analyze
 * @param {string} language - Programming language
 * @returns {Object} Structural metrics
 */
export function analyzeStructure(code, language = 'javascript') {
  const lines = code.split('\n').filter(line => line.trim());
  const stats = {
    lines: lines.length,
    conditionals: (code.match(/\b(if|elif|else|switch|case)\b/g) || []).length,
    loops: (code.match(/\b(for|while|do)\b/g) || []).length,
    returns: (code.match(/\breturn\b/g) || []).length,
    functions: 0,
    classes: 0
  };
  
  const lang = resolveLanguage(language);
  if (lang === 'python') {
    stats.functions = (code.match(/\bdef\s+\w+\s*\(/g) || []).length;
    stats.classes = (code.match(/\bclass\s+\w+/g) || []).length;
  } else if (lang === 'java') {
    stats.functions = (code.match(/\b(?:public|private|protected|static|final|abstract|synchronized)\s+[\w<>\[\]\s,?]+\s+\w+\s*\(/g) || []).length;
    stats.classes = (code.match(/\bclass\s+\w+/g) || []).length;
  } else if (lang === 'cpp' || lang === 'c') {
    stats.functions = (code.match(/(?:^|\n)\s*(?:[\w:*&<>\[\]\s]+\s+)+\w+\s*\([^)]*\)\s*\{/g) || []).length;
    stats.classes = (code.match(/\bclass\s+\w+/g) || []).length;
  } else {
    stats.functions = (code.match(/\bfunction\s+\w+\s*\(|\w+\s*:\s*function\s*\(|\w+\s*=\s*function\s*\(|=>\s*{/g) || []).length;
    stats.classes = (code.match(/\bclass\s+\w+/g) || []).length;
  }
  
  return stats;
}

/**
 * Calculate structural difference penalty
 * Penalizes significant differences in code organization (e.g., 3 functions vs 1 monolithic)
 *
 * Uses absolute function count difference (funcDiff) for aggressive penalties:
 * - funcDiff >= 3: 0.3 multiplier (70% penalty) - e.g., 3 functions vs 1
 * - funcDiff === 2: 0.5 multiplier (50% penalty)
 * - funcDiff === 1: 0.75 multiplier (25% penalty)
 * - funcDiff === 0: 1.0 (no penalty)
 *
 * @param {string} code1 - First code
 * @param {string} code2 - Second code
 * @param {string} language - Programming language
 * @returns {Object} { penaltyFactor, funcDiff, struct1, struct2 } for logging
 */
export function calculateStructuralPenalty(code1, code2, language = 'javascript') {
  const struct1 = analyzeStructure(code1, language);
  const struct2 = analyzeStructure(code2, language);

  // Absolute difference in function count (e.g., 3 vs 1 => funcDiff = 2)
  const funcDiff = Math.abs(struct1.functions - struct2.functions);

  let penaltyFactor;
  if (funcDiff >= 3) {
    penaltyFactor = 0.3;  // 70% penalty - very different structure (modular vs monolithic)
  } else if (funcDiff === 2) {
    penaltyFactor = 0.5;  // 50% penalty
  } else if (funcDiff === 1) {
    penaltyFactor = 0.75; // 25% penalty
  } else {
    penaltyFactor = 1.0;  // No penalty - same function count
  }

  return {
    penaltyFactor,
    funcDiff,
    struct1,
    struct2
  };
}
