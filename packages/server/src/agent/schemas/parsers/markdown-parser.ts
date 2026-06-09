/**
 * Markdown Parsing Strategy
 * Parses Markdown tables from LLM responses
 */

import { createLogger } from '../../core/logging.js';

const logger = createLogger('MarkdownParser');

export interface ParseResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface TableData {
  headers: string[];
  rows: any[];
}

/**
 * Markdown Parser handles table extraction from Markdown text
 */
export class MarkdownParser {
  /**
   * Parse Markdown table from text
   */
  parse(text: string): ParseResult {
    try {
      const lines = text.split('\n').filter(line => line.trim());
      const headers: string[] = [];
      const rows: any[] = [];

      let inTable = false;
      let currentRow: any = {};

      for (const line of lines) {
        // Check if this looks like a table row
        if (this.isTableRow(line)) {
          inTable = true;
          const cells = this.extractCells(line);

          if (headers.length === 0 && cells.length > 0) {
            // First row is headers
            headers.push(...cells);
          } else if (cells.length === headers.length) {
            // Data row
            const row: any = {};
            headers.forEach((header, i) => {
              row[header] = cells[i] || '';
            });
            rows.push(row);
          }
        } else if (inTable) {
          // End of table
          break;
        }
      }

      if (headers.length === 0) {
        return {
          success: false,
          error: 'No valid Markdown table found'
        };
      }

      logger.debug(`[MarkdownParser] Parsed table with ${headers.length} columns and ${rows.length} rows`);

      return {
        success: true,
        data: { headers, rows } as TableData
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.debug(`[MarkdownParser] Parse failed: ${message}`);
      return {
        success: false,
        error: `Failed to parse Markdown table: ${message}`
      };
    }
  }

  /**
   * Check if line looks like a table row
   */
  private isTableRow(line: string): boolean {
    return line.includes('|') && line.trim().startsWith('|');
  }

  /**
   * Extract cells from a table row
   */
  private extractCells(line: string): string[] {
    return line
      .split('|')
      .map(cell => cell.trim())
      .filter(cell => cell.length > 0);
  }

  /**
   * Find table in text
   */
  findTable(text: string): string | null {
    const lines = text.split('\n');
    const tableLines: string[] = [];
    let inTable = false;

    for (const line of lines) {
      if (this.isTableRow(line)) {
        inTable = true;
        tableLines.push(line);
      } else if (inTable) {
        // Continue or end
        if (line.trim().length === 0 || !line.includes('|')) {
          break;
        }
        tableLines.push(line);
      }
    }

    return tableLines.length > 0 ? tableLines.join('\n') : null;
  }
}
