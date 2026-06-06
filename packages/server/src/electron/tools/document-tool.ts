/**
 * DocumentConverterTool - Document conversion and text extraction
 *
 * Refactored to use ActionBasedTool pattern for:
 * - Flat action handlers (no nested switches)
 * - Type-safe action routing
 * - Single source of truth for schemas
 * - Easier maintenance
 */

import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { writeFile, mkdir } from 'node:fs/promises';
import { extname, dirname } from 'node:path';
import { ActionBasedTool, type ActionDef } from '../tooling/action-tool';
import { ToolAccesses } from '../tooling/tool-access';

// Action schemas
const DocumentPdfSchema = z.object({
  action: z.literal('pdf_to_text'),
  source_path: z.string().min(1, 'Source path cannot be empty'),
});

const DocumentDocxSchema = z.object({
  action: z.literal('docx_to_text'),
  source_path: z.string().min(1, 'Source path cannot be empty'),
});

const DocumentOcrSchema = z.object({
  action: z.literal('image_ocr'),
  source_path: z.string().min(1, 'Source path cannot be empty'),
  language: z.string().default('eng'),
});

const DocumentConvertSchema = z.object({
  action: z.literal('convert'),
  source_path: z.string().min(1, 'Source path cannot be empty'),
  output_path: z.string().min(1, 'Output path cannot be empty'),
  output_format: z.enum(['txt', 'md', 'html']).default('txt'),
});

// Helper functions
async function extractPdfText(buffer: Buffer): Promise<string> {
  // In a real implementation, use pdf-parse or pdfjs-dist
  return `[PDF text extraction would be implemented here]\nFile size: ${buffer.length} bytes`;
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  // In a real implementation, use mammoth or similar library
  return `[DOCX text extraction would be implemented here]\nFile size: ${buffer.length} bytes`;
}

async function performOcr(buffer: Buffer, language: string): Promise<string> {
  // In a real implementation, use tesseract.js
  return `[OCR text extraction would be implemented here]\nLanguage: ${language}\nImage size: ${buffer.length} bytes`;
}

function convertToMarkdown(text: string, sourcePath: string): string {
  const filename = sourcePath.split('/').pop() ?? 'document';
  const lines = text.split('\n');
  let output = `# ${filename}\n\n`;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      output += `${trimmed}\n\n`;
    }
  }

  return output;
}

function convertToHtml(text: string, sourcePath: string): string {
  const filename = sourcePath.split('/').pop() ?? 'document';
  const lines = text.split('\n');

  let output = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${filename}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    p { margin-bottom: 1em; }
  </style>
</head>
<body>
  <h1>${filename}</h1>
`;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      output += `  <p>${escapeHtml(trimmed)}</p>\n`;
    }
  }

  output += `</body>
</html>`;

  return output;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Action handlers
const handlePdfToText: ActionDef['execute'] = async (input, ctx, builder) => {
  const args = input as z.infer<typeof DocumentPdfSchema>;

  builder.write(`Extracting text from PDF: ${args.source_path}\n`);

  const buffer = await readFile(args.source_path);
  const ext = extname(args.source_path).toLowerCase();

  if (ext !== '.pdf') {
    return builder.error('Source file must be a PDF (.pdf)');
  }

  try {
    const text = await extractPdfText(buffer);
    builder.write('\n--- Extracted Text ---\n');
    builder.write(text);
    return builder.ok(`Extracted ${text.length} characters from PDF`);
  } catch (error) {
    return builder.error(`Failed to extract PDF text: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const handleDocxToText: ActionDef['execute'] = async (input, ctx, builder) => {
  const args = input as z.infer<typeof DocumentDocxSchema>;

  builder.write(`Extracting text from DOCX: ${args.source_path}\n`);

  const buffer = await readFile(args.source_path);
  const ext = extname(args.source_path).toLowerCase();

  if (ext !== '.docx') {
    return builder.error('Source file must be a Word document (.docx)');
  }

  try {
    const text = await extractDocxText(buffer);
    builder.write('\n--- Extracted Text ---\n');
    builder.write(text);
    return builder.ok(`Extracted ${text.length} characters from DOCX`);
  } catch (error) {
    return builder.error(`Failed to extract DOCX text: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const handleImageOcr: ActionDef['execute'] = async (input, ctx, builder) => {
  const args = input as z.infer<typeof DocumentOcrSchema>;

  builder.write(`Extracting text from image: ${args.source_path}\n`);
  builder.write(`Language: ${args.language}\n`);

  const buffer = await readFile(args.source_path);
  const ext = extname(args.source_path).toLowerCase();
  const validExts = ['.png', '.jpg', '.jpeg', '.tiff', '.tif', '.bmp', '.webp'];

  if (!validExts.includes(ext)) {
    return builder.error(`Source file must be an image (${validExts.join(', ')})`);
  }

  try {
    const text = await performOcr(buffer, args.language);
    builder.write('\n--- OCR Result ---\n');
    builder.write(text);
    return builder.ok(`Extracted ${text.length} characters via OCR`);
  } catch (error) {
    return builder.error(`Failed to perform OCR: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const handleConvert: ActionDef['execute'] = async (input, ctx, builder) => {
  const args = input as z.infer<typeof DocumentConvertSchema>;

  builder.write(`Converting document:\n`);
  builder.write(`  Source: ${args.source_path}\n`);
  builder.write(`  Output: ${args.output_path}\n`);
  builder.write(`  Format: ${args.output_format}\n`);

  const buffer = await readFile(args.source_path);
  const ext = extname(args.source_path).toLowerCase();
  let text = '';

  if (ext === '.pdf') {
    text = await extractPdfText(buffer);
  } else if (ext === '.docx') {
    text = await extractDocxText(buffer);
  } else if (ext === '.txt' || ext === '.md') {
    text = buffer.toString('utf-8');
  } else {
    return builder.error('Unsupported source file format');
  }

  await mkdir(dirname(args.output_path), { recursive: true });

  let output: string;
  switch (args.output_format) {
    case 'txt':
      output = text;
      break;
    case 'md':
      output = convertToMarkdown(text, args.source_path);
      break;
    case 'html':
      output = convertToHtml(text, args.source_path);
      break;
  }

  await writeFile(args.output_path, output, 'utf-8');

  builder.write(`\nConverted successfully\n`);
  builder.write(`Output size: ${output.length} bytes`);
  return builder.ok('Document converted successfully');
};

// Define all actions
const documentActions: readonly ActionDef[] = [
  {
    name: 'pdf_to_text',
    description: 'Extract text from PDF files',
    schema: DocumentPdfSchema,
    getAccesses: (input) => ToolAccesses.readFile((input as z.infer<typeof DocumentPdfSchema>).source_path),
    execute: handlePdfToText,
    toDisplay: (input) => ({
      kind: 'document',
      action: 'pdf_to_text',
      source_path: (input as z.infer<typeof DocumentPdfSchema>).source_path,
    }),
  },
  {
    name: 'docx_to_text',
    description: 'Extract text from Word documents (DOCX)',
    schema: DocumentDocxSchema,
    getAccesses: (input) => ToolAccesses.readFile((input as z.infer<typeof DocumentDocxSchema>).source_path),
    execute: handleDocxToText,
    toDisplay: (input) => ({
      kind: 'document',
      action: 'docx_to_text',
      source_path: (input as z.infer<typeof DocumentDocxSchema>).source_path,
    }),
  },
  {
    name: 'image_ocr',
    description: 'Extract text from images using OCR',
    schema: DocumentOcrSchema,
    getAccesses: (input) => ToolAccesses.readFile((input as z.infer<typeof DocumentOcrSchema>).source_path),
    execute: handleImageOcr,
    toDisplay: (input) => ({
      kind: 'document',
      action: 'image_ocr',
      source_path: (input as z.infer<typeof DocumentOcrSchema>).source_path,
      language: (input as z.infer<typeof DocumentOcrSchema>).language,
    }),
  },
  {
    name: 'convert',
    description: 'Convert documents to different formats (txt, md, html)',
    schema: DocumentConvertSchema,
    getAccesses: () => ToolAccesses.all(),
    execute: handleConvert,
    toDisplay: (input) => ({
      kind: 'document',
      action: 'convert',
      source_path: (input as z.infer<typeof DocumentConvertSchema>).source_path,
      output_path: (input as z.infer<typeof DocumentConvertSchema>).output_path,
      output_format: (input as z.infer<typeof DocumentConvertSchema>).output_format,
    }),
  },
];

// Create the tool
export const DocumentConverterTool = new ActionBasedTool(
  'Document',
  documentActions,
  {
    description: `Document conversion and text extraction operations.

This tool provides document processing capabilities:
- pdf_to_text: Extract text from PDF files
- docx_to_text: Extract text from Word documents (DOCX)
- image_ocr: Extract text from images using OCR
- convert: Convert documents to different formats (txt, md, html)

All document operations include proper error handling and format detection.

Supported input formats:
- PDF (.pdf)
- Word documents (.docx)
- Images for OCR (.png, .jpg, .jpeg, .tiff, .bmp)`,
  }
);

// Export for backward compatibility
export { DocumentConverterTool as default };
export { DocumentConverterTool as DocumentTool };
