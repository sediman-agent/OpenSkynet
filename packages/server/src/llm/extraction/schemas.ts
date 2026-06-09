/**
 * Page Extraction Schemas
 * Zod schemas for page element and extraction validation
 */

import { z } from 'zod';

/**
 * Schema for interactive elements extracted from a page
 */
export const PageElementSchema = z.object({
  refId: z.number().describe('Sequential reference ID starting from 0'),
  tag: z.string().describe('HTML tag name (button, input, a, select, textarea, etc.)'),
  text: z.string().optional().describe('Visible text content'),
  placeholder: z.string().optional().describe('Placeholder text if input'),
  value: z.string().optional().describe('Current value if input'),
  role: z.string().optional().describe('ARIA role if available'),
  ariaLabel: z.string().optional().describe('ARIA label if available'),
  isVisible: z.boolean().default(true).describe('Whether element is in viewport'),
  isInteractable: z.boolean().default(true).describe('Whether element is not disabled'),
});

export type PageElement = z.infer<typeof PageElementSchema>;

/**
 * Schema for complete page extraction result
 */
export const PageExtractionSchema = z.object({
  interactiveElements: z.array(PageElementSchema)
    .describe('List of all interactive elements on the page'),
  pageTitle: z.string().describe('Title of the page'),
  pageUrl: z.string().describe('Current URL of the page'),
  summary: z.string().optional().describe('Brief description of page purpose'),
});

export type PageExtraction = z.infer<typeof PageExtractionSchema>;

/**
 * Schema for extraction result with metadata
 */
export const ExtractionResultSchema = z.object({
  data: PageExtractionSchema,
  metadata: z.object({
    extractedAt: z.string(),
    provider: z.string().optional(),
    model: z.string().optional(),
    processingTimeMs: z.number().optional(),
  }).optional(),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/**
 * Default extraction options
 */
export const DEFAULT_EXTRACTION_OPTIONS = {
  maxElements: 100,
  includeHidden: false,
  includeValues: true,
} as const;

/**
 * Schema for extraction options
 */
export const ExtractionOptionsSchema = z.object({
  maxElements: z.number().optional().default(DEFAULT_EXTRACTION_OPTIONS.maxElements),
  includeHidden: z.boolean().optional().default(DEFAULT_EXTRACTION_OPTIONS.includeHidden),
  includeValues: z.boolean().optional().default(DEFAULT_EXTRACTION_OPTIONS.includeValues),
});

export type ExtractionOptions = z.infer<typeof ExtractionOptionsSchema>;
