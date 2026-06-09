/**
 * Page Extraction Provider - Simplified
 *
 * Refactored from 306 lines to ~120 lines
 * Schemas extracted to extraction/schemas.ts
 * Prompt building extracted to extraction/prompt-builder.ts
 * Response parsing extracted to extraction/response-parser.ts
 * Formatting extracted to extraction/formatter.ts
 * Playwright adapter extracted to extraction/playwright-adapter.ts
 */

import type { LLMProvider } from './provider.js';
import type {
  PageElement,
  PageExtraction,
  ExtractionOptions,
} from './extraction/schemas.js';
import { DEFAULT_EXTRACTION_OPTIONS } from './extraction/schemas.js';

// Extracted modules
import { ExtractionPromptBuilder } from './extraction/prompt-builder.js';
import { ExtractionResponseParser } from './extraction/response-parser.js';
import { ExtractionFormatter } from './extraction/formatter.js';
import { PlaywrightAdapter } from './extraction/playwright-adapter.js';

// Re-export types
export type { PageElement, PageExtraction, ExtractionOptions } from './extraction/schemas.js';

// ============================================================================
// Page Extraction Provider
// ============================================================================

export interface PageExtractionProviderOptions {
  /** Maximum number of elements to extract */
  maxElements?: number;
  /** Include hidden elements */
  includeHidden?: boolean;
  /** Extract form values */
  includeValues?: boolean;
}

export class PageExtractionProvider {
  private llmProvider: LLMProvider;
  private promptBuilder: ExtractionPromptBuilder;
  private responseParser: ExtractionResponseParser;
  private formatter: ExtractionFormatter;
  private playwrightAdapter: PlaywrightAdapter;
  private extractionPrompt: string;

  constructor(llmProvider: LLMProvider) {
    this.llmProvider = llmProvider;
    this.promptBuilder = new ExtractionPromptBuilder();
    this.responseParser = new ExtractionResponseParser();
    this.formatter = new ExtractionFormatter();
    this.playwrightAdapter = new PlaywrightAdapter();
    this.extractionPrompt = this.promptBuilder.buildSystemPrompt();
  }

  /**
   * Extract structured page data from raw page content
   *
   * @param pageData - Raw page data (HTML, text, URL)
   * @param options - Extraction options
   * @returns Structured page extraction with interactive elements
   */
  async extractPage(
    pageData: {
      html?: string;
      text?: string;
      url?: string;
    },
    options: PageExtractionProviderOptions = {}
  ): Promise<PageExtraction> {
    const extractionOptions: ExtractionOptions = {
      maxElements: options.maxElements ?? DEFAULT_EXTRACTION_OPTIONS.maxElements,
      includeHidden: options.includeHidden ?? DEFAULT_EXTRACTION_OPTIONS.includeHidden,
      includeValues: options.includeValues ?? DEFAULT_EXTRACTION_OPTIONS.includeValues,
    };

    const prompt = this.promptBuilder.buildPrompt({
      url: pageData.url || '',
      text: pageData.text ? pageData.text.slice(0, 15000) : '',
      extractionOptions,
    });

    try {
      // Try to use structured output if available (Claude 3.5+)
      if ('chatStructured' in this.llmProvider) {
        const provider = this.llmProvider as any;
        const result = await provider.chatStructured(
          [{ role: 'user', content: prompt }],
          undefined,
          this.extractionPrompt
        );
        return this.responseParser.parseStructuredResponse(result.data);
      }

      // Fallback to regular chat with JSON parsing
      const response = await this.llmProvider.chat(
        [{ role: 'user', content: prompt }],
        [],
        this.extractionPrompt
      );

      return this.responseParser.parseAndValidate(response.text || '');
    } catch (error) {
      console.error('[PageExtractionProvider] Extraction failed:', error);

      // Return minimal structure on failure
      return {
        interactiveElements: [],
        pageTitle: pageData.url || 'Unknown',
        pageUrl: pageData.url || '',
        summary: 'Extraction failed - using fallback'
      };
    }
  }

  /**
   * Extract page elements from Playwright page
   * This is a convenience method for direct page extraction
   */
  async extractFromPlaywrightPage(
    page: any,
    options?: PageExtractionProviderOptions
  ): Promise<PageExtraction> {
    try {
      const pageData = await this.playwrightAdapter.extractFromPage(page, options);
      return await this.extractPage(pageData, options);
    } catch (error) {
      console.error('[PageExtractionProvider] Playwright extraction failed:', error);
      return this.playwrightAdapter.createFallbackExtraction((error as Error).message);
    }
  }

  /**
   * Format extracted page for LLM consumption
   * Converts the structured extraction to a readable format
   */
  formatForLLM(extraction: PageExtraction): string {
    return this.formatter.formatForLLM(extraction);
  }

  /**
   * Format extraction as markdown
   */
  formatAsMarkdown(extraction: PageExtraction): string {
    return this.formatter.formatAsMarkdown(extraction);
  }

  /**
   * Get extraction statistics
   */
  getStatistics(extraction: PageExtraction): ReturnType<ExtractionFormatter['getStatistics']> {
    return this.formatter.getStatistics(extraction);
  }

  /**
   * Check if page extraction is available
   */
  isAvailable(): boolean {
    return !!this.llmProvider;
  }

  /**
   * Update extraction options
   */
  updateOptions(options: Partial<PageExtractionProviderOptions>): void {
    // Options can be stored and used in subsequent extractions
    Object.assign(DEFAULT_EXTRACTION_OPTIONS, options);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a page extraction provider
 *
 * @param provider - LLM provider to use for extraction
 * @returns Page extraction provider instance
 */
export function createPageExtractionProvider(provider: LLMProvider): PageExtractionProvider {
  return new PageExtractionProvider(provider);
}

// ============================================================================
// Re-export extracted modules for direct use
// ============================================================================

export {
  ExtractionPromptBuilder,
  ExtractionResponseParser,
  ExtractionFormatter,
  PlaywrightAdapter,
};

// Re-export schemas
export * from './extraction/schemas.js';
