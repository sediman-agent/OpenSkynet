/**
 * CDP Interactions Tests
 */

import { describe, it, expect, mock } from 'bun:test';
import { CDPInteractions } from '../cdp-interactions.js';

// Mock Page class
class MockPage {
  context = {
    newCDPSession: mock(() => Promise.resolve(mockCDPSession))
  };

  keyboard = {
    down: mock(() => Promise.resolve()),
    up: mock(() => Promise.resolve())
  };
}

const mockCDPSession = {
  send: mock(() => Promise.resolve()),
  detach: mock(() => Promise.resolve())
};

describe('CDPInteractions', () => {
  it('should create CDP session on initialization', async () => {
    const mockPage = new MockPage() as any;
    const cdp = new CDPInteractions(mockPage);

    await cdp.getCDPSession();

    expect(mockPage.context.newCDPSession).toHaveBeenCalled();
  });

  it('should dispatch mouse events correctly', async () => {
    const mockPage = new MockPage() as any;
    const cdp = new CDPInteractions(mockPage);

    await cdp.dispatchMouseEvent('mousePressed', 100, 200, 'left', 1);

    expect(mockCDPSession.send).toHaveBeenCalledWith('Input.dispatchMouseEvent', expect.objectContaining({
      type: 'mousePressed',
      x: 100,
      y: 200,
      button: 'left',
      buttons: 1
    }));
  });

  it('should handle different mouse buttons', async () => {
    const mockPage = new MockPage() as any;
    const cdp = new CDPInteractions(mockPage);

    await cdp.dispatchMouseEvent('mousePressed', 100, 200, 'right', 2);

    expect(mockCDPSession.send).toHaveBeenCalledWith('Input.dispatchMouseEvent', expect.objectContaining({
      button: 'right',
      buttons: 2
    }));
  });

  it('should use Playwright keyboard API for key events', async () => {
    const mockPage = new MockPage() as any;
    const cdp = new CDPInteractions(mockPage);

    await cdp.dispatchKeyEvent('keyDown', 'Enter');

    expect(mockPage.keyboard.down).toHaveBeenCalledWith('Enter');
  });

  it('should clean up CDP session on dispose', async () => {
    const mockPage = new MockPage() as any;
    const cdp = new CDPInteractions(mockPage);

    // Initialize CDP session
    await cdp.getCDPSession();

    // Dispose
    await cdp.dispose();

    expect(mockCDPSession.detach).toHaveBeenCalled();
  });
});
