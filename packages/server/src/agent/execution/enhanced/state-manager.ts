/**
 * Enhanced Loop State Manager
 * Handles state capture and management for enhanced agent loop
 */

import type { BrowserSession, PageState } from '../../../browser';
import { createLogger } from '../../../core/logging';

const logger = createLogger('enhanced-loop-state');

export interface LoopState {
  url: string;
  title: string;
  screenshot?: string;
  elements?: any[];
  timestamp: number;
}

export interface StateCaptureOptions {
  useVision?: boolean;
  useSmartPerception?: boolean;
  browserSession?: BrowserSession;
  visionFusion?: any;
}

/**
 * Capture current browser state
 */
export async function captureState(options: StateCaptureOptions = {}): Promise<LoopState> {
  const { useVision = false, browserSession, visionFusion } = options;

  const state: LoopState = {
    url: '',
    title: '',
    timestamp: Date.now()
  };

  try {
    if (browserSession) {
      const pages = browserSession.context?.pages();
      const page = pages && pages.length > 0 ? pages[0] : null;
      if (page) {
        state.url = await page.url();
        state.title = await page.title();

        // Capture screenshot if vision is enabled
        if (useVision) {
          try {
            const screenshot = await page.screenshot({ type: 'png' });
            state.screenshot = screenshot.toString('base64');
          } catch (error) {
            logger.warn(`[StateCapture] Failed to capture screenshot: ${String(error)}`);
          }
        }

        // Use smart perception if available
        if (visionFusion && options.useSmartPerception) {
          try {
            const fusionState = await visionFusion.getFusionState(page);
            state.elements = fusionState.elements;
          } catch (error) {
            logger.warn(`[StateCapture] Smart perception failed: ${String(error)}`);
          }
        }
      }
    }
  } catch (error) {
    logger.error(`[StateCapture] Failed to capture state: ${String(error)}`);
  }

  return state;
}

/**
 * Build state message for LLM
 */
export function buildStateMessage(task: string, state: LoopState, agentMemory: string): {
  role: 'user';
  content: string | Array<{ type: string; [key: string]: any }>;
} {
  const textContent = `<task>${task}</task>\n\n<agent_memory>${agentMemory || '(no memory yet)'}</agent_memory>\n\n<current_state>\nCurrent URL: ${state.url}\nTitle: ${state.title}\nTimestamp: ${state.timestamp}\n</current_state>`;

  if (state.screenshot && state.screenshot.length > 100) {
    return {
      role: 'user',
      content: [
        { type: 'text', text: textContent },
        {
          type: 'image_url',
          image_url: {
            url: state.screenshot,
            detail: 'auto'
          }
        }
      ]
    };
  }

  return {
    role: 'user',
    content: textContent
  };
}

/**
 * Extract thinking from agent response
 */
export function extractThinking(response: any): { thinking: string; visible: string } {
  if (response.thought) {
    const { thinking, evaluation, memory, nextGoal } = response.thought;
    const visible = [evaluation, memory, nextGoal].filter(Boolean).join('\n');
    return {
      thinking: thinking || '',
      visible: visible || response.output || ''
    };
  }

  // Fallback to parsing thinking tags
  const thinkingMatch = response.output?.match(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/i);
  if (thinkingMatch) {
    const thinking = thinkingMatch[1].trim();
    const visible = response.output?.replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, '').trim() || '';
    return { thinking, visible };
  }

  return {
    thinking: '',
    visible: response.output || ''
  };
}
