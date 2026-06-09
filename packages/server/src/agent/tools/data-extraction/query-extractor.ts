/**
 * Query-Based Text Extractor
 * Extracts relevant text based on query context
 */

import type { DataExtractor, ExtractedData, ExtractorContext } from './types.js';

export class QueryExtractor implements DataExtractor {
  readonly name = 'text';

  extract(context: ExtractorContext): ExtractedData | null {
    const { pageText, query } = context;

    if (!query || query.length < 3) {
      // No meaningful query, return first meaningful sentence
      return this.extractFirstMeaningfulSentence(pageText);
    }

    // Extract query words (filter out short common words)
    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2 && !this.isStopWord(w));

    if (queryWords.length === 0) {
      return this.extractFirstMeaningfulSentence(pageText);
    }

    // Split into sentences and find most relevant
    const sentences = pageText.split(/[.!?]+/).filter(s => s.trim().length > 10);

    // Score each sentence based on query word matches
    const scoredSentences = sentences.map(sentence => {
      const lowerSentence = sentence.toLowerCase();
      const matchCount = queryWords.filter(w => lowerSentence.includes(w)).length;
      const hasMultipleMatches = matchCount >= Math.min(2, queryWords.length);

      return {
        sentence: sentence.trim(),
        score: matchCount + (hasMultipleMatches ? 2 : 0),
      };
    });

    // Sort by score and return best match
    scoredSentences.sort((a, b) => b.score - a.score);

    if (scoredSentences[0]?.score > 0) {
      return {
        type: 'text',
        value: scoredSentences[0].sentence,
        confidence: Math.min(scoredSentences[0].score / 3, 1),
      };
    }

    // No direct matches, try partial matches
    return this.extractPartialMatches(pageText, queryWords);
  }

  private extractFirstMeaningfulSentence(text: string): ExtractedData | null {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    if (sentences.length > 0) {
      return {
        type: 'text',
        value: sentences[0].trim(),
        confidence: 0.5,
      };
    }
    return null;
  }

  private extractPartialMatches(text: string, queryWords: string[]): ExtractedData | null {
    // Look for sentences containing at least one query word
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      if (queryWords.some(w => lowerSentence.includes(w))) {
        return {
          type: 'text',
          value: sentence.trim(),
          confidence: 0.6,
        };
      }
    }

    return null;
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
      'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'there', 'were',
      'this', 'that', 'with', 'they', 'from', 'what', 'which', 'their', 'said',
      'each', 'she', 'does', 'been', 'about', 'into', 'than', 'only', 'its', 'who'
    ]);
    return stopWords.has(word);
  }
}
