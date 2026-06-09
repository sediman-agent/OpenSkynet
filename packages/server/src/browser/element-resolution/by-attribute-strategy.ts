/**
 * ByAttribute Element Resolution Strategy
 * Attempts to resolve elements by searching through page candidates
 */

import type { Page, Locator } from "playwright";
import type { ElementResolutionStrategy, ElementCandidate } from './types.js';
import { createLogger } from '../../core/logging.js';

const logger = createLogger('ByAttributeStrategy');

export class ByAttributeStrategy implements ElementResolutionStrategy {
  readonly name = 'by-attribute';

  async resolve(page: Page, refId: number): Promise<Locator | null> {
    try {
      // Get candidates from page
      const candidates = await this.getCandidates(page);

      if (refId < 0 || refId >= candidates.length) {
        logger.debug(`[ByAttributeStrategy] refId ${refId} out of range (${candidates.length} candidates)`);
        return null;
      }

      const info = candidates[refId];
      if (!info) {
        logger.debug(`[ByAttributeStrategy] No candidate found for refId ${refId}`);
        return null;
      }

      // Try multiple selector strategies in order of preference
      const strategies = [
        () => this.tryByAriaLabel(page, info),
        () => this.tryByHref(page, info),
        () => this.tryByText(page, info),
        () => this.tryByRole(page, info),
        () => this.tryByPlaceholder(page, info),
      ];

      for (const strategy of strategies) {
        const locator = await strategy();
        if (locator) {
          logger.debug(`[ByAttributeStrategy] Found element for refId ${refId} using attribute strategy`);
          return locator;
        }
      }

      logger.debug(`[ByAttributeStrategy] Could not resolve refId ${refId} with any attribute strategy`);
      return null;
    } catch (error) {
      logger.debug(`[ByAttributeStrategy] Error resolving refId ${refId}:`, error);
      return null;
    }
  }

  private async getCandidates(page: Page): Promise<ElementCandidate[]> {
    return page.evaluate(() => {
      const results: ElementCandidate[] = [];
      const interactive = ["a", "button", "input", "select", "textarea", "[role]", "[tabindex]"];

      for (const sel of interactive) {
        for (const el of Array.from(document.querySelectorAll(sel))) {
          results.push({
            tag: (el as HTMLElement).tagName.toLowerCase(),
            text: (el.textContent || "").slice(0, 100),
            role: el.getAttribute("role") || "",
            placeholder: (el as HTMLInputElement).placeholder || "",
            href: (el as HTMLAnchorElement).href || "",
            ariaLabel: el.getAttribute("aria-label") || "",
          });
        }
      }

      return results;
    });
  }

  private async tryByAriaLabel(page: Page, info: ElementCandidate): Promise<Locator | null> {
    if (!info.ariaLabel) return null;
    const locator = page.locator(`[aria-label="${info.ariaLabel}"]`).first();
    return (await locator.count()) > 0 ? locator : null;
  }

  private async tryByHref(page: Page, info: ElementCandidate): Promise<Locator | null> {
    if (!info.href) return null;
    const locator = page.locator(`a[href="${info.href}"]`).first();
    return (await locator.count()) > 0 ? locator : null;
  }

  private async tryByText(page: Page, info: ElementCandidate): Promise<Locator | null> {
    if (!info.text) return null;
    const locator = page.getByText(info.text.slice(0, 50), { exact: false }).first();
    return (await locator.count()) > 0 ? locator : null;
  }

  private async tryByRole(page: Page, info: ElementCandidate): Promise<Locator | null> {
    if (!info.role) return null;
    const locator = page.locator(`[role="${info.role}"]`).first();
    return (await locator.count()) > 0 ? locator : null;
  }

  private async tryByPlaceholder(page: Page, info: ElementCandidate): Promise<Locator | null> {
    if (!info.placeholder) return null;
    const locator = page.locator(`[placeholder="${info.placeholder}"]`).first();
    return (await locator.count()) > 0 ? locator : null;
  }
}
