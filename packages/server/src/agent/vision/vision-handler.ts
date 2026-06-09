/**
 * Vision Handler Module
 * Handles screenshot capture and vision-enhanced message building
 */

import type { AgentMessage } from './types';
import { buildStateMessage } from '../execution/state-message-builder';
import { captureState } from '../execution/state-capture';

export interface VisionCaptureResult {
  output: string;
  screenshot: string | null;
  url: string;
  title: string;
}

export interface VisionHandlerOpts {
  useVision: boolean;
  agentMemory: string;
}

/**
 * Capture current browser state (snapshot + screenshot)
 */
export async function captureVisionState(
  browserController: any,
  useVision: boolean
): Promise<VisionCaptureResult> {
  if (!browserController) {
    return { output: '', screenshot: null, url: '', title: '' };
  }

  try {
    return await captureState(browserController, { useVision });
  } catch (e) {
    console.error('[VisionHandler] Failed to capture state:', e);
    return { output: '', screenshot: null, url: '', title: '' };
  }
}

/**
 * Build a vision message with screenshot + DOM text for the LLM
 */
export function buildVisionMessage(
  task: string,
  stateOutput: string,
  screenshotBase64: string | null,
  url: string,
  opts: VisionHandlerOpts
): AgentMessage {
  return buildStateMessage({
    task,
    agentMemory: opts.agentMemory,
    url,
    stateOutput,
    screenshotBase64,
    useVision: opts.useVision
  }) as AgentMessage;
}

/**
 * Extract tool calls from response (helper for backward compatibility)
 */
export function extractToolCalls(response: any): any[] {
  return response.tool_calls || [];
}

/**
 * Format action results for state message
 */
export function formatActionResults(combinedOutput: string): string {
  return `<action_results>\n${combinedOutput.trim()}\n</action_results>\n\n`;
}

/**
 * Inject action results into state message content
 */
export function injectActionResults(
  stateMsg: AgentMessage,
  combinedOutput: string
): AgentMessage {
  if (typeof stateMsg.content === 'string') {
    stateMsg.content = `${formatActionResults(combinedOutput)}${stateMsg.content}`;
  } else if (Array.isArray(stateMsg.content)) {
    const textPart = stateMsg.content.find(p => p.type === 'text');
    if (textPart && 'text' in textPart) {
      textPart.text = `${formatActionResults(combinedOutput)}${textPart.text}`;
    }
  }

  return stateMsg;
}
