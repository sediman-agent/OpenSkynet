/**
 * System Prompt Builder Module
 * Handles system prompt construction for different task categories
 */

import { BROWSER_SYSTEM_PROMPT } from "../prompts/browser-system.js";
import { loadSoul } from "../prompts/soul.js";
import type { TaskCategory, TaskPlan } from "./types.js";
import { getConfig } from "../../core/config.js";

export interface SystemPromptOptions {
  task: string;
  category: TaskCategory;
  plan: TaskPlan;
  iteration: number;
  soul?: string;
}

/**
 * Build system prompt based on task category and context
 */
export function buildSystemPrompt(opts: SystemPromptOptions): string {
  const { task, category, plan, iteration, soul } = opts;

  // Load soul if not provided
  const agentSoul = soul || loadSoul();

  // Build base prompt
  let prompt = '';

  // Add soul/personality
  if (agentSoul) {
    prompt += `<personality>\n${agentSoul}\n</personality>\n\n`;
  }

  // Add task context
  prompt += `<task_context>\n`;
  prompt += `Category: ${category}\n`;
  prompt += `Iteration: ${iteration}\n`;
  if (plan && plan.steps.length > 0) {
    prompt += `Planned Steps: ${plan.steps.length}\n`;
  }
  prompt += `</task_context>\n\n`;

  // Add system instructions based on category
  switch (category) {
    case 'browser':
      prompt += BROWSER_SYSTEM_PROMPT;
      break;

    case 'simple':
      prompt += getSimpleSystemPrompt();
      break;

    case 'complex':
      prompt += getComplexSystemPrompt();
      break;

    case 'research':
      prompt += getResearchSystemPrompt();
      break;

    case 'creative':
      prompt += getCreativeSystemPrompt();
      break;

    default:
      prompt += getDefaultSystemPrompt();
  }

  return prompt;
}

/**
 * Build flash mode browser prompt for fast execution
 */
export function buildFlashBrowserPrompt(): string {
  let prompt = 'You are an efficient browser automation agent.\n\n';
  prompt += '<flash_mode>\n';
  prompt += '- Execute actions quickly and directly\n';
  prompt += '- Skip verbose explanations\n';
  prompt += '- Focus on completing the task efficiently\n';
  prompt += '- Use browser_snapshot to find elements\n';
  prompt += '- Call browser_end when done\n';
  prompt += '</flash_mode>\n\n';

  prompt += BROWSER_SYSTEM_PROMPT;
  return prompt;
}

/**
 * Get system prompt for simple tasks
 */
function getSimpleSystemPrompt(): string {
  return `You are a helpful AI assistant. Respond directly and concisely to user requests.

<simple_mode>
- Provide direct answers without unnecessary elaboration
- Focus on the core question or task
- Use clear, concise language
- If you need to use tools, do so efficiently
</simple_mode>`;
}

/**
 * Get system prompt for complex tasks
 */
function getComplexSystemPrompt(): string {
  return `You are an advanced AI assistant capable of handling complex, multi-step tasks.

<complex_mode>
- Break down complex tasks into manageable steps
- Think through each step before executing
- Verify results before proceeding
- Handle errors and adjust approach as needed
- Provide clear progress updates
</complex_mode>

<thinking>
For complex tasks, use structured thinking:
1. Analyze the requirements
2. Plan your approach
3. Execute step by step
4. Verify and adjust
</thinking>`;
}

/**
 * Get system prompt for research tasks
 */
function getResearchSystemPrompt(): string {
  return `You are a research assistant specialized in gathering and analyzing information.

<research_mode>
- Find accurate, up-to-date information
- Verify sources and cross-reference data
- Present findings in a structured way
- Cite sources when available
- Distinguish between facts and opinions
</research_mode>

<thinking>
For research tasks:
1. Identify key information needed
2. Determine reliable sources
3. Extract and verify data
4. Synthesize findings
</thinking>`;
}

/**
 * Get system prompt for creative tasks
 */
function getCreativeSystemPrompt(): string {
  return `You are a creative assistant capable of generating original content.

<creative_mode>
- Think creatively and explore different angles
- Use vivid language and engaging expression
- Structure content for readability and impact
- Revise and refine your output
- Adapt tone and style to the context
</creative_mode>

<thinking>
For creative tasks:
1. Understand the creative brief
2. Brainstorm ideas and approaches
3. Develop and refine content
4. Polish the final output
</thinking>`;
}

/**
 * Get default system prompt
 */
function getDefaultSystemPrompt(): string {
  return `You are a helpful AI assistant. Provide clear, accurate, and thoughtful responses to user requests.

<default_mode>
- Understand the user's intent
- Provide helpful and relevant information
- Ask clarifying questions when needed
- Use available tools when appropriate
- Maintain a friendly and professional tone
</default_mode>`;
}
