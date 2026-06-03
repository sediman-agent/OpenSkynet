import { test, expect } from '@playwright/test';

test.describe('OpenSkynet Desktop App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads the application', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'OpenSkynet' })).toBeVisible();
  });

  test('sidebar navigation works', async ({ page }) => {
    // Click on Tasks
    await page.click('button:has-text("Tasks")');
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();

    // Click on Skills
    await page.click('button:has-text("Skills")');
    await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible();

    // Click on Logs
    await page.click('button:has-text("Logs")');
    await expect(page.getByRole('heading', { name: 'Logs' })).toBeVisible();

    // Click on Settings
    await page.click('button:has-text("Settings")');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('can collapse and expand sidebar', async ({ page }) => {
    const sidebar = page.locator('aside').first();

    // Initial state - should be expanded
    await expect(sidebar).toHaveClass(/w-64/);

    // Collapse sidebar
    await page.click('[aria-label="Collapse sidebar"]');
    await expect(sidebar).toHaveClass(/w-16/);

    // Expand sidebar
    await page.click('[aria-label="Expand sidebar"]');
    await expect(sidebar).toHaveClass(/w-64/);
  });

  test('Agent page creates new conversation', async ({ page }) => {
    // Click New Chat button
    await page.click('button:has-text("New Chat")');

    // Check if new conversation was created (multiple conversations in sidebar)
    const conversations = page.locator('.codex-scrollbar').getByRole('listitem').all();
    expect(conversations.length).toBeGreaterThan(0);
  });

  test('Agent page allows typing message', async ({ page }) => {
    const textarea = page.getByPlaceholderText(/Message OpenSkynet/);

    await textarea.fill('Hello, how are you?');
    await expect(textarea).toHaveValue('Hello, how are you?');
  });

  test('Tasks page allows creating task', async ({ page }) => {
    await page.click('button:has-text("Tasks")');

    const input = page.getByPlaceholderText(/What should OpenSkynet/);
    const runButton = page.getByRole('button', { name: 'Run' });

    // Initially Run button should be disabled
    await expect(runButton).toBeDisabled();

    // Type a task
    await input.fill('Test task');
    await expect(runButton).not.toBeDisabled();
  });

  test('Skills page displays skills', async ({ page }) => {
    await page.click('button:has-text("Skills")');

    // Check if skills are displayed
    await expect(page.getByText('web-search')).toBeVisible();
    await expect(page.getByText('browser-automation')).toBeVisible();
  });

  test('Skills page filter buttons work', async ({ page }) => {
    await page.click('button:has-text("Skills")');

    // Click Installed filter
    await page.click('button:has-text("Installed")');
    await expect(page.getByText(/Installed \(/)).toBeVisible();

    // Click Available filter
    await page.click('button:has-text("Available")');
    await expect(page.getByText(/Available \(/)).toBeVisible();
  });

  test('Logs page displays logs', async ({ page }) => {
    await page.click('button:has-text("Logs")');

    // Check if logs are displayed
    await expect(page.getByText(/Application started/)).toBeVisible();
    await expect(page.getByText(/Connecting to RPC server/)).toBeVisible();
  });

  test('Logs page filter buttons work', async ({ page }) => {
    await page.click('button:has-text("Logs")');

    // Click Errors filter
    await page.click('button:has-text("Errors")');

    // Check if error logs are shown
    await expect(page.getByText('Failed to navigate to page')).toBeVisible();
  });

  test('Settings page displays configuration', async ({ page }) => {
    await page.click('button:has-text("Settings")');

    // Check if settings sections are visible
    await expect(page.getByText('RPC Connection')).toBeVisible();
    await expect(page.getByText('LLM Configuration')).toBeVisible();
    await expect(page.getByText('Browser Configuration')).toBeVisible();
  });

  test('Settings page allows changing settings', async ({ page }) => {
    await page.click('button:has-text("Settings")');

    const rpcInput = page.getByPlaceholderText('ws://localhost:8765');
    await expect(rpcInput).toBeVisible();

    // Change the RPC URL
    await rpcInput.fill('ws://localhost:9999');
    await expect(rpcInput).toHaveValue('ws://localhost:9999');

    // Save button should be enabled
    const saveButton = page.getByRole('button', { name: 'Save Changes' });
    await expect(saveButton).not.toBeDisabled();
  });

  test('theme is white background with dark text', async ({ page }) => {
    // Check body background
    const body = page.locator('body');
    await expect(body).toHaveCSS('background-color', 'rgb(255, 255, 255)');

    // Check text color
    const heading = page.getByRole('heading', { name: 'Agent' });
    await expect(heading).toHaveCSS('color', /rgb\(0, 0, [0-9]+\)/);
  });

  test('has proper visual hierarchy', async ({ page }) => {
    // Check main heading size
    const heading = page.getByRole('heading', { name: 'Agent' });
    await expect(heading).toHaveClass(/text-lg/);

    // Check button has proper styling
    const button = page.getByRole('button', { name: 'New Chat' });
    await expect(button).toHaveClass(/px-4/, /py-2/);
  });
});
