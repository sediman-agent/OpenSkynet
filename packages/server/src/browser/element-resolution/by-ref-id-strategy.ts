/**
 * ByRefId Element Resolution Strategy
 * Attempts to resolve elements by their data-sediman-ref-id attribute
 */

import type { Page, Locator } from "playwright";
import type { ElementResolutionStrategy } from './types.js';
import { createLogger } from '../../core/logging.js';

const logger = createLogger('ByRefIdStrategy');

export class ByRefIdStrategy implements ElementResolutionStrategy {
  readonly name = 'by-ref-id';

  async resolve(page: Page, refId: number): Promise<Locator | null> {
    try {
      const locator = page.locator(`[data-sediman-ref-id="${refId}"]`).first();

      if ((await locator.count()) > 0) {
        logger.debug(`[ByRefIdStrategy] Found element with refId ${refId}`);
        return locator;
      }

      return null;
    } catch (error) {
      logger.debug(`[ByRefIdStrategy] Error resolving refId ${refId}:`, error);
      return null;
    }
  }
}
