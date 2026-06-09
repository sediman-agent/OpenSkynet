/**
 * Browser Tool Router
 * Routes browser tool calls to appropriate handler methods
 */

import type { BrowserController } from '../../../browser/controller.js';
import { createLogger } from '../../../core/logging.js';
import {
  storeScreenshot,
  updateLatestSnapshot
} from '../screenshot-handler.js';

const logger = createLogger('BrowserToolRouter');

export interface ToolExecutionContext {
  controller: BrowserController;
  screenshotHandler?: (url?: string) => void;
}

export interface ToolExecutionResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Browser Tool Router handles routing of tool calls to appropriate handlers
 * This is extracted from browser-tools.ts
 */
export class BrowserToolRouter {
  private context: ToolExecutionContext;

  constructor(context: ToolExecutionContext) {
    this.context = context;
  }

  /**
   * Route tool call to appropriate handler
   */
  async route(toolName: string, args: Record<string, any>): Promise<ToolExecutionResult> {
    try {
      const result = await this.executeTool(toolName, args);
      return {
        success: true,
        output: result
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Execute a specific tool
   */
  private async executeTool(toolName: string, args: Record<string, any>): Promise<string> {
    switch (toolName) {
      case 'browser_navigate':
        return await this.handleNavigate(args);

      case 'browser_click':
        return await this.handleClick(args);

      case 'browser_type':
        return await this.handleType(args);

      case 'browser_snapshot':
        return await this.handleSnapshot(args);

      case 'browser_scroll':
        return await this.handleScroll(args);

      case 'browser_press_key':
        return await this.handlePressKey(args);

      case 'browser_hover':
        return await this.handleHover(args);

      case 'browser_select_option':
        return await this.handleSelectOption(args);

      case 'browser_go_back':
        return await this.handleGoBack(args);

      case 'browser_go_forward':
        return await this.handleGoForward(args);

      case 'browser_refresh':
        return await this.handleRefresh(args);

      case 'browser_switch_tab':
        return await this.handleSwitchTab(args);

      case 'browser_list_tabs':
        return await this.handleListTabs(args);

      case 'browser_wait':
        return await this.handleWait(args);

      case 'browser_extract_text':
        return await this.handleExtractText(args);

      case 'browser_screenshot':
        return await this.handleScreenshot(args);

      case 'browser_drag_and_drop':
        return await this.handleDragAndDrop(args);

      case 'browser_upload_file':
        return await this.handleUploadFile(args);

      case 'browser_execute_script':
        return await this.handleExecuteScript(args);

      case 'browser_close_tab':
        return await this.handleCloseTab(args);

      case 'browser_extract_data':
        return await this.handleExtractData(args);

      case 'browser_end':
        return this.handleEnd(args);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  // ====================
  // Tool Handlers
  // ====================

  private async handleNavigate(args: Record<string, any>): Promise<string> {
    const url = args.url as string;
    const result = await this.context.controller.navigate(url);
    storeScreenshot(url);

    // Wait for page to settle and update snapshot
    await new Promise(r => setTimeout(r, 1000));
    await updateLatestSnapshot();

    return result;
  }

  private async handleClick(args: Record<string, any>): Promise<string> {
    const result = await this.context.controller.click(args.refId as number);
    storeScreenshot();
    await updateLatestSnapshot();
    return result;
  }

  private async handleType(args: Record<string, any>): Promise<string> {
    const result = await this.context.controller.typeText(
      args.refId as number,
      args.text as string,
      args.submit as boolean
    );
    storeScreenshot();
    return result;
  }

  private async handleSnapshot(args: Record<string, any>): Promise<string> {
    const snap = await this.context.controller.snapshot();
    const out = snap.output || snap.elements.map(
      (el) => `[${el.refId}]<${el.tag}>${el.text ? ' ' + JSON.stringify(el.text.slice(0, 100)) : ''}`
    ).join('\n');

    storeScreenshot(snap.url);

    // Update global latestSnapshot for refId resolution
    const { setLatestScreenshot } = await import('../../../api/routes/browser.js');
    setLatestScreenshot({ elements: snap.elements }, snap.url);

    return `Current URL: ${snap.url}\nTitle: ${snap.title}\n\n${out}\n\n${snap.elements.length} interactive elements total.`;
  }

  private async handleScroll(args: Record<string, any>): Promise<string> {
    const result = await this.context.controller.scroll(
      args.direction as string,
      args.amount as number | undefined
    );
    storeScreenshot();
    return result;
  }

  private async handlePressKey(args: Record<string, any>): Promise<string> {
    const result = await this.context.controller.pressKey(args.key as string);
    storeScreenshot();
    return result;
  }

  private async handleHover(args: Record<string, any>): Promise<string> {
    const result = await this.context.controller.hover(args.refId as number);
    storeScreenshot();
    return result;
  }

  private async handleSelectOption(args: Record<string, any>): Promise<string> {
    const result = await this.context.controller.selectOption(
      args.refId as number,
      args.value as string
    );
    storeScreenshot();
    return result;
  }

  private async handleGoBack(args: Record<string, any>): Promise<string> {
    const result = await this.context.controller.goBack();
    storeScreenshot();
    return result;
  }

  private async handleGoForward(args: Record<string, any>): Promise<string> {
    const result = await this.context.controller.goForward();
    storeScreenshot();
    return result;
  }

  private async handleRefresh(args: Record<string, any>): Promise<string> {
    const result = await this.context.controller.refresh();
    storeScreenshot();
    return result;
  }

  private async handleSwitchTab(args: Record<string, any>): Promise<string> {
    const result = await this.context.controller.switchTab(args.index as number);
    storeScreenshot();
    return result;
  }

  private async handleListTabs(args: Record<string, any>): Promise<string> {
    return await this.context.controller.listTabs();
  }

  private async handleWait(args: Record<string, any>): Promise<string> {
    return await this.context.controller.waitForSelector(
      args.selector as string,
      args.timeout as number | undefined
    );
  }

  private async handleExtractText(args: Record<string, any>): Promise<string> {
    return await this.context.controller.extractText();
  }

  private async handleScreenshot(args: Record<string, any>): Promise<string> {
    const shot = await this.context.controller.screenshot();
    if (shot && shot.length > 100) {
      const url = this.context.controller.getSession()?.context?.pages()[0]?.url() || '';
      const { setLatestScreenshot } = await import('../../../api/routes/browser.js');
      setLatestScreenshot(shot, url);
    }
    return shot ? `Screenshot captured (${shot.length} bytes)` : 'Screenshot failed';
  }

  private async handleDragAndDrop(args: Record<string, any>): Promise<string> {
    const result = await this.context.controller.dragAndDrop(
      args.sourceRefId as number,
      args.targetRefId as number
    );
    storeScreenshot();
    return result;
  }

  private async handleUploadFile(args: Record<string, any>): Promise<string> {
    const result = await this.context.controller.uploadFile(
      args.refId as number,
      args.filePath as string
    );
    storeScreenshot();
    return result;
  }

  private async handleExecuteScript(args: Record<string, any>): Promise<string> {
    const scriptResult = await this.context.controller.evaluate(args.script as string);
    return typeof scriptResult === 'object'
      ? JSON.stringify(scriptResult)
      : String(scriptResult);
  }

  private async handleCloseTab(args: Record<string, any>): Promise<string> {
    return await this.context.controller.closeTab(args.index as number | undefined);
  }

  private async handleExtractData(args: Record<string, any>): Promise<string> {
    const query = (args.query as string) || '';
    const format = (args.format as string) || 'text';

    logger.info(`[browser_extract_data] Extracting data for query: "${query}", format: "${format}"`);

    try {
      const pageText = await this.context.controller.extractText();

      const { dataExtractionService } = await import('../data-extraction/index.js');
      const extractionResult = dataExtractionService.extract(pageText, format, query);

      if (extractionResult.success && extractionResult.data) {
        return `Extracted: ${extractionResult.data}`;
      } else {
        return extractionResult.error || `Could not extract data for: ${query}`;
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[browser_extract_data] Error: ${errMsg}`);
      return `Error extracting data: ${errMsg}. Please try using browser_snapshot to see page content and extract data manually.`;
    }
  }

  private handleEnd(args: Record<string, any>): string {
    return `Task completed: ${(args.summary as string) || 'Done'}`;
  }
}
