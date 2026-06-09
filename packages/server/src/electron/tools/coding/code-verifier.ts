/**
 * Code Verifier
 * Verifies syntax and checks code style issues
 */

import { readFile } from 'node:fs/promises';
import type { ToolResultBuilder } from '../../tooling/result-builder.js';
import { LanguageDetector } from './language-detector.js';

/**
 * Verification options
 */
export interface VerificationOptions {
  path: string;
  language?: string;
  checkStyle?: boolean;
  maxIssues?: number;
}

/**
 * Code issue
 */
export interface CodeIssue {
  line: number;
  type: 'syntax' | 'style' | 'warning';
  severity: 'error' | 'warning' | 'info';
  message: string;
  rule?: string;
}

/**
 * Code Verifier
 * This is extracted from electron/tools/coding-tool.ts
 */
export class CodeVerifier {
  private languageDetector: LanguageDetector;

  constructor() {
    this.languageDetector = new LanguageDetector();
  }

  /**
   * Verify file syntax and style
   */
  async verify(
    options: VerificationOptions,
    builder: ToolResultBuilder
  ): Promise<{ success: boolean; issues: CodeIssue[]; error?: string }> {
    const { path, language, checkStyle = true, maxIssues = 100 } = options;

    builder.write(`Verifying: ${path}\n`);

    try {
      const content = await readFile(path, 'utf-8');

      // Detect language if not provided
      const detectedLanguage = language || this.languageDetector.detectFromPath(path);
      builder.write(`Language: ${detectedLanguage}\n`);

      const issues: CodeIssue[] = [];

      // Perform style checks
      if (checkStyle) {
        const styleIssues = this.checkStyle(content, detectedLanguage);
        issues.push(...styleIssues);
      }

      // Perform basic syntax checks
      const syntaxIssues = this.checkBasicSyntax(content, detectedLanguage);
      issues.push(...syntaxIssues);

      // Filter issues by severity and limit
      const filteredIssues = issues.slice(0, maxIssues);

      if (filteredIssues.length === 0) {
        builder.write('\n✓ No issues found\n');
        return { success: true, issues: [] };
      }

      builder.write(`\n--- Found ${filteredIssues.length} issues ---\n`);
      for (const issue of filteredIssues) {
        builder.write(`Line ${issue.line} [${issue.type}]: ${issue.message}\n`);
      }

      if (issues.length > maxIssues) {
        builder.write(`\n... and ${issues.length - maxIssues} more issues\n`);
      }

      return { success: true, issues: filteredIssues };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      builder.write(`Error: ${errorMsg}\n`);
      return { success: false, issues: [], error: errorMsg };
    }
  }

  /**
   * Check code style issues
   */
  private checkStyle(content: string, language: string): CodeIssue[] {
    const issues: CodeIssue[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for tabs
      if (line.includes('\t')) {
        issues.push({
          line: lineNum,
          type: 'style',
          severity: 'warning',
          message: 'Contains tabs instead of spaces',
          rule: 'no-tabs',
        });
      }

      // Check for trailing whitespace
      if (line.trimEnd() !== line.trim()) {
        issues.push({
          line: lineNum,
          type: 'style',
          severity: 'warning',
          message: 'Trailing whitespace',
          rule: 'no-trailing-whitespace',
        });
      }

      // Check line length
      if (line.length > 120) {
        issues.push({
          line: lineNum,
          type: 'style',
          severity: 'warning',
          message: `Line too long (${line.length} chars)`,
          rule: 'max-line-length',
        });
      }

      // Language-specific checks
      if (language === 'javascript' || language === 'typescript') {
        issues.push(...this.checkJavaScriptStyle(line, lineNum));
      } else if (language === 'python') {
        issues.push(...this.checkPythonStyle(line, lineNum));
      }
    }

    return issues;
  }

  /**
   * Check JavaScript/TypeScript style
   */
  private checkJavaScriptStyle(line: string, lineNum: number): CodeIssue[] {
    const issues: CodeIssue[] = [];

    // Check for var usage
    if (/\bvar\s+/.test(line)) {
      issues.push({
        line: lineNum,
        type: 'style',
        severity: 'warning',
        message: 'Use const or let instead of var',
        rule: 'no-var',
      });
    }

    // Check for console.log
    if (/console\.(log|debug|info)/.test(line)) {
      issues.push({
        line: lineNum,
        type: 'style',
        severity: 'info',
        message: 'Console statement found (should be removed in production)',
        rule: 'no-console',
      });
    }

    return issues;
  }

  /**
   * Check Python style
   */
  private checkPythonStyle(line: string, lineNum: number): CodeIssue[] {
    const issues: CodeIssue[] = [];

    // Check for print statements (Python 2 style)
    if (/print\s+[^\(]/.test(line)) {
      issues.push({
        line: lineNum,
        type: 'style',
        severity: 'warning',
        message: 'Use print() function instead of print statement',
        rule: 'print-function',
      });
    }

    // Check for semicolons
    if (line.trim().endsWith(';') && !line.trim().startsWith('#')) {
      issues.push({
        line: lineNum,
        type: 'style',
        severity: 'info',
        message: 'Unnecessary semicolon',
        rule: 'no-semicolon',
      });
    }

    return issues;
  }

  /**
   * Check basic syntax issues
   */
  private checkBasicSyntax(content: string, language: string): CodeIssue[] {
    const issues: CodeIssue[] = [];
    const lines = content.split('\n');

    // Check for unmatched brackets
    const bracketCheck = this.checkBrackets(content);
    if (!bracketCheck.valid) {
      issues.push({
        line: bracketCheck.line || 1,
        type: 'syntax',
        severity: 'error',
        message: `Unmatched ${bracketCheck.bracket}`,
        rule: 'unmatched-brackets',
      });
    }

    // Check for unterminated strings
    const stringCheck = this.checkStrings(content);
    if (!stringCheck.valid) {
      issues.push({
        line: stringCheck.line || 1,
        type: 'syntax',
        severity: 'error',
        message: 'Unterminated string',
        rule: 'unterminated-string',
      });
    }

    return issues;
  }

  /**
   * Check for unmatched brackets
   */
  private checkBrackets(content: string): { valid: boolean; bracket?: string; line?: number } {
    const brackets: Record<string, string> = {
      '(': ')',
      '[': ']',
      '{': '}',
    };

    const stack: Array<{ bracket: string; line: number }> = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip comments and strings
      let inString = false;
      let stringChar = '';
      let escapeNext = false;

      for (const char of line) {
        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (!inString && (char === '"' || char === "'" || char === '`')) {
          inString = true;
          stringChar = char;
          continue;
        }

        if (inString && char === stringChar) {
          inString = false;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          continue;
        }

        if (inString) continue;

        if (char in brackets) {
          stack.push({ bracket: char, line: i + 1 });
        } else if (char === ')' || char === ']' || char === '}') {
          const last = stack.pop();
          if (!last || brackets[last.bracket] !== char) {
            return { valid: false, bracket: char, line: i + 1 };
          }
        }
      }
    }

    if (stack.length > 0) {
      const last = stack[stack.length - 1];
      return { valid: false, bracket: last.bracket, line: last.line };
    }

    return { valid: true };
  }

  /**
   * Check for unterminated strings
   */
  private checkStrings(content: string): { valid: boolean; line?: number } {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let inString = false;
      let stringChar = '';
      let escapeNext = false;

      for (const char of line) {
        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (!inString && (char === '"' || char === "'" || char === '`')) {
          inString = true;
          stringChar = char;
          continue;
        }

        if (inString && char === stringChar) {
          inString = false;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          continue;
        }
      }

      if (inString) {
        return { valid: false, line: i + 1 };
      }
    }

    return { valid: true };
  }

  /**
   * Get issue statistics
   */
  getStatistics(issues: CodeIssue[]): {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  } {
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const issue of issues) {
      byType[issue.type] = (byType[issue.type] ?? 0) + 1;
      bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
    }

    return {
      total: issues.length,
      byType,
      bySeverity,
    };
  }
}
