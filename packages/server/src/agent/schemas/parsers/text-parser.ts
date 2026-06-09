/**
 * Text Parsing Strategy
 * Parses plain text and key-value pairs
 */

import { createLogger } from '../../../core/logging.js';

const logger = createLogger('TextParser');

export interface ParseResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Text Parser handles plain text and key-value extraction
 */
export class TextParser {
  /**
   * Parse key-value pairs from text
   */
  parseKeyValue(text: string): ParseResult {
    try {
      const data: any = {};
      const lines = text.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Try different separators
        const patterns = [
          /^([^:]+):\s*(.+)$/,      // "key: value"
          /^([^=]+)=\s*(.+)$/,      // "key=value"
          /^([^|]+)\|\s*(.+)$/,    // "key | value"
        ];

        for (const pattern of patterns) {
          const match = trimmed.match(pattern);
          if (match) {
            const key = match[1].trim();
            const value = match[2].trim();
            data[key] = value;
            break;
          }
        }
      }

      if (Object.keys(data).length === 0) {
        return {
          success: false,
          error: 'No valid key-value pairs found'
        };
      }

      logger.debug(`[TextParser] Found ${Object.keys(data).length} key-value pairs`);

      return {
        success: true,
        data
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to parse key-value pairs: ${message}`
      };
    }
  }

  /**
   * Parse plain text (return as-is)
   */
  parsePlainText(text: string): ParseResult {
    const trimmed = text.trim();

    if (trimmed.length === 0) {
      return {
        success: false,
        error: 'Text is empty'
      };
    }

    return {
      success: true,
      data: trimmed
    };
  }

  /**
   * Extract data from text based on patterns
   */
  extractPatterns(text: string, patterns: Record<string, RegExp>): Record<string, string[]> {
    const results: Record<string, string[]> = {};

    for (const [key, pattern] of Object.entries(patterns)) {
      const matches = text.match(new RegExp(pattern, 'gi'));
      if (matches) {
        results[key] = matches;
      }
    }

    return results;
  }

  /**
   * Clean and normalize text
   */
  cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/\n{3,}/g, '\n\n')  // Reduce multiple newlines
      .trim();
  }

  /**
   * Extract sentences from text
   */
  extractSentences(text: string): string[] {
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }
}
