/**
 * Search Operations
 * Handles text and regex search in files
 */

import { readFile } from 'node:fs/promises';
import type { ToolResultBuilder } from '../../tooling/result-builder.js';

/**
 * Search options
 */
export interface SearchOptions {
  path: string;
  searchTerm: string;
  caseSensitive?: boolean;
  regex?: boolean;
  maxResults?: number;
}

/**
 * Search result
 */
export interface SearchResult {
  line: number;
  content: string;
  filePath: string;
  matchPosition?: {
    start: number;
    end: number;
    matchedText: string;
  };
}

/**
 * Search Operations Handler
 * This is extracted from electron/tools/coding-tool.ts
 */
export class SearchOperationsHandler {
  /**
   * Search for text/regex patterns in a file
   */
  async search(
    options: SearchOptions,
    builder: ToolResultBuilder
  ): Promise<{ success: boolean; results: SearchResult[]; error?: string }> {
    const {
      path,
      searchTerm,
      caseSensitive = false,
      regex = false,
      maxResults = 1000
    } = options;

    builder.write(`Searching in: ${path}\n`);
    builder.write(`Term: ${searchTerm}\n`);
    builder.write(`Case sensitive: ${caseSensitive}\n`);
    builder.write(`Regex: ${regex}\n`);

    try {
      const content = await readFile(path, 'utf-8');
      const lines = content.split('\n');

      const results = await this.performSearch(
        lines,
        searchTerm,
        caseSensitive,
        regex,
        path,
        maxResults
      );

      builder.write(`\n--- Found ${results.length} matches ---\n`);
      for (const match of results.slice(0, 100)) {
        builder.write(`Line ${match.line}: ${match.content.trim()}\n`);
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
   * Perform search on lines
   */
  private async performSearch(
    lines: string[],
    searchTerm: string,
    caseSensitive: boolean,
    regex: boolean,
    filePath: string,
    maxResults: number
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const normalizedSearch = caseSensitive ? searchTerm : searchTerm.toLowerCase();

    for (let i = 0; i < lines.length && results.length < maxResults; i++) {
      const line = lines[i];
      const normalizedLine = caseSensitive ? line : line.toLowerCase();

      let isMatch = false;
      let matchPosition: SearchResult['matchPosition'] | undefined;

      if (regex) {
        try {
          const searchRegex = new RegExp(searchTerm, caseSensitive ? 'g' : 'gi');
          const regexResult = searchRegex.exec(line);
          if (regexResult) {
            isMatch = true;
            matchPosition = {
              start: regexResult.index,
              end: regexResult.index + regexResult[0].length,
              matchedText: regexResult[0],
            };
          }
        } catch (error) {
          // Invalid regex, treat as literal search
          isMatch = normalizedLine.includes(normalizedSearch);
        }
      } else {
        const position = normalizedLine.indexOf(normalizedSearch);
        if (position !== -1) {
          isMatch = true;
          matchPosition = {
            start: position,
            end: position + searchTerm.length,
            matchedText: line.slice(position, position + searchTerm.length),
          };
        }
      }

      if (isMatch) {
        results.push({
          line: i + 1,
          content: line,
          filePath,
          matchPosition,
        });
      }
    }

    return results;
  }

  /**
   * Search for multiple terms at once
   */
  async searchMultiple(
    filePath: string,
    searchTerms: string[],
    caseSensitive = false
  ): Promise<Map<string, SearchResult[]>> {
    const results = new Map<string, SearchResult[]>();

    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      for (const term of searchTerms) {
        const termResults: SearchResult[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = caseSensitive ? lines[i] : lines[i].toLowerCase();
          const search = caseSensitive ? term : term.toLowerCase();

          if (line.includes(search)) {
            termResults.push({
              line: i + 1,
              content: lines[i],
              filePath,
            });
          }
        }

        results.set(term, termResults);
      }
    } catch (error) {
      // Return empty results on error
    }

    return results;
  }

  /**
   * Replace text in file
   */
  async replace(
    filePath: string,
    searchTerm: string,
    replacement: string,
    caseSensitive = false,
    regex = false,
    dryRun = true
  ): Promise<{ success: boolean; replacements: number; error?: string }> {
    try {
      const content = await readFile(filePath, 'utf-8');
      let newContent = content;
      let replacements = 0;

      if (regex) {
        const flags = caseSensitive ? 'g' : 'gi';
        const searchRegex = new RegExp(searchTerm, flags);
        const matches = content.match(searchRegex);
        replacements = matches ? matches.length : 0;

        if (!dryRun) {
          newContent = content.replace(searchRegex, replacement);
        }
      } else {
        const search = caseSensitive ? searchTerm : searchTerm.toLowerCase();
        const contentForSearch = caseSensitive ? content : content.toLowerCase();

        let position = 0;
        while ((position = contentForSearch.indexOf(search, position)) !== -1) {
          replacements++;
          position += search.length;
        }

        if (!dryRun) {
          if (caseSensitive) {
            newContent = content.split(searchTerm).join(replacement);
          } else {
            // Case-insensitive replacement requires regex
            const escapedSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            newContent = content.replace(new RegExp(escapedSearch, 'gi'), replacement);
          }
        }
      }

      if (!dryRun && replacements > 0) {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(filePath, newContent, 'utf-8');
      }

      return { success: true, replacements };
    } catch (error) {
      return {
        success: false,
        replacements: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
