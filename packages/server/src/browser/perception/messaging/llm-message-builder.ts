/**
 * LLM Message Builder
 * Builds LLM messages from fused vision-DOM state
 */

import type { FusionState } from '../fusion.js';
import { createLogger } from '../../core/logging.js';

const logger = createLogger('LLMMessageBuilder');

export interface MessageBuildContext {
  task: string;
  memory: string;
  fusedState: FusionState;
}

/**
 * LLM Message Builder constructs messages for LLM consumption
 * This is extracted from browser/perception/fusion.ts
 */
export class LLMMessageBuilder {
  /**
   * Build LLM message from fused state
   */
  buildMessage(context: MessageBuildContext): Array<{
    role: string;
    content: string | Array<{ type: string; [key: string]: any }>;
  }> {
    const { task, memory, fusedState } = context;

    const messageParts: Array<{
      type: string;
      text?: string;
      image_url?: { url: string; detail?: string };
    }> = [];

    // Build text content
    const textContent = this.buildTextContent(task, memory, fusedState);
    messageParts.push({ type: 'text', text: textContent });

    // Add screenshot if available
    if (this.hasValidScreenshot(fusedState)) {
      messageParts.push(this.buildImageContent(fusedState));
    }

    return [{
      role: 'user',
      content: messageParts.length === 1 ? messageParts[0].text! : messageParts
    }];
  }

  /**
   * Build text content from fused state
   */
  private buildTextContent(
    task: string,
    memory: string,
    fusedState: FusionState
  ): string {
    let text = '';

    // Task context
    text += `<user_request>\n${task}\n</user_request>\n\n`;

    // Agent memory
    text += `<agent_memory>\n${memory || '(no memory yet)'}\n</agent_memory>\n\n`;

    // Page state
    text += this.buildPageStateSection(fusedState);

    // Detected changes
    if (fusedState.fusion.detectedChanges.length > 0) {
      text += `\n<detected_changes>\n`;
      text += fusedState.fusion.detectedChanges.join('\n');
      text += `\n</detected_changes>\n`;
    }

    // Token info (for debugging)
    if (fusedState.fusion.tokenEstimate.total > 0) {
      text += `\n<!-- Estimated tokens: DOM=${fusedState.fusion.tokenEstimate.dom}, `;
      text += `Vision=${fusedState.fusion.tokenEstimate.vision}, `;
      text += `Total=${fusedState.fusion.tokenEstimate.total} -->\n`;
    }

    return text;
  }

  /**
   * Build page state section
   */
  private buildPageStateSection(fusedState: FusionState): string {
    let text = `<page_state>\n`;

    // Basic info
    text += `URL: ${fusedState.dom.state.url}\n`;
    text += `Title: ${fusedState.dom.state.title}\n`;
    text += `Elements: ${fusedState.dom.state.stats.interactiveElements} interactive`;

    if (fusedState.dom.state.stats.newElements > 0) {
      text += `, ${fusedState.dom.state.stats.newElements} new`;
    }
    text += `\n\n`;

    // Scroll position
    const si = fusedState.dom.state.stats.scrollInfo;
    if (!si.isAtBottom) {
      text += `Scroll: ${Math.round(si.scrollPercentage)}% of page - more content below\n\n`;
    }

    // DOM elements
    text += `<interactive_elements>\n${fusedState.dom.formatted}\n</interactive_elements>\n`;
    text += `</page_state>\n`;

    return text;
  }

  /**
   * Build image content from screenshot
   */
  private buildImageContent(fusedState: FusionState): {
    type: string;
    image_url: { url: string; detail?: string };
  } {
    const detail = fusedState.fusion.strategy === 'vision-primary' ? 'high' : 'auto';

    return {
      type: 'image_url',
      image_url: {
        url: `data:image/${fusedState.screenshot.format};base64,${fusedState.screenshot.data}`,
        detail
      }
    };
  }

  /**
   * Check if fused state has valid screenshot
   */
  private hasValidScreenshot(fusedState: FusionState): boolean {
    return fusedState.screenshot.data.length > 100;
  }

  /**
   * Build system message with context
   */
  buildSystemMessage(fusedState: FusionState): string {
    let text = 'You are a browser automation agent. ';

    text += `Current page: ${fusedState.dom.state.url}\n`;
    text += `Title: ${fusedState.dom.state.title}\n`;
    text += `Interactive elements: ${fusedState.dom.state.stats.interactiveElements}\n`;

    if (fusedState.fusion.detectedChanges.length > 0) {
      text += `\nRecent changes:\n`;
      text += fusedState.fusion.detectedChanges.join('\n');
    }

    return text;
  }

  /**
   * Estimate message token count
   */
  estimateTokenCount(fusedState: FusionState): number {
    return fusedState.fusion.tokenEstimate.total;
  }

  /**
   * Check if message will be too large
   */
  isMessageTooLarge(fusedState: FusionState, maxTokens: number = 100000): boolean {
    return this.estimateTokenCount(fusedState) > maxTokens;
  }

  /**
   * Truncate message to fit token budget
   */
  truncateToBudget(fusedState: FusionState, maxTokens: number): FusionState {
    const current = this.estimateTokenCount(fusedState);

    if (current <= maxTokens) return fusedState;

    // For now, just remove screenshot if present
    if (fusedState.screenshot.data.length > 0) {
      const visionTokens = fusedState.fusion.tokenEstimate.vision;
      if (current - visionTokens <= maxTokens) {
        return {
          ...fusedState,
          screenshot: {
            data: '',
            format: 'png',
            width: 0,
            height: 0,
            timestamp: Date.now()
          },
          fusion: {
            ...fusedState.fusion,
            tokenEstimate: {
              ...fusedState.fusion.tokenEstimate,
              vision: 0,
              total: fusedState.fusion.tokenEstimate.dom
            }
          }
        };
      }
    }

    // If still too large, would need to truncate DOM
    // This is a simplified approach
    logger.warn(`Message too large even after screenshot removal: ${current} tokens`);
    return fusedState;
  }
}
