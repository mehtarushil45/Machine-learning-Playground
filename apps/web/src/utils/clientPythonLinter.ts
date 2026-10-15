/**
 * clientPythonLinter.ts -- Fast Client-Side Python AST & Syntax Diagnostics.
 *
 * Provides immediate, zero-latency validation of Python code in Monaco Editor:
 *  - Unclosed parentheses, square brackets, and curly braces (line & column accurate)
 *  - Unclosed string literals (single, double, triple-quoted)
 *  - Python syntax errors (multi-word identifiers e.g. "hello world", missing colons, invalid assignments)
 *  - Undefined bare variable symbols on new lines (e.g. typing "k" at the bottom of the script)
 *
 * Runs instantly before / alongside the 500ms debounced backend AST + Pyflakes engine.
 */

export interface FastDiagnostic {
  line: number;
  col: number;
  end_line?: number;
  end_col?: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  source: 'syntax' | 'pyflakes';
  code: string; // e.g. "E999", "F821"
}

interface BracketInfo {
  char: string;
  line: number;
  col: number;
}

const BRACKET_PAIRS: Record<string, string> = {
  ')': '(',
  ']': '[',
  '}': '{',
};

const PYTHON_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
  'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
  'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

export function fastCheckPythonCode(code: string): FastDiagnostic[] {
  if (!code || !code.trim()) return [];

  const diagnostics: FastDiagnostic[] = [];
  const lines = code.split('\n');
  const bracketStack: BracketInfo[] = [];

  let inTripleDouble = false;
  let inTripleSingle = false;

  // Track declared/imported identifiers across lines to detect stray undefined names
  const knownIdentifiers = new Set<string>([
    'print', 'len', 'range', 'list', 'dict', 'set', 'tuple', 'str', 'int',
    'float', 'bool', 'type', 'enumerate', 'zip', 'map', 'filter', 'sorted',
    'min', 'max', 'sum', 'open', 'super', 'isinstance', 'issubclass',
    'True', 'False', 'None', 'df', 'data', 'X', 'y', 'X_train', 'X_test',
    'y_train', 'y_test', 'np', 'pd', 'plt', 'sns', 'model', 'clf', 'reg',
    'scaler', 'imputer', 'cv', 'scores', 'pipeline', 'pipe',
  ]);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineNum = lineIdx + 1;
    const rawLine = lines[lineIdx];
    const trimmed = rawLine.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Handle triple quotes across lines
    if (inTripleDouble) {
      if (rawLine.includes('"""')) {
        inTripleDouble = false;
      }
      continue;
    }
    if (inTripleSingle) {
      if (rawLine.includes("'''")) {
        inTripleSingle = false;
      }
      continue;
    }

    // Single-line docstrings or multi-line quotes closed on same line
    if (
      (trimmed.startsWith('"""') && trimmed.slice(3).includes('"""')) ||
      (trimmed.startsWith("'''") && trimmed.slice(3).includes("'''"))
    ) {
      continue;
    }

    if (trimmed.startsWith('"""')) {
      inTripleDouble = true;
      continue;
    }
    if (trimmed.startsWith("'''")) {
      inTripleSingle = true;
      continue;
    }

    // Skip full-line comments
    if (trimmed.startsWith('#')) continue;

    // Extract import statements to populate known identifiers
    const importMatch = trimmed.match(/^(?:from\s+[\w.]+\s+import\s+([\w\s,*]+)|import\s+([\w\s,.]+))/);
    if (importMatch) {
      const importedNames = (importMatch[1] || importMatch[2] || '')
        .split(',')
        .map((s) => s.trim().replace(/^.*?\s+as\s+/, '').split(/\s+/)[0])
        .filter(Boolean);
      importedNames.forEach((name) => knownIdentifiers.add(name));
    }

    // Extract assignments to populate known identifiers (single and tuple, e.g. x = ..., X_train, X_test = ...)
    const assignMatch = trimmed.match(/^([a-zA-Z_][\w,\s]*)\s*(?:=|:=|\+=|-=|\*=|\/=)/);
    if (assignMatch && assignMatch[1]) {
      assignMatch[1].split(',').forEach((name) => {
        const clean = name.trim();
        if (/^[a-zA-Z_]\w*$/.test(clean)) {
          knownIdentifiers.add(clean);
        }
      });
    }

    // Extract function/class definitions
    const defMatch = trimmed.match(/^(?:def|class)\s+([a-zA-Z_]\w*)/);
    if (defMatch && defMatch[1]) {
      knownIdentifiers.add(defMatch[1]);
    }

    // Extract for-loop targets (e.g. for col in feature_cols:)
    const forMatch = trimmed.match(/^for\s+([a-zA-Z_][\w,\s]*)\s+in\s+/);
    if (forMatch && forMatch[1]) {
      forMatch[1].split(',').forEach((name) => {
        const clean = name.trim();
        if (/^[a-zA-Z_]\w*$/.test(clean)) {
          knownIdentifiers.add(clean);
        }
      });
    }

    // Extract with ... as <var>
    const withMatch = trimmed.match(/\bas\s+([a-zA-Z_]\w*)/);
    if (withMatch && withMatch[1]) {
      knownIdentifiers.add(withMatch[1].trim());
    }

    // State before scanning this line
    const wasInsideBrackets = bracketStack.length > 0;

    // 1. Bracket and parenthesis balancing check
    let inDoubleQuote = false;
    let inSingleQuote = false;
    let isEscaped = false;

    for (let charIdx = 0; charIdx < rawLine.length; charIdx++) {
      const char = rawLine[charIdx];
      const col = charIdx + 1;

      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === '\\') {
        isEscaped = true;
        continue;
      }

      // Check comment outside of quotes
      if (char === '#' && !inDoubleQuote && !inSingleQuote) {
        break; // Ignore rest of line
      }

      // String toggle
      if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }
      if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
        continue;
      }

      // Skip bracket checks inside string literals
      if (inDoubleQuote || inSingleQuote) continue;

      if (char === '(' || char === '[' || char === '{') {
        bracketStack.push({ char, line: lineNum, col });
      } else if (char === ')' || char === ']' || char === '}') {
        const expected = BRACKET_PAIRS[char];
        if (bracketStack.length === 0) {
          diagnostics.push({
            line: lineNum,
            col,
            end_line: lineNum,
            end_col: col + 1,
            severity: 'error',
            message: `SyntaxError: unmatched '${char}'`,
            source: 'syntax',
            code: 'E999',
          });
        } else {
          const top = bracketStack.pop()!;
          if (top.char !== expected) {
            diagnostics.push({
              line: lineNum,
              col,
              end_line: lineNum,
              end_col: col + 1,
              severity: 'error',
              message: `SyntaxError: closing '${char}' does not match opening '${top.char}' on line ${top.line}`,
              source: 'syntax',
              code: 'E999',
            });
          }
        }
      }
    }

    // Check for unclosed single-line strings
    if (inDoubleQuote) {
      diagnostics.push({
        line: lineNum,
        col: rawLine.lastIndexOf('"') + 1 || 1,
        severity: 'error',
        message: 'SyntaxError: unterminated string literal (detected at line end)',
        source: 'syntax',
        code: 'E999',
      });
    } else if (inSingleQuote) {
      diagnostics.push({
        line: lineNum,
        col: rawLine.lastIndexOf("'") + 1 || 1,
        severity: 'error',
        message: 'SyntaxError: unterminated string literal (detected at line end)',
        source: 'syntax',
        code: 'E999',
      });
    }

    // 2. Structural checks: missing colons on compound statements
    const compoundMatch = trimmed.match(/^(def\s+\w+\s*\(.*?\)|class\s+\w+(?:\(.*?\))?|if\s+.+|elif\s+.+|else|for\s+.+\s+in\s+.+|while\s+.+|try|except(?:\s+.*)?|finally|with\s+.+)\s*$/);
    if (compoundMatch && !trimmed.endsWith(':')) {
      diagnostics.push({
        line: lineNum,
        col: rawLine.length,
        end_line: lineNum,
        end_col: rawLine.length + 1,
        severity: 'error',
        message: "SyntaxError: expected ':' at end of statement",
        source: 'syntax',
        code: 'E999',
      });
    }

    // 3. Check for invalid consecutive bare words (e.g. "hello world", "foo bar baz")
    // ONLY check if we are NOT inside brackets, not inside quotes, not a line continuation,
    // and line does not contain operators, commas, or statement keywords
    const isInsideBrackets = wasInsideBrackets || bracketStack.length > 0;
    if (
      !isInsideBrackets &&
      !inDoubleQuote &&
      !inSingleQuote &&
      !trimmed.endsWith('\\') &&
      !trimmed.includes(',') &&
      !trimmed.includes('"') &&
      !trimmed.includes("'") &&
      !trimmed.includes('=') &&
      !trimmed.includes('+') &&
      !trimmed.includes('-') &&
      !trimmed.includes('*') &&
      !trimmed.includes('/') &&
      !trimmed.includes('%') &&
      !trimmed.includes('<') &&
      !trimmed.includes('>') &&
      !trimmed.includes(':') &&
      !trimmed.includes(';') &&
      !trimmed.includes('!') &&
      !trimmed.startsWith('import ') &&
      !trimmed.startsWith('from ') &&
      !trimmed.startsWith('return ') &&
      !trimmed.startsWith('raise ') &&
      !trimmed.startsWith('del ') &&
      !trimmed.startsWith('pass') &&
      !trimmed.startsWith('break') &&
      !trimmed.startsWith('continue') &&
      !trimmed.startsWith('global ') &&
      !trimmed.startsWith('nonlocal ') &&
      !trimmed.startsWith('assert ') &&
      !trimmed.startsWith('yield') &&
      !trimmed.startsWith('def ') &&
      !trimmed.startsWith('class ') &&
      !trimmed.startsWith('if ') &&
      !trimmed.startsWith('elif ') &&
      !trimmed.startsWith('else') &&
      !trimmed.startsWith('for ') &&
      !trimmed.startsWith('while ') &&
      !trimmed.startsWith('try') &&
      !trimmed.startsWith('except') &&
      !trimmed.startsWith('finally') &&
      !trimmed.startsWith('with ') &&
      !trimmed.startsWith('async ') &&
      !trimmed.startsWith('await ')
    ) {
      const words = trimmed.split(/\s+/);
      if (words.length > 1 && words.every((w) => /^[a-zA-Z_]\w*$/.test(w))) {
        // Multi-word sequence of bare identifiers without operators or punctuation: definite SyntaxError
        const col = rawLine.indexOf(words[1]) + 1;
        diagnostics.push({
          line: lineNum,
          col: Math.max(1, col),
          end_line: lineNum,
          end_col: col + words[1].length,
          severity: 'error',
          message: `SyntaxError: invalid syntax '${words[1]}'`,
          source: 'syntax',
          code: 'E999',
        });
      } else if (words.length === 1 && /^[a-zA-Z_]\w*$/.test(words[0])) {
        // Single bare identifier on a line (e.g. user typed "k" at the bottom of the script)
        const word = words[0];
        if (!PYTHON_KEYWORDS.has(word) && !knownIdentifiers.has(word)) {
          const col = rawLine.indexOf(word) + 1;
          diagnostics.push({
            line: lineNum,
            col: Math.max(1, col),
            end_line: lineNum,
            end_col: col + word.length,
            severity: 'error',
            message: `undefined name '${word}'`,
            source: 'pyflakes',
            code: 'F821',
          });
        }
      }
    }
  }

  // Unclosed brackets remaining on stack at end of file
  while (bracketStack.length > 0) {
    const unclosed = bracketStack.pop()!;
    diagnostics.push({
      line: unclosed.line,
      col: unclosed.col,
      end_line: unclosed.line,
      end_col: unclosed.col + 1,
      severity: 'error',
      message: `SyntaxError: unclosed '${unclosed.char}'`,
      source: 'syntax',
      code: 'E999',
    });
  }

  return diagnostics;
}
