/**
 * Element Resolution Types
 */

import type { Page, Locator } from "playwright";

export interface ElementResolutionStrategy {
  readonly name: string;
  resolve(page: Page, refId: number): Promise<Locator | null>;
}

export interface ElementCandidate {
  tag: string;
  text: string;
  role: string;
  placeholder: string;
  href: string;
  ariaLabel: string;
}
