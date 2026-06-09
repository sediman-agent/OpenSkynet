/**
 * Data Extraction Types
 */

export interface ExtractedData {
  type: string;
  value: string;
  confidence: number;
}

export interface ExtractorContext {
  pageText: string;
  query: string;
  format: string;
}

export interface DataExtractor {
  readonly name: string;
  extract(context: ExtractorContext): ExtractedData | null;
}
