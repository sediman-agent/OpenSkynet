/**
 * Browser Navigation Test for Electron Mode
 * Verifies that browser commands work in Electron mode without CDP connection
 */

import { describe, test, expect } from '@jest/globals';

describe('Browser Navigation in Electron Mode', () => {
  test('backend acknowledges browser navigate command in Electron mode', async () => {
    // Set Electron mode
    process.env.SEDIMAN_MODE = 'electron';

    const response = await fetch('http://localhost:3001/api/browser/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'navigate',
        url: 'https://www.google.com'
      })
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.result).toContain('acknowledged');
  });

  test('backend acknowledges browser snapshot command in Electron mode', async () => {
    // Set Electron mode
    process.env.SEDIMAN_MODE = 'electron';

    const response = await fetch('http://localhost:3001/api/browser/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'snapshot'
      })
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('backend handles click command in Electron mode', async () => {
    // Set Electron mode
    process.env.SEDIMAN_MODE = 'electron';

    const response = await fetch('http://localhost:3001/api/browser/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'click',
        refId: 1
      })
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});
