/**
 * Extraction Response Parser
 * Parses and validates LLM responses for page extraction
 */

import type { PageExtraction } from './schemas.js';
import { PageExtractionSchema } from './schemas.js';

/**
 * Response Parser handles extraction response parsing
 * This is extracted from llm/page-extraction-provider.ts
 */
export class ExtractionResponseParser {
  /**
   * Parse and validate LLM response
   */
  parseAndValidate(text: string): PageExtraction {
    try {
      // Try to extract JSON from response
      const jsonString = this.extractJson(text);
      const parsed = JSON.parse(jsonString);
      const validated = PageExtractionSchema.parse(parsed);
      return validated;
    } catch (error) {
      console.warn('[ExtractionResponseParser] JSON parse/validation failed:', error);
      return this.getFallbackExtraction();
    }
  }

  /**
   * Extract JSON from response text
   */
  private extractJson(text: string): string {
    // Try to find JSON in markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      return jsonMatch[1];
    }

    // Try to find JSON object in text
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return objectMatch[0];
    }

    // Return trimmed text as last resort
    return text.trim();
  }

  /**
   * Get fallback extraction structure on parse failure
   */
  private getFallbackExtraction(): PageExtraction {
    return {
      interactiveElements: [],
      pageTitle: 'Parse Error',
      pageUrl: '',
      summary: 'Failed to parse extraction response'
    };
  }

  /**
   * Validate extraction result
   */
  validateExtraction(extraction: PageExtraction): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check URL
    if (!extraction.pageUrl) {
      errors.push('Missing pageUrl');
    }

    // Check title
    if (!extraction.pageTitle) {
      errors.push('Missing pageTitle');
    }

    // Check elements array
    if (!Array.isArray(extraction.interactiveElements)) {
      errors.push('interactiveElements must be an array');
    } else {
      // Validate sequential refIds
      for (let i = 0; i < extraction.interactiveElements.length; i++) {
        const el = extraction.interactiveElements[i];
        if (el.refId !== i) {
          errors.push(`Element at index ${i} has non-sequential refId: ${el.refId}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Sanitize extraction result
   */
  sanitizeExtraction(extraction: PageExtraction): PageExtraction {
    return {
      ...extraction,
      interactiveElements: extraction.interactiveElements
        .filter(el => el.tag && typeof el.refId === 'number')
        .map((el, idx) => ({
          ...el,
          refId: idx, // Ensure sequential IDs
        }))
    };
  }

  /**
   * Check if response contains valid JSON
   */
  hasValidJson(text: string): boolean {
    try {
      const jsonString = this.extractJson(text);
      JSON.parse(jsonString);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extract error message from failed response
   */
  extractError(text: string): string | null {
    const errorPatterns = [
      /error[:\s]*(.+)/i,
      /failed[:\s]*(.+)/i,
      /unable[:\s]*(.+)/i,
    ];

    for (const pattern of errorPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Parse structured response from provider with chatStructured
   */
  parseStructuredResponse(data: unknown): PageExtraction {
    try {
      return PageExtractionSchema.parse(data);
    } catch (error) {
      console.warn('[ExtractionResponseParser] Structured response validation failed:', error);
      return this.getFallbackExtraction();
    }
  }
}
