/**
 * Task Classifier Module
 * Classifies tasks into categories for optimized execution
 */

import { getConfig } from '../../core/config';

export type TaskCategory = 'simple' | 'complex' | 'browser' | 'research' | 'creative';

export interface TaskPlan {
  category: TaskCategory;
  estimatedSteps: number;
  requiresBrowser: boolean;
  requiresVision: boolean;
  strategy: string;
  steps: Array<{ description: string }>;
}

export interface TaskClassificationResult {
  category: TaskCategory;
  confidence: number;
  reasoning: string;
}

/**
 * Classify a task into a category based on its characteristics
 */
export function classifyTask(task: string, mode?: string): TaskCategory {
  // If mode is explicitly provided, use it
  if (mode === 'turbo') {
    return 'simple';
  } else if (mode === 'browser') {
    return 'browser';
  } else if (mode === 'research') {
    return 'research';
  }

  const config = getConfig();
  const lowerTask = task.toLowerCase();

  // Check for research keywords
  const researchKeywords = config.researchKeywords || [
    'research', 'investigate', 'analyze', 'study', 'find information about',
    'compare', 'what is', 'how does', 'explain', 'define', 'history of'
  ];

  // Check for browser automation keywords
  const browserKeywords = config.browserKeywords || [
    'browse', 'navigate', 'click', 'fill form', 'submit', 'login', 'sign in',
    'scrape', 'extract', 'screenshot', 'web page', 'website', 'url', 'http'
  ];

  // Check for creative keywords
  const creativeKeywords = config.creativeKeywords || [
    'write', 'create', 'design', 'generate', 'compose', 'imagine',
    'brainstorm', 'invent', 'story', 'poem', 'article'
  ];

  // Check for simple task keywords
  const simpleKeywords = config.simpleKeywords || [
    'calculate', 'compute', 'convert', 'translate', 'summarize',
    'format', 'fix', 'debug', 'explain briefly'
  ];

  // Count matches for each category
  const researchScore = researchKeywords.filter(kw => lowerTask.includes(kw)).length;
  const browserScore = browserKeywords.filter(kw => lowerTask.includes(kw)).length;
  const creativeScore = creativeKeywords.filter(kw => lowerTask.includes(kw)).length;
  const simpleScore = simpleKeywords.filter(kw => lowerTask.includes(kw)).length;

  // Determine category based on scores
  if (browserScore >= 2 || (browserScore >= 1 && lowerTask.length > 50)) {
    return 'browser';
  } else if (researchScore >= 2 || (researchScore >= 1 && lowerTask.length > 50)) {
    return 'research';
  } else if (creativeScore >= 2) {
    return 'creative';
  } else if (simpleScore >= 1 && lowerTask.length < 100) {
    return 'simple';
  }

  // Default to complex for longer tasks or unclear categories
  return lowerTask.length > 100 ? 'complex' : 'simple';
}

/**
 * Create a plan for the task based on its category
 */
export function createPlan(task: string, category: TaskCategory): TaskPlan {
  const config = getConfig();

  let estimatedSteps = 5;
  let strategy = 'standard';
  const requiresBrowser = category === 'browser';
  const requiresVision = category === 'browser' || category === 'research';

  switch (category) {
    case 'simple':
      estimatedSteps = 3;
      strategy = 'direct';
      break;
    case 'browser':
      estimatedSteps = 10;
      strategy = 'browser_automation';
      break;
    case 'research':
      estimatedSteps = 15;
      strategy = 'multi_step_research';
      break;
    case 'creative':
      estimatedSteps = 8;
      strategy = 'iterative_creation';
      break;
    case 'complex':
      estimatedSteps = 20;
      strategy = 'complex_problem_solving';
      break;
  }

  // Adjust based on task length
  const taskLength = task.length;
  if (taskLength > 500) {
    estimatedSteps *= 1.5;
  } else if (taskLength < 100) {
    estimatedSteps *= 0.7;
  }

  return {
    category,
    estimatedSteps: Math.round(estimatedSteps),
    requiresBrowser,
    requiresVision,
    strategy,
    steps: []
  };
}

/**
 * Detect if flash mode should be used for this task
 */
export function detectFlashMode(task: string): boolean {
  const config = getConfig();
  if (!config.enableFlashMode) return false;

  const flashModeKeywords = config.flashModeKeywords || [
    'navigate to', 'go to', 'open', 'visit', 'search for', 'find'
  ];

  const lowerTask = task.toLowerCase();
  return flashModeKeywords.some(kw => lowerTask.includes(kw)) && lowerTask.length < 100;
}
