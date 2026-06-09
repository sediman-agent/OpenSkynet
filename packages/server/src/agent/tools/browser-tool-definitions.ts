/**
 * Browser Tool Definitions
 * All tool definitions for browser automation
 */

import { ToolDefinition } from "../../core/types";

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
        key: { type: 'string', description: 'Key to press (e.g., "Enter", "Tab", "Escape", "ArrowDown", "Backspace")' },
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
    name: 'browser_drag_and_drop',
    description: 'Drag an element and drop it onto another element. Use this for drag-and-drop interfaces, sortable lists, or file uploads.',
    parameters: {
      type: 'object',
      properties: {
        sourceRefId: { type: 'number', description: 'The refId of the element to drag' },
        targetRefId: { type: 'number', description: 'The refId of the element to drop onto' },
      },
      required: ['sourceRefId', 'targetRefId'],
    },
  },
  {
    name: 'browser_upload_file',
    description: 'Upload a file to a file input element. Use this for file upload forms and attachments.',
    parameters: {
      type: 'object',
      properties: {
        refId: { type: 'number', description: 'The refId of the file input element' },
        filePath: { type: 'string', description: 'Path to the file to upload' },
      },
      required: ['refId', 'filePath'],
    },
  },
  {
    name: 'browser_execute_script',
    description: 'Execute custom JavaScript code on the page. Use this for advanced interactions, shadow DOM, custom selectors, or data extraction.',
    parameters: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'JavaScript code to execute' },
      },
      required: ['script'],
    },
  },
  {
    name: 'browser_close_tab',
    description: 'Close the current browser tab or a specific tab by index.',
    parameters: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'The index of the tab to close (optional, closes current tab if not specified)' },
      },
      required: [],
    },
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
    name: 'browser_extract_data',
    description: 'Extract specific structured data from the current page. Use this to pull out exact values like stock prices, dates, names, or other information the user requested. Returns the extracted value in a clean format.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What specific data to extract (e.g., "TSLA stock price", "application deadline", "person name and title")' },
        format: { type: 'string', enum: ['price', 'date', 'text', 'number', 'email', 'phone'], description: 'Expected format of the data (helps with extraction)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'browser_end',
    description: 'Call this when the task is fully completed. Provide a summary of what was accomplished.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Brief summary of what was accomplished' },
      },
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
