import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

interface ExecutionResult {
  stdout: string;
  stderr: string;
  success: boolean;
  executionTimeMs: number;
}

class CodeInterpreterTool {
  private readonly maxExecutionTimeMs = 10000; // 10 seconds max
  private readonly maxOutputLength = 10000; // 10K chars max output

  /**
   * Execute JavaScript code in a sandboxed environment
   * Uses Node.js with restricted permissions and timeout
   */
  async execute(code: string): Promise<string> {
    const startTime = Date.now();

    try {
      // Validate and sanitize code
      const validationResult = this.validateCode(code);
      if (!validationResult.valid) {
        return `Security Error: ${validationResult.reason}`;
      }

      // Create a temporary file for execution
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `koda_exec_${Date.now()}.js`);

      // Wrap code in a sandbox with limited globals
      const sandboxedCode = this.createSandboxedCode(code);

      // Write to temp file
      fs.writeFileSync(tempFile, sandboxedCode, 'utf8');

      try {
        // Execute with timeout and resource limits
        const result = await this.executeWithTimeout(tempFile);

        // Clean up temp file
        fs.unlinkSync(tempFile);

        if (!result.success) {
          return `Execution Error:\n${result.stderr}`;
        }

        // Truncate output if too long
        let output = result.stdout.trim();
        if (output.length > this.maxOutputLength) {
          output = output.substring(0, this.maxOutputLength) + '\n... (output truncated)';
        }

        if (output.length === 0) {
          return 'Code executed successfully (no output). Use console.log() to see results.';
        }

        return `Output:\n${output}`;
      } catch (execError: any) {
        // Clean up temp file on error
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
        throw execError;
      }
    } catch (error: any) {
      const executionTimeMs = Date.now() - startTime;
      console.error(`[CodeInterpreter] Execution failed after ${executionTimeMs}ms:`, error.message);

      if (error.killed) {
        return `Execution Error: Code execution timed out after ${this.maxExecutionTimeMs}ms. Simplify your code or break it into smaller parts.`;
      }

      return `Execution Error: ${error.message}`;
    }
  }

  /**
   * Validate code for security concerns
   */
  private validateCode(code: string): { valid: boolean; reason?: string } {
    // List of dangerous patterns
    const dangerousPatterns = [
      { pattern: /require\s*\(\s*['"]child_process['"]\s*\)/i, reason: 'child_process module is not allowed' },
      { pattern: /require\s*\(\s*['"]fs['"]\s*\)/i, reason: 'fs module is not allowed' },
      { pattern: /require\s*\(\s*['"]net['"]\s*\)/i, reason: 'net module is not allowed' },
      { pattern: /require\s*\(\s*['"]http['"]\s*\)/i, reason: 'http module is not allowed' },
      { pattern: /require\s*\(\s*['"]https['"]\s*\)/i, reason: 'https module is not allowed' },
      { pattern: /require\s*\(\s*['"]dgram['"]\s*\)/i, reason: 'dgram module is not allowed' },
      { pattern: /require\s*\(\s*['"]cluster['"]\s*\)/i, reason: 'cluster module is not allowed' },
      { pattern: /process\.exit/i, reason: 'process.exit is not allowed' },
      { pattern: /process\.kill/i, reason: 'process.kill is not allowed' },
      { pattern: /process\.env/i, reason: 'process.env access is not allowed' },
      { pattern: /global\./i, reason: 'global object access is not allowed' },
      { pattern: /globalThis\./i, reason: 'globalThis access is not allowed' },
      { pattern: /import\s*\(/i, reason: 'dynamic imports are not allowed' },
      { pattern: /eval\s*\(/i, reason: 'eval is not allowed' },
      { pattern: /Function\s*\(/i, reason: 'Function constructor is not allowed' },
      { pattern: /\.constructor/i, reason: 'constructor access is not allowed' },
      { pattern: /__proto__/i, reason: '__proto__ access is not allowed' },
      { pattern: /prototype\./i, reason: 'prototype access is not allowed' },
    ];

    for (const { pattern, reason } of dangerousPatterns) {
      if (pattern.test(code)) {
        return { valid: false, reason };
      }
    }

    // Check code length
    if (code.length > 50000) {
      return { valid: false, reason: 'Code is too long (max 50,000 characters)' };
    }

    return { valid: true };
  }

  /**
   * Create sandboxed code with limited globals
   */
  private createSandboxedCode(code: string): string {
    return `
'use strict';

// Sandbox: Remove dangerous globals
const _originalGlobal = global;
const _originalProcess = process;

// Create safe console
const safeConsole = {
  log: (...args) => console.log(...args),
  error: (...args) => console.error(...args),
  warn: (...args) => console.warn(...args),
  info: (...args) => console.info(...args),
  table: (...args) => console.table(...args),
};

// Safe Math object (already safe)
const safeMath = Math;

// Safe JSON object
const safeJSON = JSON;

// Safe Array methods
const safeArray = Array;

// Safe Object methods (limited)
const safeObject = {
  keys: Object.keys,
  values: Object.values,
  entries: Object.entries,
  assign: Object.assign,
  fromEntries: Object.fromEntries,
};

// Safe Date
const safeDate = Date;

// Safe String methods
const safeString = String;

// Safe Number methods
const safeNumber = Number;

// Safe Boolean
const safeBoolean = Boolean;

// Safe Set and Map
const safeSet = Set;
const safeMap = Map;

// Safe Promise
const safePromise = Promise;

// Safe setTimeout (with limit)
const safeSetTimeout = (fn, delay) => {
  if (delay > 5000) delay = 5000; // Max 5 second delay
  return setTimeout(fn, delay);
};

// Execute user code in limited scope
(function() {
  const console = safeConsole;
  const Math = safeMath;
  const JSON = safeJSON;
  const Array = safeArray;
  const Object = safeObject;
  const Date = safeDate;
  const String = safeString;
  const Number = safeNumber;
  const Boolean = safeBoolean;
  const Set = safeSet;
  const Map = safeMap;
  const Promise = safePromise;
  const setTimeout = safeSetTimeout;

  // Block dangerous globals
  const process = undefined;
  const global = undefined;
  const globalThis = undefined;
  const require = undefined;
  const module = undefined;
  const exports = undefined;
  const __dirname = undefined;
  const __filename = undefined;

  // User code starts here
  ${code}
})();
`;
  }

  /**
   * Execute code with timeout
   */
  private async executeWithTimeout(filePath: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(`node "${filePath}"`, {
        timeout: this.maxExecutionTimeMs,
        maxBuffer: 1024 * 1024, // 1MB max buffer
        windowsHide: true,
      });

      return {
        stdout: stdout || '',
        stderr: stderr || '',
        success: true,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || 'Unknown error',
        success: false,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Quick evaluation for simple expressions (no file I/O)
   */
  async evaluateExpression(expression: string): Promise<string> {
    try {
      // Only allow simple mathematical expressions
      const safeExpression = expression.replace(/[^0-9+\-*/().%\s]/g, '');

      if (safeExpression !== expression) {
        return 'Error: Only mathematical expressions are allowed in quick evaluation.';
      }

      // Use Function constructor for simple eval (relatively safe for math only)
      const result = new Function(`return (${safeExpression})`)();
      return `Result: ${result}`;
    } catch (error: any) {
      return `Evaluation Error: ${error.message}`;
    }
  }
}

export const codeInterpreterTool = new CodeInterpreterTool();
