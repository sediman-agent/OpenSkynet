/**
 * Extraction Prompt Builder
 * Builds prompts for LLM-based page extraction
 */

import type { ExtractionOptions } from './schemas.js';

/**
 * Prompt Builder constructs extraction prompts
 * This is extracted from llm/page-extraction-provider.ts
 */
export class ExtractionPromptBuilder {
  private baseInstructions = `You are a page structure extractor. Your task is to identify ALL interactive elements on the page.`;

  /**
   * Build complete extraction prompt
   */
  buildPrompt(options: {
    url?: string;
    text?: string;
    extractionOptions?: ExtractionOptions;
  }): string {
    const {
      url = '',
      text = '',
      extractionOptions = {}
    } = options;

    const {
      maxElements = 100,
      includeHidden = false,
      includeValues = true
    } = extractionOptions;

    const lines: string[] = [];

    // Base instructions
    lines.push(this.baseInstructions);
    lines.push('');
    lines.push(`Page URL: ${url || 'Unknown'}`);
    lines.push('');
    lines.push('Instructions:');

    // Core extraction rules
    lines.push('- Extract ONLY interactive elements (buttons, inputs, links, selects, textareas, etc.)');
    lines.push('- Assign sequential refIds starting from 0');
    lines.push('- Include actual visible text, not placeholder text (unless it\'s an input with no value)');
    lines.push('- Mark elements as isVisible if they\'re in the viewport');
    lines.push('- Mark elements as isInteractable if they\'re not disabled/readonly');

    // Conditional instructions
    if (includeValues) {
      lines.push('- Include current form values when present');
    } else {
      lines.push('- Do not include form values');
    }

    if (includeHidden) {
      lines.push('- Include hidden elements');
    } else {
      lines.push('- Skip hidden elements (display:none, type=hidden)');
    }

    lines.push('');
    lines.push(this.buildJsonStructureExample(url));
    lines.push('');
    lines.push(`Max elements to extract: ${maxElements}`);
    lines.push('');
    lines.push('Page content (text preview):');
    lines.push(this.formatPageContent(text));
    lines.push('');
    lines.push('IMPORTANT:');
    lines.push('- Return valid JSON only');
    lines.push('- No markdown formatting');
    lines.push('- No explanations outside the JSON');

    return lines.join('\n');
  }

  /**
   * Build JSON structure example for prompt
   */
  private buildJsonStructureExample(url: string): string {
    return `Return a JSON object with this exact structure:
{
  "interactiveElements": [
    {
      "refId": 0,
      "tag": "button",
      "text": "Click Me",
      "placeholder": null,
      "value": null,
      "role": null,
      "ariaLabel": null,
      "isVisible": true,
      "isInteractable": true
    }
  ],
  "pageTitle": "Page Title",
  "pageUrl": "${url}",
  "summary": "Brief description of what this page does"
}`;
  }

  /**
   * Format page content for prompt
   */
  private formatPageContent(text: string, maxPreview = 10000): string {
    const preview = text.slice(0, maxPreview);
    const truncated = text.length > maxPreview ? '\n... (truncated)' : '';
    return `${preview}${truncated}`;
  }

  /**
   * Build system prompt for structured extraction
   */
  buildSystemPrompt(): string {
    return `Extract page structure accurately. Focus on interactive elements like buttons, inputs, links, selects, and textareas. Assign sequential IDs and capture relevant attributes like text content, placeholder, values, and visibility status.`;
  }

  /**
   * Build validation instructions
   */
  buildValidationInstructions(): string {
    return `Validate that:
1. All refIds are sequential starting from 0
2. All required fields are present
3. Tag names are valid HTML element tags
4. Boolean fields are true or false
5. Arrays are properly formatted`;
  }

  /**
   * Build error recovery prompt
   */
  buildErrorRetryPrompt(lastError: string, originalPrompt: string): string {
    return `${originalPrompt}

IMPORTANT - Previous extraction failed with: "${lastError}"

Please ensure:
1. Valid JSON format only
2. No markdown code blocks
3. All fields match the schema exactly
4. No trailing commas
5. Proper escaping of quotes and special characters`;
  }

  /**
   * Build summary extraction prompt
   */
  buildSummaryPrompt(pageContent: string): string {
    return `Provide a brief summary (1-2 sentences) describing what this page does based on its content.

Page content:
${this.formatPageContent(pageContent, 5000)}

Summary:`;
  }
}
