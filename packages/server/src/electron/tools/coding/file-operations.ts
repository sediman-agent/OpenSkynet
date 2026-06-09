/**
 * File Operations
 * Handles file editing operations with backup and validation
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ToolResultBuilder } from '../../tooling/result-builder.js';

/**
 * File edit options
 */
export interface FileEditOptions {
  path: string;
  startLine: number;
  endLine: number;
  newContent: string;
  createBackup?: boolean;
}

/**
 * File edit result
 */
export interface FileEditResult {
  success: boolean;
  originalLines: string[];
  newLines: string[];
  linesReplaced: number;
  linesAdded: number;
  backupPath?: string;
  error?: string;
}

/**
 * File Operations Handler
 * This is extracted from electron/tools/coding-tool.ts
 */
export class FileOperationsHandler {
  /**
   * Edit specific lines in a file
   */
  async editFile(
    options: FileEditOptions,
    builder: ToolResultBuilder
  ): Promise<FileEditResult> {
    const {
      path,
      startLine,
      endLine,
      newContent,
      createBackup = false
    } = options;

    builder.write(`Editing file: ${path}\n`);
    builder.write(`Lines ${startLine}-${endLine}\n`);

    try {
      const content = await readFile(path, 'utf-8');
      const lines = content.split('\n');

      // Validate line numbers
      const validationResult = this.validateLineNumbers(lines, startLine, endLine);
      if (!validationResult.valid) {
        builder.write(`Error: ${validationResult.error}\n`);
        return {
          success: false,
          originalLines: lines,
          newLines: lines,
          linesReplaced: 0,
          linesAdded: 0,
          error: validationResult.error,
        };
      }

      // Create backup if requested
      let backupPath: string | undefined;
      if (createBackup) {
        backupPath = `${path}.backup`;
        await writeFile(backupPath, content, 'utf-8');
        builder.write(`Backup created: ${backupPath}\n`);
      }

      // Show original lines
      builder.write('\n--- Original Lines ---\n');
      for (let i = startLine - 1; i < endLine; i++) {
        builder.write(`${i + 1}: ${lines[i]}\n`);
      }

      // Perform the edit
      const newLines = newContent.split('\n');
      lines.splice(startLine - 1, endLine - startLine + 1, ...newLines);

      // Ensure directory exists
      await mkdir(dirname(path), { recursive: true });

      // Write the updated content
      await writeFile(path, lines.join('\n'), 'utf-8');

      // Show new lines
      builder.write('\n--- New Lines ---\n');
      for (let i = startLine - 1; i < startLine - 1 + newLines.length; i++) {
        builder.write(`${i + 1}: ${lines[i]}\n`);
      }

      return {
        success: true,
        originalLines: content.split('\n'),
        newLines: lines,
        linesReplaced: endLine - startLine + 1,
        linesAdded: newLines.length,
        backupPath,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      builder.write(`Error: ${errorMsg}\n`);
      return {
        success: false,
        originalLines: [],
        newLines: [],
        linesReplaced: 0,
        linesAdded: 0,
        error: errorMsg,
      };
    }
  }

  /**
   * Validate line numbers
   */
  private validateLineNumbers(
    lines: string[],
    startLine: number,
    endLine: number
  ): { valid: boolean; error?: string } {
    if (startLine < 1 || startLine > lines.length) {
      return {
        valid: false,
        error: `Invalid start_line: ${startLine} (file has ${lines.length} lines)`,
      };
    }

    if (endLine < startLine || endLine > lines.length) {
      return {
        valid: false,
        error: `Invalid end_line: ${endLine} (file has ${lines.length} lines)`,
      };
    }

    return { valid: true };
  }

  /**
   * Read file content safely
   */
  async readFileSafe(path: string): Promise<{ success: boolean; content?: string; error?: string }> {
    try {
      const content = await readFile(path, 'utf-8');
      return { success: true, content };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Write file content safely with directory creation
   */
  async writeFileSafe(path: string, content: string): Promise<{ success: boolean; error?: string }> {
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, 'utf-8');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create backup of a file
   */
  async createBackup(path: string): Promise<{ success: boolean; backupPath?: string; error?: string }> {
    try {
      const backupPath = `${path}.backup`;
      const content = await readFile(path, 'utf-8');
      await writeFile(backupPath, content, 'utf-8');
      return { success: true, backupPath };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Calculate line diff
   */
  calculateDiff(original: string[], modified: string[]): {
    added: number;
    removed: number;
    unchanged: number;
  } {
    const originalSet = new Set(original);
    const modifiedSet = new Set(modified);

    const added = modified.filter(line => !originalSet.has(line)).length;
    const removed = original.filter(line => !modifiedSet.has(line)).length;
    const unchanged = modified.filter(line => originalSet.has(line)).length;

    return { added, removed, unchanged };
  }
}
