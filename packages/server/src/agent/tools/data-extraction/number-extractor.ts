/**
 * Number Data Extractor
 * Extracts numeric values from text
 */

import type { DataExtractor, ExtractedData, ExtractorContext } from './types.js';

export class NumberExtractor implements DataExtractor {
  readonly name = 'number';

  private pattern = /\b\d+(?:,\d{3})*(?:\.\d+)?\b/g;

  extract(context: ExtractorContext): ExtractedData | null {
    const { pageText, query } = context;

    // Look for number-related keywords in query
    const queryLower = query.toLowerCase();
    const numberKeywords = ['price', 'cost', 'amount', 'total', 'count', 'number', 'quantity', 'how many', 'how much'];

    // Try to find numbers near keywords first
    if (numberKeywords.some(k => queryLower.includes(k))) {
      const relevantText = this.extractRelevantSentences(pageText, numberKeywords);
      const matches = relevantText.match(this.pattern);

      if (matches && matches.length > 0) {
        // Prefer larger numbers (likely to be the answer)
        const value = matches.sort((a, b) => {
          const numA = parseFloat(a.replace(/,/g, ''));
          const numB = parseFloat(b.replace(/,/g, ''));
          return numB - numA; // Descending order
        })[0];

        return {
          type: 'number',
          value: value.replace(/,/g, ''),
          confidence: 0.85,
        };
      }
    }

    // Fallback to any number
    const matches = pageText.match(this.pattern);
    if (matches && matches.length > 0) {
      return {
        type: 'number',
        value: matches[0].replace(/,/g, ''),
        confidence: 0.6,
      };
    }

    return null;
  }

  private extractRelevantSentences(text: string, keywords: string[]): string {
    const sentences = text.split(/[.!?]+/);
    return sentences.filter(s =>
      keywords.some(k => s.toLowerCase().includes(k))
    ).join('. ');
  }
}
