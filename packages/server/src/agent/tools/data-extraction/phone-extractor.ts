/**
 * Phone Data Extractor
 * Extracts phone numbers from text in various formats
 */

import type { DataExtractor, ExtractedData, ExtractorContext } from './types.js';

export class PhoneExtractor implements DataExtractor {
  readonly name = 'phone';

  private patterns = [
    // US format: 123-456-7890, (123) 456-7890, 123.456.7890
    /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    // International: +1 234 567 8900, +44 20 1234 5678
    /\+\d{1,3}\s?\d{3,}\s?\d{3,}\s?\d{4}\b/g,
    // European style: 020 1234 5678
    /\b0\d{2,}\s?\d{3,}\s?\d{4}\b/g,
  ];

  extract(context: ExtractorContext): ExtractedData | null {
    const { pageText } = context;

    for (const pattern of this.patterns) {
      pattern.lastIndex = 0;
      const matches = pageText.match(pattern);
      if (matches && matches.length > 0) {
        const value = matches[0].trim();
        return {
          type: 'phone',
          value,
          confidence: this.calculateConfidence(value),
        };
      }
    }

    return null;
  }

  private calculateConfidence(value: string): number {
    // Higher confidence for international format
    if (value.startsWith('+')) return 0.9;
    // Medium for standard US format
    if (/^\d{3}[-.\s]\d{3}[-.\s]\d{4}$/.test(value)) return 0.8;
    return 0.7;
  }
}
