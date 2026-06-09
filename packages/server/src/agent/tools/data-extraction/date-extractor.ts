/**
 * Date Data Extractor
 * Extracts date values from text in various formats
 */

import type { DataExtractor, ExtractedData, ExtractorContext } from './types.js';

export class DateExtractor implements DataExtractor {
  readonly name = 'date';

  private patterns = [
    // Month DD, YYYY or DD Month YYYY
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi,
    /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/gi,
    // MM/DD/YYYY or DD/MM/YYYY
    /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,
    // YYYY-MM-DD
    /\b\d{4}-\d{2}-\d{2}\b/g,
    // ISO dates with time
    /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g,
  ];

  extract(context: ExtractorContext): ExtractedData | null {
    const { pageText, query } = context;

    // First, try to find dates near query keywords for better context
    const queryLower = query.toLowerCase();
    const dateKeywords = ['deadline', 'due', 'date', 'until', 'expires', 'ends', 'available', 'opens', 'closes'];

    if (dateKeywords.some(k => queryLower.includes(k))) {
      // Search in sentences containing date-related keywords
      const relevantText = this.extractRelevantSentences(pageText, dateKeywords);
      for (const pattern of this.patterns) {
        pattern.lastIndex = 0;
        const matches = relevantText.match(pattern);
        if (matches?.[0]) {
          return { type: 'date', value: matches[0].trim(), confidence: 0.9 };
        }
      }
    }

    // Fallback to any date in the text
    for (const pattern of this.patterns) {
      pattern.lastIndex = 0;
      const matches = pageText.match(pattern);
      if (matches && matches.length > 0) {
        // Prefer ISO format or full dates
        const value = matches[0].trim();
        return {
          type: 'date',
          value,
          confidence: this.calculateConfidence(value),
        };
      }
    }

    return null;
  }

  private extractRelevantSentences(text: string, keywords: string[]): string {
    const sentences = text.split(/[.!?]+/);
    return sentences.filter(s =>
      keywords.some(k => s.toLowerCase().includes(k))
    ).join('. ');
  }

  private calculateConfidence(value: string): number {
    // Highest confidence for ISO format
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 0.95;
    // High confidence for standard dates with month names
    if (/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(value)) return 0.85;
    // Medium for MM/DD/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) return 0.7;
    return 0.6;
  }
}
