/**
 * Date Extractor Tests
 */

import { describe, it, expect } from 'bun:test';
import { DateExtractor } from '../date-extractor.js';
import type { ExtractorContext } from '../types.js';

describe('DateExtractor', () => {
  const extractor = new DateExtractor();

  it('should extract ISO format dates', () => {
    const context: ExtractorContext = {
      pageText: 'The deadline is 2027-06-15.',
      query: 'deadline',
      format: 'date'
    };

    const result = extractor.extract(context);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('date');
    expect(result?.value).toBe('2027-06-15');
    expect(result?.confidence).toBeGreaterThan(0.9);
  });

  it('should extract month day year format', () => {
    const context: ExtractorContext = {
      pageText: 'Application due June 15, 2027.',
      query: 'application deadline',
      format: 'date'
    };

    const result = extractor.extract(context);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('date');
    expect(result?.value).toMatch(/June/);
  });

  it('should extract MM/DD/YYYY format', () => {
    const context: ExtractorContext = {
      pageText: 'Event scheduled for 12/25/2024.',
      query: 'event date',
      format: 'date'
    };

    const result = extractor.extract(context);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('date');
    expect(result?.value).toBe('12/25/2024');
  });

  it('should prioritize dates near query keywords', () => {
    const context: ExtractorContext = {
      pageText: 'Some text on 2024-01-01. The deadline is 2027-12-31 for applications.',
      query: 'application deadline',
      format: 'date'
    };

    const result = extractor.extract(context);

    expect(result).not.toBeNull();
    expect(result?.value).toBe('2027-12-31');
  });

  it('should return null when no date found', () => {
    const context: ExtractorContext = {
      pageText: 'There is no date information here.',
      query: 'when',
      format: 'date'
    };

    const result = extractor.extract(context);

    expect(result).toBeNull();
  });
});
