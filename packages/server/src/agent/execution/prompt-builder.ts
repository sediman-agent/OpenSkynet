/**
 * Prompt Builder
 * Builds system prompts and state messages for the agent
 */

import type { CapturedState } from './state-capture';

/**
 * Prompt Builder options
 */
export interface PromptBuilderOptions {
  mode?: string;
  includeBrowserTools?: boolean;
}

/**
 * Prompt Builder
 * This is extracted from agent/execution/enhanced-loop.ts
 */
export class PromptBuilder {
  /**
   * Build system prompt for the agent
   */
  buildSystemPrompt(task: string, options: PromptBuilderOptions = {}): string {
    const { mode = 'standard', includeBrowserTools = true } = options;

    const basePrompt = this.buildBasePrompt();

    if (mode === 'browser' && includeBrowserTools) {
      return basePrompt + '\n\n' + this.buildBrowserToolsSection();
    }

    return basePrompt;
  }

  /**
   * Build base system prompt
   */
  private buildBasePrompt(): string {
    return `You are an AI agent that operates a web browser to accomplish tasks using structured output.

<output_format>
You MUST respond with a JSON object matching this schema:
{
  "thought": {
    "thinking": "Your reasoning about current state and actions",
    "evaluation": "success|failure|uncertain - evaluate previous action",
    "memory": "1-3 sentences tracking progress",
    "nextGoal": "One clear sentence for what to accomplish next"
  },
  "actions": [
    {
      "name": "tool_name",
      "arguments": { ... }
    }
  ],
  "done": false,
  "summary": "Final summary when done=true"
}
</output_format>

<workflow>
1. OBSERVE - Check the page state (URL + elements + screenshot if available)
2. THINK - Reason about what you see and what to do
3. ACT - Call appropriate tools (browser_navigate, browser_click, browser_type, etc.)
4. VERIFY - Check results and continue until task complete
</workflow>

<task_completion>
Set done=true when:
- Task is fully completed
- Impossible to continue
- Reached iteration limit

Set summary to all relevant findings when done=true.
</task_completion>`;
  }

  /**
   * Build browser tools section
   */
  private buildBrowserToolsSection(): string {
    return `<browser_tools>
Available tools:
- browser_navigate(url) - Go to URL
- browser_snapshot() - Get page elements
- browser_click(refId) - Click element by ID
- browser_type(refId, text) - Type into element
- browser_scroll(direction) - Scroll page
- browser_press_key(key) - Press keyboard key
- browser_end(summary) - Complete task
</browser_tools>`;
  }

  /**
   * Build state message for LLM
   */
  buildStateMessage(
    task: string,
    state: CapturedState,
    agentMemory: string,
    useVision: boolean
  ): { role: 'user'; content: string | Array<{ type: string; [key: string]: any }> } {
    const textContent = this.buildTextContent(task, state, agentMemory);

    if (useVision && state.screenshot && state.screenshot.length > 100) {
      return {
        role: 'user',
        content: [
          { type: 'text', text: textContent },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${state.screenshot}`,
              detail: 'auto'
            }
          }
        ]
      };
    }

    return { role: 'user', content: textContent };
  }

  /**
   * Build text content for state message
   */
  private buildTextContent(task: string, state: CapturedState, agentMemory: string): string {
    return `<user_request>
${task}
</user_request>

<agent_memory>
${agentMemory || '(no memory yet)'}
</agent_memory>

<browser_state>
Current URL: ${state.url}
${state.formatted}
</browser_state>`;
  }

  /**
   * Build action results message
   */
  buildActionResultsMessage(results: string, task: string): string {
    return `<action_results>
${results.trim()}
</action_results>

Continue working on: ${task}`;
  }

  /**
   * Build reflection prompt
   */
  buildReflectionPrompt(reason: string): string {
    return `<reflection>${reason}</reflection>`;
  }

  /**
   * Build budget warning prompt
   */
  buildBudgetWarning(current: number, max: number): string {
    return `<budget_warning>You have used ${current}/${max} steps. Focus on wrapping up.</budget_warning>`;
  }

  /**
   * Build continue prompt
   */
  buildContinuePrompt(): string {
    return 'Please continue. Take the next action to complete the task.';
  }

  /**
   * Build user request wrapper
   */
  wrapUserRequest(content: string): string {
    return `<user_request>\n${content}\n</user_request>`;
  }

  /**
   * Build agent memory wrapper
   */
  wrapAgentMemory(memory: string): string {
    return `<agent_memory>\n${memory}\n</agent_memory>`;
  }

  /**
   * Build browser state wrapper
   */
  wrapBrowserState(url: string, formatted: string): string {
    return `<browser_state>\nCurrent URL: ${url}\n${formatted}\n</browser_state>`;
  }
}
