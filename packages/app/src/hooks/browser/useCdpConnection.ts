/**
 * useCdpConnection Hook
 * Establishes CDP connection between Electron BrowserView and backend server
 */

import { useEffect, useState, useCallback } from 'react';

const API_BASE = 'http://localhost:3001/api';

export function useCdpConnection(isBrowserPanelOpen: boolean) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const establishConnection = useCallback(async () => {
    if (isConnected || isConnecting) {
      console.log('[CdpConnection] Already connected or connecting');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Step 0: Ensure BrowserView is created
      console.log('[CdpConnection] Ensuring BrowserView is created...');
      const showResult = await window.electronAPI?.browser?.show?.();
      console.log('[CdpConnection] BrowserView show result:', showResult);

      // Give BrowserView a moment to initialize
      await new Promise(resolve => setTimeout(resolve, 1000));

      // In Electron mode, skip CDP connection - use IPC execution instead
      console.log('[CdpConnection] Skipping CDP connection - using IPC execution');
      setIsConnected(true);
      setIsConnecting(false);
      setRetryCount(0);
      return;

      // Below code is not used in Electron mode
      // Step 1: Get CDP target from Electron main process
      // Note: getCdpTarget is nested under browser object in preload script
      console.log('[CdpConnection] Getting CDP target from Electron...');
      const cdpTarget = await window.electronAPI?.browser?.getCdpTarget?.();
      if (!cdpTarget?.success) {
        throw new Error(cdpTarget?.error || 'Failed to get CDP target');
      }

      console.log('[CdpConnection] CDP target received:', {
        url: cdpTarget.webSocketDebuggerUrl?.substring(0, 60) + '...',
        targetId: cdpTarget.targetId
      });

      // Below code is not used in Electron mode - kept for reference
      /*
      // Step 2: Connect backend to the CDP endpoint
      console.log('[CdpConnection] Connecting backend to CDP...');
      const response = await fetch(`${API_BASE}/browser/cdp/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: cdpTarget.webSocketDebuggerUrl,
          webSocketDebuggerUrl: cdpTarget.webSocketDebuggerUrl,
          targetId: cdpTarget.targetId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to connect CDP');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'CDP connection failed');
      }

      console.log('[CdpConnection] ✓ CDP connection established!');
      setIsConnected(true);
      setIsConnecting(false);
      setRetryCount(0);
      */

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[CdpConnection] Failed:', errorMsg);
      setError(errorMsg);
      setIsConnecting(false);

      // Retry logic
      if (retryCount < 3) {
        console.log(`[CdpConnection] Retrying in 2 seconds... (${retryCount + 1}/3)`);
        setRetryCount(prev => prev + 1);
        setTimeout(() => {
          establishConnection();
        }, 2000);
      }
    }
  }, [isConnected, isConnecting, retryCount]);

  useEffect(() => {
    if (!isBrowserPanelOpen) {
      console.log('[CdpConnection] Browser panel closed, skipping connection');
      setIsConnected(false);
      setRetryCount(0);
      return;
    }

    // Wait a bit longer for the BrowserView to be ready
    const timer = setTimeout(() => {
      console.log('[CdpConnection] Browser panel open, establishing CDP connection...');
      establishConnection();
    }, 2000);

    return () => clearTimeout(timer);
  }, [isBrowserPanelOpen, establishConnection]);

  return { isConnected, isConnecting, error, establishConnection };
}
