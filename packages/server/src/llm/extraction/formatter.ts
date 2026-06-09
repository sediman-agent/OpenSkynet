/**
 * Extraction Formatter
 * Formats extracted page data for LLM consumption and display
 */

import type { PageExtraction, PageElement } from './schemas.js';

/**
 * Formatter converts extraction to readable formats
 * This is extracted from llm/page-extraction-provider.ts
 */
export class ExtractionFormatter {
  /**
   * Format extracted page for LLM consumption
   * Converts the structured extraction to a readable format
   */
  formatForLLM(extraction: PageExtraction): string {
    const lines: string[] = [];

    lines.push(`URL: ${extraction.pageUrl}`);
    lines.push(`Title: ${extraction.pageTitle}`);
    lines.push('');
    lines.push(`Interactive Elements (${extraction.interactiveElements.length} total):`);

    for (const el of extraction.interactiveElements) {
      lines.push(this.formatElement(el));
    }

    if (extraction.summary) {
      lines.push('');
      lines.push(`Summary: ${extraction.summary}`);
    }

    return lines.join('\n');
  }

  /**
   * Format individual element
   */
  private formatElement(el: PageElement): string {
    const parts: string[] = [];
    parts.push(`[${el.refId}]`);
    parts.push(`<${el.tag}>`);

    if (el.text) {
      const truncatedText = el.text.length > 50
        ? `${el.text.slice(0, 50)}...`
        : el.text;
      parts.push(`"${truncatedText}"`);
    }
    if (el.placeholder) parts.push(`placeholder="${el.placeholder}"`);
    if (el.value) parts.push(`value="${el.value}"`);
    if (!el.isVisible) parts.push('(hidden)');
    if (!el.isInteractable) parts.push('(disabled)');

    return parts.join(' ');
  }

  /**
   * Format as markdown
   */
  formatAsMarkdown(extraction: PageExtraction): string {
    const lines: string[] = [];

    lines.push(`# ${extraction.pageTitle}`);
    lines.push('');
    lines.push(`**URL:** ${extraction.pageUrl}`);
    lines.push('');

    if (extraction.summary) {
      lines.push(`**Summary:** ${extraction.summary}`);
      lines.push('');
    }

    lines.push('## Interactive Elements');
    lines.push('');

    for (const el of extraction.interactiveElements) {
      lines.push(`### [${el.refId}] <${el.tag}>`);
      if (el.text) lines.push(`- **Text:** ${el.text}`);
      if (el.placeholder) lines.push(`- **Placeholder:** ${el.placeholder}`);
      if (el.value) lines.push(`- **Value:** ${el.value}`);
      if (el.role) lines.push(`- **Role:** ${el.role}`);
      if (el.ariaLabel) lines.push(`- **ARIA Label:** ${el.ariaLabel}`);
      lines.push(`- **Visible:** ${el.isVisible}`);
      lines.push(`- **Interactable:** ${el.isInteractable}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format as compact JSON
   */
  formatAsCompactJson(extraction: PageExtraction): string {
    const compact = {
      url: extraction.pageUrl,
      title: extraction.pageTitle,
      elementCount: extraction.interactiveElements.length,
      elements: extraction.interactiveElements.map(el => ({
        id: el.refId,
        tag: el.tag,
        text: el.text?.slice(0, 30),
      }))
    };
    return JSON.stringify(compact, null, 2);
  }

  /**
   * Get element by refId
   */
  getElementByRefId(extraction: PageExtraction, refId: number): PageElement | null {
    return extraction.interactiveElements.find(el => el.refId === refId) ?? null;
  }

  /**
   * Get elements by tag
   */
  getElementsByTag(extraction: PageExtraction, tag: string): PageElement[] {
    return extraction.interactiveElements.filter(el => el.tag === tag);
  }

  /**
   * Get visible elements
   */
  getVisibleElements(extraction: PageExtraction): PageElement[] {
    return extraction.interactiveElements.filter(el => el.isVisible);
  }

  /**
   * Get interactable elements
   */
  getInteractableElements(extraction: PageExtraction): PageElement[] {
    return extraction.interactiveElements.filter(el => el.isInteractable);
  }

  /**
   * Get form inputs (input, textarea, select)
   */
  getFormInputs(extraction: PageExtraction): PageElement[] {
    const formTags = ['input', 'textarea', 'select'];
    return extraction.interactiveElements.filter(el => formTags.includes(el.tag));
  }

  /**
   * Get clickable elements (button, a)
   */
  getClickableElements(extraction: PageExtraction): PageElement[] {
    const clickTags = ['button', 'a'];
    return extraction.interactiveElements.filter(el => clickTags.includes(el.tag));
  }

  /**
   * Get extraction statistics
   */
  getStatistics(extraction: PageExtraction): {
    total: number;
    visible: number;
    interactable: number;
    byTag: Record<string, number>;
  } {
    const byTag: Record<string, number> = {};

    for (const el of extraction.interactiveElements) {
      byTag[el.tag] = (byTag[el.tag] ?? 0) + 1;
    }

    return {
      total: extraction.interactiveElements.length,
      visible: this.getVisibleElements(extraction).length,
      interactable: this.getInteractableElements(extraction).length,
      byTag,
    };
  }
}
