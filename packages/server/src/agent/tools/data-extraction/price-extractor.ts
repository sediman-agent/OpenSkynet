/**
 * Price Data Extractor
 * Extracts price values from text in various formats
 */

import type { DataExtractor, ExtractedData, ExtractorContext } from './types.js';

export class PriceExtractor implements DataExtractor {
  readonly name = 'price';

  private patterns = [
    /[\$€£¥]\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g,  // $123.45, $1,234.56, €99
    /\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s?(?:USD|EUR|GBP|JPY|CNY|CAD|AUD)/gi, // 123.45 USD
    /\b\d+\.\d{2}\s*(?:dollars?|euros?|pounds?)\b/gi, // 123.45 dollars
  ];

  extract(context: ExtractorContext): ExtractedData | null {
    const { pageText } = context;

    for (const pattern of this.patterns) {
      // Reset lastIndex for global regex
      pattern.lastIndex = 0;
      const matches = pageText.match(pattern);

      if (matches && matches.length > 0) {
        // Return the first match found
        const value = matches[0].trim();
        return {
          type: 'price',
          value,
          confidence: this.calculateConfidence(value),
        };
      }
    }

    return null;
  }

  private calculateConfidence(value: string): number {
    // Higher confidence for standard currency symbols
    if (/^[\$€£¥]/.test(value)) return 0.95;
    // Medium confidence for currency codes
    if (/(USD|EUR|GBP|JPY|CNY)/i.test(value)) return 0.85;
    // Lower confidence for written currency names
    return 0.7;
  }
}
