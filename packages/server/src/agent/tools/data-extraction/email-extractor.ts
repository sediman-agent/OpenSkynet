/**
 * Email Data Extractor
 * Extracts email addresses from text
 */

import type { DataExtractor, ExtractedData, ExtractorContext } from './types.js';

export class EmailExtractor implements DataExtractor {
  readonly name = 'email';

  // RFC 5322 compliant email pattern (simplified)
  private pattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

  extract(context: ExtractorContext): ExtractedData | null {
    const { pageText } = context;

    const matches = pageText.match(this.pattern);
    if (matches && matches.length > 0) {
      const value = matches[0].trim();
      return {
        type: 'email',
        value,
        confidence: 0.95,
      };
    }

    return null;
  }
}
