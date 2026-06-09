/**
 * Price Extractor Tests
 */

import { describe, it, expect } from 'bun:test';
import { PriceExtractor } from '../price-extractor.js';
import type { ExtractorContext } from '../types.js';

describe('PriceExtractor', () => {
  const extractor = new PriceExtractor();

  it('should extract USD prices', () => {
    const context: ExtractorContext = {
      pageText: 'The price is $123.45 for the item.',
      query: 'price',
      format: 'price'
    };

    const result = extractor.extract(context);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('price');
    expect(result?.value).toBe('$123.45');
    expect(result?.confidence).toBeGreaterThan(0.9);
  });

  it('should extract EUR prices', () => {
    const context: ExtractorContext = {
      pageText: 'Costs €1,234.56 for the product.',
      query: 'cost',
      format: 'price'
    };

    const result = extractor.extract(context);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('price');
    expect(result?.value).toBe('€1,234.56');
  });

  it('should extract GBP prices', () => {
    const context: ExtractorContext = {
      pageText: 'Price: £99.99 only!',
      query: 'price',
      format: 'price'
    };

    const result = extractor.extract(context);

    expect(result).not.toBeNull();
    expect(result?.value).toBe('£99.99');
  });

  it('should extract prices with currency codes', () => {
    const context: ExtractorContext = {
      pageText: 'Total cost: 123.45 USD',
      query: 'total',
      format: 'price'
    };

    const result = extractor.extract(context);

    expect(result).not.toBeNull();
    expect(result?.value).toMatch(/USD/);
  });

  it('should return null when no price found', () => {
    const context: ExtractorContext = {
      pageText: 'There is no price information here.',
      query: 'price',
      format: 'price'
    };

    const result = extractor.extract(context);

    expect(result).toBeNull();
  });

  it('should extract first price when multiple present', () => {
    const context: ExtractorContext = {
      pageText: 'Prices: $10.00, $20.00, $30.00',
      query: 'prices',
      format: 'price'
    };

    const result = extractor.extract(context);

    expect(result).not.toBeNull();
    expect(result?.value).toBe('$10.00');
  });
});
