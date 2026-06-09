/**
 * Message Manager
 * Manages chat messages in the TUI
 */

import type { ChatMessage } from './types.js';

/**
 * Message Manager
 * Handles chat message operations
 * This is extracted from tui/app.ts
 */
export class MessageManager {
  private messages: ChatMessage[] = [];

  /**
   * Get all messages
   */
  getMessages(): ChatMessage[] {
    return this.messages;
  }

  /**
   * Set messages
   */
  setMessages(messages: ChatMessage[]): void {
    this.messages = messages;
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.messages = [];
  }

  /**
   * Add system message
   */
  addSystemMessage(text: string): void {
    this.messages.push({ type: 'system', text });
  }

  /**
   * Add user message
   */
  addUserMessage(text: string, taskNum: number): void {
    this.messages.push({ type: 'user', text, taskNum });
  }

  /**
   * Add error message
   */
  addErrorMessage(text: string): void {
    this.messages.push({ type: 'error', text });
  }

  /**
   * Start agent message
   */
  startAgentMessage(task: string): void {
    // Collapse existing agent messages
    for (const msg of this.messages) {
      if (msg.type === 'agent') msg.tabExpanded = false;
    }

    this.messages.push({
      type: 'agent',
      state: 'streaming',
      task,
      steps: [],
      thinkingText: '',
      success: false,
      selectedTab: 'steps',
      tabExpanded: false,
    });
  }

  /**
   * Append step to current agent message
   */
  appendStep(action: string): void {
    const last = this.messages[this.messages.length - 1];
    if (last?.type === 'agent') {
      if (!last.steps) last.steps = [];
      const isFirst = last.steps.length === 0;
      last.steps.push(action);

      // Limit steps to 500
      if (last.steps.length > 500) {
        last.steps.splice(0, last.steps.length - 500);
      }

      // Auto-expand to steps tab on first action
      if (isFirst && last.state === 'streaming') {
        last.selectedTab = 'steps';
        last.tabExpanded = true;
      }
    }
  }

  /**
   * Append streaming token
   */
  appendStreamingToken(token: string, phase: string): void {
    const isThinking = phase.toLowerCase().includes('think') || phase.toLowerCase().includes('plan');
    const cleaned = this.stripThinkTags(token);

    const last = this.messages[this.messages.length - 1];
    if (last?.type === 'agent') {
      if (isThinking) {
        last.thinkingText = (last.thinkingText ?? '') + cleaned;
      } else {
        last.result = (last.result ?? '') + cleaned;

        // Limit result length
        if (last.result.length > 100000) {
          const keep = Math.max(0, 100000 - cleaned.length);
          last.result = last.result.slice(last.result.length - keep);
        }
      }
    }
  }

  /**
   * Complete agent message
   */
  completeAgent(success: boolean, resultText: string, elapsedSecs: number, extras?: {
    skillCreated?: string;
    scheduledJob?: string;
  }): void {
    const last = this.messages[this.messages.length - 1];
    if (last?.type === 'agent') {
      last.state = 'completed';
      last.success = success;
      last.result = resultText;
      last.elapsedSecs = elapsedSecs;
      last.skillCreated = extras?.skillCreated;
      last.scheduledJob = extras?.scheduledJob;
      last.selectedTab = 'response';
      last.tabExpanded = true;
    }
  }

  /**
   * Switch tab on current agent message
   */
  switchTab(direction: 1 | -1): void {
    const tabs: Array<'thinking' | 'steps' | 'response'> = ['thinking', 'steps', 'response'];

    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].type === 'agent') {
        const msg = this.messages[i];
        const cur = tabs.indexOf(msg.selectedTab ?? 'response');
        msg.selectedTab = tabs[(cur + direction + 3) % 3];
        return;
      }
    }
  }

  /**
   * Toggle tab expansion on current agent message
   */
  toggleTabExpansion(): void {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].type === 'agent') {
        this.messages[i].tabExpanded = !this.messages[i].tabExpanded;
        return;
      }
    }
  }

  /**
   * Strip think tags from text
   */
  private stripThinkTags(text: string): string {
    return text.includes('<')
      ? text.replace(/<think[^>]*>/gi, '').replace(/<\/think>?/gi, '').replace(/<think/gi, '')
      : text;
  }

  /**
   * Get message count
   */
  getMessageCount(): number {
    return this.messages.length;
  }

  /**
   * Get last message
   */
  getLastMessage(): ChatMessage | undefined {
    return this.messages[this.messages.length - 1];
  }
}
