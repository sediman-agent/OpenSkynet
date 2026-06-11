/**
 * XML Parsing Strategy
 * Parses XML responses from LLMs
 */

import { createLogger } from '../../core/logging';

const logger = createLogger('XmlParser');

export interface ParseResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * XML Parser handles XML extraction and parsing
 */
export class XmlParser {
  /**
   * Parse XML from text
   */
  parse(text: string): ParseResult {
    try {
      let xmlText = text;

      // Extract XML from markdown code blocks
      const codeBlockMatch = text.match(/```(?:xml)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        xmlText = codeBlockMatch[1];
      }

      // Find XML content if not in code block
      if (!codeBlockMatch) {
        const xmlMatch = text.match(/<[\s\S]*?>[\s\S]*?<\/[\s\S]*?>|<[\s\S]*?\/>/);
        if (xmlMatch) {
          xmlText = xmlMatch[0];
        }
      }

      // Simple XML parsing - extract element values
      const data: any = {};
      const pattern = /<(\w+)(?:\s+[^>]+)?>[\s\S]*?<\/\1>|<(\w+)(?:\s+[^>]+)?\s*\/>/g;
      let match;

      while ((match = pattern.exec(xmlText)) !== null) {
        const [, fullTag, selfClosingTag] = match;
        const tagName = selfClosingTag || fullTag;

        // Extract value between tags
        const valuePattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
        const valueMatch = xmlText.match(valuePattern);

        if (valueMatch) {
          let value = valueMatch[1];

          // Try to parse as JSON first
          try {
            data[tagName] = JSON.parse(value);
          } catch {
            // Use as string if not valid JSON
            data[tagName] = value.trim();
          }
        } else {
          // Self-closing or empty tag
          data[tagName] = null;
        }
      }

      if (Object.keys(data).length === 0) {
        return {
          success: false,
          error: 'No valid XML elements found'
        };
      }

      logger.debug('[XmlParser] XML parsed successfully');
      return {
        success: true,
        data
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.debug(`[XmlParser] XML parse failed: ${message}`);
      return {
        success: false,
        error: `Failed to parse XML: ${message}`
      };
    }
  }

  /**
   * Extract XML content
   */
  extractXml(text: string): string | null {
    const patterns = [
      /```(?:xml)?\s*\n?([\s\S]*?)\n?```/,
      /<[\s\S]*?>[\s\S]*?<\/[\s\S]*?>/,
      /<[\s\S]*?\/>/
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }

    return null;
  }
}
