/**
 * Tool Execution Strategy Types
 */

export interface ToolExecutionResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface ToolExecutionArgs {
  [key: string]: any;
}

export interface ToolExecutionContext {
  controller?: any;
  screenshotStore?: (url?: string) => void;
  updateSnapshot?: () => Promise<void>;
}

export interface ToolExecutionStrategy {
  readonly name: string;
  isAvailable(): boolean;
  execute(
    toolName: string,
    args: ToolExecutionArgs,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult>;
}
