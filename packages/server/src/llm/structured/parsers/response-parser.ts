/**
 * Structured Response Parser
 * Extracts and parses structured data from LLM responses
 */

import { createLogger } from '../../../core/logging.js';

const logger = createLogger('StructuredResponseParser');

export interface ParseResult {
  success: boolean;
  data?: any;
  error?: string;
  raw?: string;
}

/**
 * Response Parser handles extraction of structured data from LLM responses
 * This is extracted from structured-provider.ts
 */
export class StructuredResponseParser {
  /**
   * Parse JSON from response text
   */
  parseJson(text: string): ParseResult {
    try {
      // Extract JSON from markdown code blocks if present
      let jsonText = text;

      const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1];
      } else {
        // Try to find JSON object in the text
        const objectMatch = text.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          jsonText = objectMatch[0];
        }
      }

      const parsed = JSON.parse(jsonText);
      logger.debug('[ResponseParser] JSON parsed successfully');

      return {
        success: true,
        data: parsed,
        raw: jsonText
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.debug(`[ResponseParser] JSON parse failed: ${message}`);
      return {
        success: false,
        error: `Failed to parse JSON: ${message}`
      };
    }
  }

  /**
   * Parse XML from response text
   */
  parseXml(text: string, rootElement: string = 'root'): ParseResult {
    try {
      // Extract XML from markdown code blocks if present
      let xmlText = text;

      const codeBlockMatch = text.match(/```(?:xml)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        xmlText = codeBlockMatch[1];
      }

      // Simple XML parsing - extract key-value pairs
      const data: any = {};
      const pattern = /<(\w+)>([\s\S]*?)<\/\1>/g;
      let match;

      while ((match = pattern.exec(xmlText)) !== null) {
        const [, key, value] = match;
        // Try to parse as JSON first, then as string
        try {
          data[key] = JSON.parse(value);
        } catch {
          data[key] = value.trim();
        }
      }

      if (Object.keys(data).length === 0) {
        return {
          success: false,
          error: 'No valid XML elements found'
        };
      }

      return {
        success: true,
        data,
        raw: xmlText
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to parse XML: ${message}`
      };
    }
  }

  /**
   * Parse Markdown table from response text
   */
  parseMarkdownTable(text: string): ParseResult {
    try {
      const lines = text.split('\n').filter(line => line.trim());
      const headers: string[] = [];
      const rows: any[] = [];

      let inTable = false;

      for (const line of lines) {
        // Check if this looks like a table row
        if (line.includes('|') && line.trim().startsWith('|')) {
          inTable = true;
          const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());

          if (headers.length === 0) {
            headers.push(...cells);
          } else {
            if (cells.length === headers.length) {
              const row: any = {};
              headers.forEach((header, i) => {
                row[header] = cells[i] || '';
              });
              rows.push(row);
            }
          }
        } else if (inTable && line.includes('|')) {
          // Continuation of table
          const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
          if (cells.length === headers.length && cells[0]) {
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

      if (headers.length === 0 || rows.length === 0) {
        return {
          success: false,
          error: 'No valid Markdown table found'
        };
      }

      return {
        success: true,
        data: { headers, rows }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to parse Markdown table: ${message}`
      };
    }
  }

  /**
   * Parse plain text key-value pairs
   */
  parseKeyValue(text: string): ParseResult {
    try {
      const data: any = {};
      const lines = text.split('\n');

      for (const line of lines) {
        // Match patterns like "key: value" or "key=value"
        const colonMatch = line.match(/^([^:]+):\s*(.+)$/);
        const equalMatch = line.match(/^([^=]+)=\s*(.+)$/);

        if (colonMatch) {
          const key = colonMatch[1].trim();
          const value = colonMatch[2].trim();
          data[key] = value;
        } else if (equalMatch) {
          const key = equalMatch[1].trim();
          const value = equalMatch[2].trim();
          data[key] = value;
        }
      }

      if (Object.keys(data).length === 0) {
        return {
          success: false,
          error: 'No valid key-value pairs found'
        };
      }

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
   * Auto-detect format and parse
   */
  autoParse(text: string): ParseResult {
    // Try JSON first
    if (text.includes('{') && text.includes('}')) {
      const jsonResult = this.parseJson(text);
      if (jsonResult.success) return jsonResult;
    }

    // Try XML
    if (text.includes('<') && text.includes('>')) {
      const xmlResult = this.parseXml(text);
      if (xmlResult.success) return xmlResult;
    }

    // Try Markdown table
    if (text.includes('|')) {
      const tableResult = this.parseMarkdownTable(text);
      if (tableResult.success) return tableResult;
    }

    // Fall back to key-value
    return this.parseKeyValue(text);
  }
}
