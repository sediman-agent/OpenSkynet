/**
 * Data Extraction Service
 * Coordinates various data extractors to extract structured data from page text
 */

import { createLogger } from '../../../core/logging.js';
import type { DataExtractor, ExtractedData, ExtractorContext } from './types.js';
import { PriceExtractor } from './price-extractor.js';
import { DateExtractor } from './date-extractor.js';
import { EmailExtractor } from './email-extractor.js';
import { PhoneExtractor } from './phone-extractor.js';
import { NumberExtractor } from './number-extractor.js';
import { QueryExtractor } from './query-extractor.js';

const logger = createLogger('DataExtractionService');

export interface ExtractionResult {
  success: boolean;
  data?: string;
  format?: string;
  confidence?: number;
  error?: string;
}

export class DataExtractionService {
  private extractors: Map<string, DataExtractor>;

  constructor() {
    this.extractors = new Map();
    this.extractors.set('price', new PriceExtractor());
    this.extractors.set('date', new DateExtractor());
    this.extractors.set('email', new EmailExtractor());
    this.extractors.set('phone', new PhoneExtractor());
    this.extractors.set('number', new NumberExtractor());
    this.extractors.set('text', new QueryExtractor());
  }

  /**
   * Extract data from page text based on format and query
   */
  extract(pageText: string, format: string, query: string): ExtractionResult {
    try {
      logger.info(`[DataExtractionService] Extracting data - format: ${format}, query: "${query.slice(0, 50)}"`);
      logger.debug(`[DataExtractionService] Page text length: ${pageText.length}`);

      const extractor = this.extractors.get(format) || this.extractors.get('text')!;

      const context: ExtractorContext = {
        pageText,
        query,
        format,
      };

      const result = extractor.extract(context);

      if (result) {
        logger.info(`[DataExtractionService] Extracted: ${result.type} = "${result.value.slice(0, 100)}" (confidence: ${result.confidence})`);
        return {
          success: true,
          data: result.value,
          format: result.type,
          confidence: result.confidence,
        };
      }

      // Fallback: return a snippet from the page
      const fallbackSnippet = this.getFallbackSnippet(pageText, query);
      logger.info(`[DataExtractionService] Using fallback snippet`);

      return {
        success: true,
        data: fallbackSnippet,
        format: 'text',
        confidence: 0.3,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[DataExtractionService] Extraction error: ${errMsg}`);
      return {
        success: false,
        error: errMsg,
      };
    }
  }

  /**
   * Get a fallback snippet from the page containing query keywords
   */
  private getFallbackSnippet(pageText: string, query: string): string {
    const lines = pageText.split('\n');
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3);

    // Find the most relevant line
    for (const line of lines) {
      const lineLower = line.toLowerCase();
      if (queryWords.some(w => lineLower.includes(w))) {
        return line.trim().slice(0, 300);
      }
    }

    // Return first meaningful line
    return lines.find(l => l.trim().length > 20)?.slice(0, 300).trim() || pageText.slice(0, 300);
  }

  /**
   * Check if a format is supported
   */
  isFormatSupported(format: string): boolean {
    return this.extractors.has(format);
  }

  /**
   * Get list of supported formats
   */
  getSupportedFormats(): string[] {
    return Array.from(this.extractors.keys());
  }

  /**
   * Register a custom extractor
   */
  registerExtractor(format: string, extractor: DataExtractor): void {
    this.extractors.set(format, extractor);
    logger.info(`[DataExtractionService] Registered custom extractor for: ${format}`);
  }
}

// Singleton instance
export const dataExtractionService = new DataExtractionService();
