/**
 * Playwright Tool Execution Strategy
 * Handles tool execution using Playwright browser automation
 */

import type {
  ToolExecutionStrategy,
  ToolExecutionArgs,
  ToolExecutionContext,
  ToolExecutionResult
} from './types.js';
import { ToolErrorFormatter } from '../../../core/utils/error-formatter.js';
import { createLogger } from '../../../core/logging.js';

const logger = createLogger('PlaywrightExecutionStrategy');

export class PlaywrightExecutionStrategy implements ToolExecutionStrategy {
  readonly name = 'playwright';

  constructor(private controller: any) {}

  isAvailable(): boolean {
    // Available when not in Electron mode
    return process.env.SEDIMAN_MODE !== 'electron';
  }

  async execute(
    toolName: string,
    args: ToolExecutionArgs,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const ctrl = this.controller || context.controller;

    if (!ctrl) {
      return {
        success: false,
        output: '',
        error: 'Browser controller not available'
      };
    }

    try {
      const result = await this.executeTool(toolName, args, ctrl, context);
      return {
        success: true,
        output: result
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[${this.name}] Tool execution error: ${message}`);
      return {
        success: false,
        output: '',
        error: ToolErrorFormatter.format(toolName, error)
      };
    }
  }

  private async executeTool(
    toolName: string,
    args: ToolExecutionArgs,
    ctrl: any,
    context: ToolExecutionContext
  ): Promise<string> {
    // Navigation and basic actions
    switch (toolName) {
      case 'browser_navigate':
        return await this.executeNavigate(ctrl, args, context);

      case 'browser_click':
        return await this.executeClick(ctrl, args, context);

      case 'browser_type':
        return await this.executeType(ctrl, args, context);

      case 'browser_snapshot':
        return await this.executeSnapshot(ctrl, args, context);

      case 'browser_scroll':
        return await ctrl.scroll(args.direction as string, args.amount as number);

      case 'browser_press_key':
        return await ctrl.pressKey(args.key as string);

      case 'browser_hover':
        return await ctrl.hover(args.refId as number);

      case 'browser_select_option':
        return await ctrl.selectOption(args.refId as number, args.value as string);

      case 'browser_go_back':
        return await ctrl.goBack();

      case 'browser_go_forward':
        return await ctrl.goForward();

      case 'browser_refresh':
        return await ctrl.refresh();

      case 'browser_switch_tab':
        return await ctrl.switchTab(args.index as number);

      case 'browser_list_tabs':
        return await ctrl.listTabs();

      case 'browser_wait':
        return await ctrl.waitForSelector(args.selector as string, args.timeout as number);

      case 'browser_extract_text':
        return await ctrl.extractText();

      case 'browser_screenshot':
        return await this.executeScreenshot(ctrl, context);

      case 'browser_drag_and_drop':
        context.screenshotStore?.();
        return await ctrl.dragAndDrop(args.sourceRefId as number, args.targetRefId as number);

      case 'browser_upload_file':
        context.screenshotStore?.();
        return await ctrl.uploadFile(args.refId as number, args.filePath as string);

      case 'browser_execute_script': {
        const scriptResult = await ctrl.evaluate(args.script as string);
        return typeof scriptResult === 'object' ? JSON.stringify(scriptResult) : String(scriptResult);
      }

      case 'browser_close_tab':
        return await ctrl.closeTab(args.index as number);

      case 'browser_end':
        return `Task completed: ${(args.summary as string) || 'Done'}`;

      case 'request_human_help':
        return 'Human intervention requested';

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private async executeNavigate(ctrl: any, args: any, context: ToolExecutionContext): Promise<string> {
    const result = await ctrl.navigate(args.url as string);
    context.screenshotStore?.(args.url as string);
    // Wait for page to settle
    await new Promise(r => setTimeout(r, 1000));
    await context.updateSnapshot?.();
    return result;
  }

  private async executeClick(ctrl: any, args: any, context: ToolExecutionContext): Promise<string> {
    const result = await ctrl.click(args.refId as number);
    context.screenshotStore?.();
    await context.updateSnapshot?.();
    return result;
  }

  private async executeType(ctrl: any, args: any, context: ToolExecutionContext): Promise<string> {
    const result = await ctrl.typeText(args.refId as number, args.text as string, args.submit as boolean);
    context.screenshotStore?.();
    return result;
  }

  private async executeSnapshot(ctrl: any, args: any, context: ToolExecutionContext): Promise<string> {
    const snap = await ctrl.snapshot();
    const out = snap.output || snap.elements.map(
      (el: any) => `[${el.refId}]<${el.tag}>${el.text ? ' ' + JSON.stringify(el.text.slice(0, 100)) : ''}`
    ).join('\n');

    context.screenshotStore?.(snap.url);

    // Import dynamically to avoid circular dependency
    const { setLatestScreenshot } = await import('../../../api/routes/browser.js');
    setLatestScreenshot({ elements: snap.elements }, snap.url);

    return `Current URL: ${snap.url}\nTitle: ${snap.title}\n\n${out}\n\n${snap.elements.length} interactive elements total.`;
  }

  private async executeScreenshot(ctrl: any, context: ToolExecutionContext): Promise<string> {
    const shot = await ctrl.screenshot();
    if (shot && shot.length > 100) {
      const url = ctrl.getSession()?.context?.pages()[0]?.url() || '';
      const { setLatestScreenshot } = await import('../../../api/routes/browser.js');
      setLatestScreenshot(shot, url);
      return `Screenshot captured (${shot.length} bytes)`;
    }
    return 'Screenshot failed';
  }
}
