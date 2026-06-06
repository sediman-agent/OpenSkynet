/**
 * Electron Server Module
 *
 * Browser-focused agent for Electron app, based on kimi-code architecture.
 *
 * Key features:
 * - Browser automation via Browser tool
 * - Shell command integration
 * - Tool-based execution system
 * - Proper tool lifecycle management
 *
 * Architecture inspired by kimi-code:
 * - BuiltinTool classes with resolveExecution
 * - ToolResultBuilder for output formatting
 * - ToolAccesses for resource tracking
 * - Display metadata for UI
 */

export { ElectronAgent } from "./agent/ElectronAgent";
export type { ElectronAgentOpts } from "./agent/ElectronAgent";

export { T800Agent } from "./agent/T800Agent";
export type { T800AgentOpts } from "./agent/T800Agent";

export { TerminatorAgent } from "./agent/TerminatorAgent";

export * from "./tools";
export type { BuiltinTool, ToolExecution, ExecutableToolResult, ToolAccesses } from "./tooling/types";

import { ElectronAgent } from "./agent/ElectronAgent";
import { ToolBus } from "../agent/tools/bus";

/**
 * Create a configured ElectronAgent with proper tool initialization
 */
export interface CreateElectronAgentConfig {
  llmProvider: import("../llm/provider").LLMProvider;
  memory?: import("../memory/strategy").BaseMemoryStrategy;
  skillEngine?: import("../skills/engine").SkillEngine;
  toolBus?: ToolBus;
  workingDirectory?: string;
  enableShellTools?: boolean;
  enableBrowserTools?: boolean;
  headless?: boolean;
}

export function createElectronAgent(config: CreateElectronAgentConfig): ElectronAgent {
  return new ElectronAgent({
    llmProvider: config.llmProvider,
    memory: config.memory,
    skillEngine: config.skillEngine,
    toolBus: config.toolBus,
    workingDirectory: config.workingDirectory,
    enableShellTools: config.enableShellTools ?? true,
    enableBrowserTools: config.enableBrowserTools ?? true,
    headless: config.headless,
  });
}

/**
 * Convenience function to run a task with the Electron agent
 */
export async function runElectronTask(
  task: string,
  config: CreateElectronAgentConfig
): Promise<import("../core/types").AgentResult> {
  const agent = createElectronAgent(config);
  return agent.run(task);
}
