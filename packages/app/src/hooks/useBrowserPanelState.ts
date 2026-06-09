import { useState, useCallback } from 'react';

export type BrowserStatus = 'idle' | 'connecting' | 'ready' | 'error';

export interface BrowserState {
  inputUrl: string;
  setInputUrl: (url: string) => void;
  browserStatus: BrowserStatus;
  setBrowserStatus: (status: BrowserStatus) => void;
  browserUrl: string;
  setBrowserUrl: (url: string) => void;
  webviewSrc: string;
  setWebviewSrc: (src: string) => void;
  latestSnapshot: { elements: Array<{ refId: number; x: number; y: number }> } | null;
  setLatestSnapshot: (snapshot: any) => void;
  updateBrowserUrls: (url: string) => void;
}

export function useBrowserPanelState(): BrowserState {
  const [inputUrl, setInputUrl] = useState('');
  const [browserStatus, setBrowserStatus] = useState<BrowserStatus>('idle');
  const [browserUrl, setBrowserUrl] = useState('about:blank');
  const [webviewSrc, setWebviewSrc] = useState('https://example.com');
  const [latestSnapshot, setLatestSnapshot] = useState<{ elements: Array<{ refId: number; x: number; y: number }> } | null>(null);

  // Helper to update all URL-related states at once
  const updateBrowserUrls = useCallback((url: string) => {
    setBrowserUrl(url);
    setInputUrl(url);
    setWebviewSrc(url);
  }, []);

  return {
    inputUrl,
    setInputUrl,
    browserStatus,
    setBrowserStatus,
    browserUrl,
    setBrowserUrl,
    webviewSrc,
    setWebviewSrc,
    latestSnapshot,
    setLatestSnapshot,
    updateBrowserUrls,
  };
}
