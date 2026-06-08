import { ToolBus } from './bus.js';
import type { ToolExecutor } from './interfaces.js';
import { BrowserController } from '../../browser/controller.js';
import type { ToolDefinition } from '../../core/types.js';
import type { ProjectManager } from '../../project/manager.js';
import { setLatestScreenshot } from '../../api/routes/browser.js';

let browserController: BrowserController | null = null;
let projectManager: ProjectManager | null = null;

let pendingInterventionId = 0;
let interventionPromise: { resolve: (v: string) => void; message: string; id: number } | null = null;

export function hasPendingIntervention(): boolean {
  return interventionPromise !== null;
}

export function getPendingIntervention(): { message: string; id: number } | null {
  if (!interventionPromise) return null;
  return { message: interventionPromise.message, id: interventionPromise.id };
}

export function resolveIntervention(result: string): boolean {
  if (!interventionPromise) return false;
  interventionPromise.resolve(result);
  interventionPromise = null;
  return true;
}

export function setProjectManager(pm: ProjectManager): void {
  projectManager = pm;
}

async function ensurePage(ctrl: BrowserController): Promise<boolean> {
  const session = ctrl.getSession();
  if (!session || !session.isStarted) {
    await ctrl.start();
  }
  const ctx = ctrl.getSession()?.context;
  if (!ctx) return false;
  if (ctx.pages().length === 0) {
    await ctx.newPage();
  }
  return true;
}

function storeScreenshot(url?: string): void {
  const ctrl = browserController;
  if (!ctrl) return;
  (async () => {
    try {
      await new Promise(r => setTimeout(r, 300));
      const shot = await ctrl.screenshot();
      if (shot && shot.length > 100) {
        const currentUrl = url || ctrl.getSession()?.context?.pages()[0]?.url() || '';
        setLatestScreenshot(shot, currentUrl);
      }
    } catch {}
  })();
}

export const ALL_BROWSER_TOOLS: ToolDefinition[] = [
  {
    name: 'browser_navigate',
    description: 'Navigate to a URL. Use this to go to a specific website or web page.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to navigate to' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_snapshot',
    description: 'Capture a snapshot of the current page showing all visible interactive elements with their refId numbers. Use this to understand the page structure and find elements to interact with. Always call this after navigation or before clicking/typing.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'browser_click',
    description: 'Click an element on the page by its refId (from browser_snapshot). Use this for buttons, links, and other clickable elements.',
    parameters: {
      type: 'object',
      properties: {
        refId: { type: 'number', description: 'The refId of the element to click (from browser_snapshot)' },
      },
      required: ['refId'],
    },
  },
  {
    name: 'browser_type',
    description: 'Type text into an input field by its refId. Optionally press Enter after typing to submit the form.',
    parameters: {
      type: 'object',
      properties: {
        refId: { type: 'number', description: 'The refId of the input element' },
        text: { type: 'string', description: 'The text to type' },
        submit: { type: 'boolean', description: 'Press Enter after typing to submit the form' },
      },
      required: ['refId', 'text'],
    },
  },
  {
    name: 'browser_scroll',
    description: 'Scroll the page up or down to reveal more content. Use this when you need to see elements below the fold.',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down'], description: 'Direction to scroll' },
        amount: { type: 'number', description: 'Amount in pixels to scroll (default 500)' },
      },
      required: ['direction'],
    },
  },
  {
    name: 'browser_press_key',
    description: 'Press a keyboard key (Enter, Tab, Escape, Backspace, ArrowDown, etc). Use for form submission, closing modals, keyboard navigation, autocomplete selection.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key to press (e.g. "Enter", "Tab", "Escape", "ArrowDown", "Backspace")' },
      },
      required: ['key'],
    },
  },
  {
    name: 'browser_hover',
    description: 'Hover over an element by refId. Use this to trigger hover menus, tooltips, and dropdown menus.',
    parameters: {
      type: 'object',
      properties: {
        refId: { type: 'number', description: 'The refId of the element to hover over' },
      },
      required: ['refId'],
    },
  },
  {
    name: 'browser_select_option',
    description: 'Select an option from a dropdown <select> element by its refId and the option value.',
    parameters: {
      type: 'object',
      properties: {
        refId: { type: 'number', description: 'The refId of the select element' },
        value: { type: 'string', description: 'The value of the option to select' },
      },
      required: ['refId', 'value'],
    },
  },
  {
    name: 'browser_go_back',
    description: 'Go back to the previous page. Use this when navigation leads to an unexpected page or you need to return.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'browser_go_forward',
    description: 'Go forward to the next page (after going back).',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'browser_refresh',
    description: 'Refresh/reload the current page.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'browser_switch_tab',
    description: 'Switch to a different browser tab by its index. Use browser_list_tabs to see available tabs.',
    parameters: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'The index of the tab to switch to (0-based)' },
      },
      required: ['index'],
    },
  },
  {
    name: 'browser_list_tabs',
    description: 'List all open browser tabs with their URLs and titles.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'browser_wait',
    description: 'Wait for a specific element to appear on the page. Use this after navigation to wait for dynamic content to load.',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to wait for' },
        timeout: { type: 'number', description: 'Maximum wait time in milliseconds (default 10000)' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_extract_text',
    description: 'Extract all visible text content from the current page.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current page. Returns confirmation that a screenshot was captured.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'browser_end',
    description: 'Call this when the task is fully completed. Provide a summary of what was accomplished.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Brief summary of what was accomplished' },
      },
      required: [],
    },
  },
  {
    name: 'request_human_help',
    description: 'Request human help for tasks you cannot complete alone (CAPTCHA, login, payment, SMS verification). The user sees a prompt and you wait until they click Done.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'What the user should do' },
      },
      required: ['message'],
    },
  },
];

export function registerBrowserTools(toolBus: ToolBus, controller?: BrowserController): void {
  if (!browserController && controller) {
    browserController = controller;
  }
  if (!browserController) {
    throw new Error('BrowserController not provided.');
  }

  const executor: ToolExecutor = async (name, args) => {
    const ctrl = browserController!;
    try {
      let result: string;

      if (!await ensurePage(ctrl)) {
        return { success: false, output: '', error: 'Browser context not available' };
      }

      switch (name) {
        case 'browser_navigate':
          result = await ctrl.navigate(args.url as string);
          storeScreenshot(args.url as string);
          break;

        case 'browser_click':
          result = await ctrl.click(args.refId as number);
          storeScreenshot();
          break;

        case 'browser_type':
          result = await ctrl.typeText(args.refId as number, args.text as string, args.submit as boolean);
          storeScreenshot();
          break;

        case 'browser_snapshot': {
          const snap = await ctrl.snapshot();
          const out = snap.output || snap.elements.map(
            (el) => `[${el.refId}]<${el.tag}>${el.text ? ' ' + JSON.stringify(el.text.slice(0, 100)) : ''}`
          ).join('\n');
          result = `Current URL: ${snap.url}\nTitle: ${snap.title}\n\n${out}\n\n${snap.elements.length} interactive elements total.`;
          storeScreenshot(snap.url);
          break;
        }

        case 'browser_scroll':
          result = await ctrl.scroll(args.direction as string, args.amount as number | undefined);
          storeScreenshot();
          break;

        case 'browser_press_key':
          result = await ctrl.pressKey(args.key as string);
          storeScreenshot();
          break;

        case 'browser_hover':
          result = await ctrl.hover(args.refId as number);
          storeScreenshot();
          break;

        case 'browser_select_option':
          result = await ctrl.selectOption(args.refId as number, args.value as string);
          storeScreenshot();
          break;

        case 'browser_go_back':
          result = await ctrl.goBack();
          storeScreenshot();
          break;

        case 'browser_go_forward':
          result = await ctrl.goForward();
          storeScreenshot();
          break;

        case 'browser_refresh':
          result = await ctrl.refresh();
          storeScreenshot();
          break;

        case 'browser_switch_tab':
          result = await ctrl.switchTab(args.index as number);
          storeScreenshot();
          break;

        case 'browser_list_tabs':
          result = await ctrl.listTabs();
          break;

        case 'browser_wait':
          result = await ctrl.waitForSelector(args.selector as string, args.timeout as number | undefined);
          break;

        case 'browser_extract_text':
          result = await ctrl.extractText();
          break;

        case 'browser_screenshot': {
          const shot = await ctrl.screenshot();
          if (shot && shot.length > 100) {
            const url = ctrl.getSession()?.context?.pages()[0]?.url() || '';
            setLatestScreenshot(shot, url);
          }
          result = shot ? `Screenshot captured (${shot.length} bytes)` : 'Screenshot failed';
          break;
        }

        case 'browser_end':
          result = `Task completed: ${(args.summary as string) || 'Done'}`;
          break;

        case 'request_human_help': {
          const msg = (args.message as string) || 'Agent needs assistance';
          try {
            const helpShot = await ctrl.screenshot();
            if (helpShot) setLatestScreenshot(helpShot, ctrl.getSession()?.context?.pages()[0]?.url() || '');
          } catch {}

          const iid = ++pendingInterventionId;
          try {
            const userResp = await new Promise<string>((resolve) => {
              interventionPromise = { resolve, message: msg, id: iid };
              setTimeout(() => { if (interventionPromise?.id === iid) resolve('timeout'); }, 120000);
            });
            result = userResp === 'timeout'
              ? 'Human intervention timed out after 2 minutes.'
              : `Human intervention completed: ${userResp}`;
          } catch {
            result = 'Human intervention cancelled';
          }
          interventionPromise = null;
          break;
        }

        default:
          return { success: false, output: '', error: `Unknown tool: ${name}` };
      }

      return { success: true, output: result };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  for (const tool of ALL_BROWSER_TOOLS) {
    toolBus.register(tool, executor);
  }
}

export function registerBrowserToolsForProject(toolBus: ToolBus, pm: ProjectManager, projectId: string): void {
  const controller = pm.getBrowserController(projectId);
  if (!controller) throw new Error(`Browser not started for project: ${projectId}`);
  registerBrowserTools(toolBus, controller);
}

export function getBrowserController(projectId?: string): BrowserController | null {
  if (projectId && projectManager) return projectManager.getBrowserController(projectId);
  return browserController;
}

export function setBrowserController(controller: BrowserController): void {
  browserController = controller;
}

export async function cleanupBrowserTools(): Promise<void> {
  if (browserController) { await browserController.stop(); browserController = null; }
  if (projectManager) { await projectManager.shutdown(); projectManager = null; }
}

export async function takeBrowserScreenshot(projectId?: string): Promise<string | null> {
  const controller = getBrowserController(projectId);
  if (!controller) return null;
  return controller.screenshot();
}
