/**
 * useCdpConnection Hook
 * Establishes CDP connection between Electron BrowserView and backend server
 */

import { useEffect, useState, useCallback } from 'react';

const API_BASE = 'http://localhost:3001/api';

export function useCdpConnection(isBrowserPanelOpen: boolean) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>( null);

  const establishConnection = useCallback(async () => {
    if (isConnected || isConnecting) {
      console.log('[CdpConnection] Already connected or connecting');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      console.log('[CdpConnection] Getting CDP target from Electron...');

      // Step 1: Get CDP target from Electron main process
      const cdpTarget = await window.electronAPI?.getCdpTarget?.();
      if (!cdpTarget?.success) {
        throw new Error(cdpTarget?.error || 'Failed to get CDP target');
      }

      console.log('[CdpConnection] CDP target received:', {
        url: cdpTarget.webSocketDebuggerUrl?.substring(0, 60) + '...',
        targetId: cdpTarget.targetId
      });

      // Step 2: Connect backend to the CDP endpoint
      console.log('[CdpConnection] Connecting backend to CDP...');
      const response = await fetch(`${API_BASE}/browser/connect-cdp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[CdpConnection] Failed:', errorMsg);
      setError(errorMsg);
      setIsConnecting(false);
    }
  }, [isConnected, isConnecting]);

  useEffect(() => {
    if (!isBrowserPanelOpen) {
      console.log('[CdpConnection] Browser panel closed, skipping connection');
      return;
    }

    // Wait a bit for the BrowserView to be ready
    const timer = setTimeout(() => {
      console.log('[CdpConnection] Browser panel open, establishing CDP connection...');
      establishConnection();
    }, 1000);

    return () => clearTimeout(timer);
  }, [isBrowserPanelOpen, establishConnection]);

  return { isConnected, isConnecting, error, establishConnection };
}
