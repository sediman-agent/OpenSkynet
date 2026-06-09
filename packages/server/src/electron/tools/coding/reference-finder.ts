/**
 * Reference Finder
 * Finds references to identifiers across multiple files
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ToolResultBuilder } from '../../tooling/result-builder.js';
import type { AbortSignal } from '../../core/types.js';

/**
 * Reference finder options
 */
export interface FindRefsOptions {
  path: string;
  identifier: string;
  filePattern?: string;
  maxResults?: number;
  signal?: AbortSignal;
}

/**
 * Reference result
 */
export interface ReferenceResult {
  file: string;
  line: number;
  content: string;
  context?: {
    before: string;
    after: string;
  };
}

/**
 * Reference Finder
 * This is extracted from electron/tools/coding-tool.ts
 */
export class ReferenceFinder {
  private readonly DEFAULT_FILE_PATTERN = '*.{ts,js,tsx,jsx,py,rs,go,java}';
  private readonly DEFAULT_MAX_RESULTS = 1000;
  private readonly IGNORED_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    'target',
    'bin',
    'obj',
    '.next',
    '.nuxt',
    'coverage',
  ]);

  /**
   * Find references to an identifier
   */
  async findReferences(
    options: FindRefsOptions,
    builder: ToolResultBuilder
  ): Promise<{ success: boolean; results: ReferenceResult[]; error?: string }> {
    const {
      path,
      identifier,
      filePattern = this.DEFAULT_FILE_PATTERN,
      maxResults = this.DEFAULT_MAX_RESULTS,
      signal,
    } = options;

    builder.write(`Finding references to: ${identifier}\n`);
    builder.write(`In: ${path}\n`);
    builder.write(`Pattern: ${filePattern}\n`);

    try {
      const results: ReferenceResult[] = [];
      const searchPattern = this.buildWordBoundaryPattern(identifier);

      await this.searchDirectory(path, filePattern, searchPattern, results, maxResults, signal);

      builder.write(`\n--- Found ${results.length} references ---\n`);
      for (const match of results.slice(0, 100)) {
        builder.write(`${match.file}:${match.line}: ${match.content}\n`);
      }

      if (results.length > 100) {
        builder.write(`\n... and ${results.length - 100} more matches\n`);
      }

      return { success: true, results };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      builder.write(`Error: ${errorMsg}\n`);
      return { success: false, results: [], error: errorMsg };
    }
  }

  /**
   * Search directory recursively
   */
  private async searchDirectory(
    dir: string,
    filePattern: string,
    searchPattern: string,
    results: ReferenceResult[],
    maxResults: number,
    signal?: AbortSignal
  ): Promise<void> {
    if (signal?.aborted || results.length >= maxResults) {
      return;
    }

    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (signal?.aborted || results.length >= maxResults) {
        return;
      }

      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (this.shouldIgnoreDirectory(entry.name)) {
          continue;
        }
        await this.searchDirectory(fullPath, filePattern, searchPattern, results, maxResults, signal);
      } else if (entry.isFile()) {
        if (this.matchesFilePattern(entry.name, filePattern)) {
          await this.searchFile(fullPath, searchPattern, results, maxResults, signal);
        }
      }
    }
  }

  /**
   * Search a single file for references
   */
  private async searchFile(
    filePath: string,
    searchPattern: string,
    results: ReferenceResult[],
    maxResults: number,
    signal?: AbortSignal
  ): Promise<void> {
    if (signal?.aborted || results.length >= maxResults) {
      return;
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const regex = new RegExp(searchPattern, 'g');

      for (let i = 0; i < lines.length && results.length < maxResults; i++) {
        if (signal?.aborted) {
          return;
        }

        regex.lastIndex = 0; // Reset regex for each line
        if (regex.test(lines[i])) {
          results.push({
            file: filePath,
            line: i + 1,
            content: lines[i].trim(),
          });
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  /**
   * Build regex pattern with word boundaries
   */
  private buildWordBoundaryPattern(identifier: string): string {
    return `\\b${identifier}\\b`;
  }

  /**
   * Check if directory should be ignored
   */
  private shouldIgnoreDirectory(name: string): boolean {
    return name.startsWith('.') || this.IGNORED_DIRS.has(name);
  }

  /**
   * Check if filename matches pattern
   */
  private matchesFilePattern(filename: string, pattern: string): boolean {
    // Simple glob pattern matching
    const patterns = pattern
      .split(',')
      .map(p => p.trim())
      .filter(p => p);

    for (const p of patterns) {
      if (this.matchGlob(filename, p)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Simple glob pattern matching
   */
  private matchGlob(filename: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(filename);
  }

  /**
   * Find definitions (not just references)
   */
  async findDefinitions(
    identifier: string,
    searchPath: string,
    signal?: AbortSignal
  ): Promise<ReferenceResult[]> {
    const results: ReferenceResult[] = [];
    const definitionPatterns = this.buildDefinitionPatterns(identifier);

    for (const pattern of definitionPatterns) {
      await this.searchDirectory(
        searchPath,
        '*.ts',
        pattern,
        results,
        100,
        signal
      );
    }

    return results;
  }

  /**
   * Build regex patterns for finding definitions
   */
  private buildDefinitionPatterns(identifier: string): string[] {
    return [
      `(function|class|const|let|var|interface|type)\\s+${identifier}\\b`,
      `${identifier}\\s*[=:]\\s*(function|class|async\\s*function)`,
      `export\\s+(function|class|const|let|var)\\s+${identifier}`,
    ];
  }

  /**
   * Get reference statistics
   */
  getStatistics(results: ReferenceResult[]): {
    total: number;
    byFile: Map<string, number>;
    topFiles: Array<{ file: string; count: number }>;
  } {
    const byFile = new Map<string, number>();

    for (const result of results) {
      const count = byFile.get(result.file) ?? 0;
      byFile.set(result.file, count + 1);
    }

    const topFiles = Array.from(byFile.entries())
      .map(([file, count]) => ({ file, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      total: results.length,
      byFile,
      topFiles,
    };
  }
}
