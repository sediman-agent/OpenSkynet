/**
 * Tests for DocumentConverterTool
 *
 * Tests document conversion and text extraction operations:
 * - pdf_to_text: Extract text from PDF files
 * - docx_to_text: Extract text from Word documents
 * - image_ocr: Extract text from images using OCR
 * - convert: Convert documents to different formats
 */

import { test, describe, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync, mkdirSync } from "node:fs";
import { DocumentConverterTool as DocumentTool } from "../../../src/electron/tools/document-tool";

describe("DocumentTool", () => {
  let testDir: string;
  let tool: typeof DocumentTool;

  beforeEach(() => {
    // Create temporary test directory
    testDir = join(tmpdir(), `document-tool-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    tool = DocumentTool;
  });

  afterEach(() => {
    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("tool registration", () => {
    test("has correct name", () => {
      expect(tool.name).toBe("Document");
    });

    test("has description", () => {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(0);
    });

    test("has parameters schema", () => {
      expect(tool.parameters).toBeTruthy();
      expect(typeof tool.parameters).toBe("object");
    });
  });

  describe("pdf_to_text action", () => {
    test("returns error for non-existent file", async () => {
      const execution = await tool.resolveExecution({
        action: "pdf_to_text",
        source_path: join(testDir, "nonexistent.pdf"),
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(true);
    });

    test("returns error for invalid file extension", async () => {
      const testFile = join(testDir, "test.txt");
      await Bun.write(testFile, "not a pdf");

      const execution = await tool.resolveExecution({
        action: "pdf_to_text",
        source_path: testFile,
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(true);
      expect(result.output).toContain("PDF");
    });

    test("extracts text from PDF", async () => {
      // Create a dummy PDF file (just a text file with .pdf extension for testing)
      const testFile = join(testDir, "test.pdf");
      const pdfContent = Buffer.from("%PDF-1.4\nTest PDF content\n%%EOF");

      await Bun.write(testFile, pdfContent);

      const execution = await tool.resolveExecution({
        action: "pdf_to_text",
        source_path: testFile,
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      // The tool should process it (actual PDF extraction would need pdf-parse)
      expect(result.isError).toBe(false);
    });
  });

  describe("docx_to_text action", () => {
    test("returns error for non-existent file", async () => {
      const execution = await tool.resolveExecution({
        action: "docx_to_text",
        source_path: join(testDir, "nonexistent.docx"),
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(true);
    });

    test("returns error for invalid file extension", async () => {
      const testFile = join(testDir, "test.txt");
      await Bun.write(testFile, "not a docx");

      const execution = await tool.resolveExecution({
        action: "docx_to_text",
        source_path: testFile,
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(true);
      expect(result.output).toContain("Word document");
    });
  });

  describe("image_ocr action", () => {
    test("returns error for non-existent file", async () => {
      const execution = await tool.resolveExecution({
        action: "image_ocr",
        source_path: join(testDir, "nonexistent.png"),
        language: "eng",
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(true);
    });

    test("returns error for invalid image extension", async () => {
      const testFile = join(testDir, "test.txt");
      await Bun.write(testFile, "not an image");

      const execution = await tool.resolveExecution({
        action: "image_ocr",
        source_path: testFile,
        language: "eng",
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(true);
      expect(result.output).toContain("image");
    });

    test("accepts valid image extensions", async () => {
      const extensions = [".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp"];

      for (const ext of extensions) {
        const testFile = join(testDir, `test${ext}`);
        await Bun.write(testFile, Buffer.from([0x89, 0x50, 0x4E, 0x47])); // PNG signature

        const execution = await tool.resolveExecution({
          action: "image_ocr",
          source_path: testFile,
          language: "eng",
        });

        // Should not error on file extension check (may error on OCR implementation)
        const result = await execution.execute({
          turnId: "test-turn",
          toolCallId: "test-call",
          signal: new AbortController().signal,
        });

        // Either succeeds or fails with implementation error, not extension error
        if (result.isError) {
          expect(result.output).not.toContain("Source file must be an image");
        }
      }
    });
  });

  describe("convert action", () => {
    test("converts text file to markdown", async () => {
      const sourceFile = join(testDir, "source.txt");
      const outputFile = join(testDir, "output.md");
      await Bun.write(sourceFile, "# Hello\n\nWorld content\n");

      const execution = await tool.resolveExecution({
        action: "convert",
        source_path: sourceFile,
        output_path: outputFile,
        output_format: "md",
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);

      // Verify output file was created
      const outputExists = await Bun.file(outputFile).exists();
      expect(outputExists).toBe(true);
    });

    test("converts text file to html", async () => {
      const sourceFile = join(testDir, "source.txt");
      const outputFile = join(testDir, "output.html");
      await Bun.write(sourceFile, "Test content\n");

      const execution = await tool.resolveExecution({
        action: "convert",
        source_path: sourceFile,
        output_path: outputFile,
        output_format: "html",
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);

      // Verify output file contains HTML structure
      const outputContent = await Bun.file(outputFile).text();
      expect(outputContent).toContain("<!DOCTYPE html>");
    });

    test("creates output directory if needed", async () => {
      const sourceFile = join(testDir, "source.txt");
      const outputFile = join(testDir, "subdir", "nested", "output.txt");
      await Bun.write(sourceFile, "content\n");

      const execution = await tool.resolveExecution({
        action: "convert",
        source_path: sourceFile,
        output_path: outputFile,
        output_format: "txt",
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(false);
    });

    test("returns error for unsupported source format", async () => {
      const sourceFile = join(testDir, "source.xyz");
      const outputFile = join(testDir, "output.txt");
      await Bun.write(sourceFile, "content\n");

      const execution = await tool.resolveExecution({
        action: "convert",
        source_path: sourceFile,
        output_path: outputFile,
        output_format: "txt",
      });

      const result = await execution.execute({
        turnId: "test-turn",
        toolCallId: "test-call",
        signal: new AbortController().signal,
      });

      expect(result.isError).toBe(true);
      expect(result.output).toContain("Unsupported");
    });
  });
});
