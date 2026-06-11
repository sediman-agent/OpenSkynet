/**
 * useBrowserState Hook
 * Manages browser state (URL, status, snapshot)
 */

import { useState, useCallback, useEffect } from 'react';
import { browserService } from '@/services/BrowserService';
import { BrowserSnapshot, BrowserStatus } from './types';

export function useBrowserState(isOpen: boolean) {
  const [browserStatus, setBrowserStatus] = useState<BrowserStatus>('idle');
  const [browserUrl, setBrowserUrl] = useState('about:blank');
  const [inputUrl, setInputUrl] = useState('');
  const [webviewSrc, setWebviewSrc] = useState('https://example.com');
  const [latestSnapshot, setLatestSnapshot] = useState<BrowserSnapshot | null>(null);

  // Update state when panel opens/closes
  useEffect(() => {
    if (isOpen) {
      setBrowserStatus('ready');
      setWebviewSrc(prev => prev || 'about:blank');
    } else {
      setBrowserStatus('idle');
    }
  }, [isOpen]);

  // Listen to browser service events
  useEffect(() => {
    const handleNavigate = ({ url }: { url: string }) => {
      setWebviewSrc(url);
      setBrowserUrl(url);
      setInputUrl(url);
    };

    const handleServerNavigate = ({ url }: { url: string }) => {
      setWebviewSrc(url);
      setBrowserUrl(url);
      setInputUrl(url);
    };

    browserService.on('browser-navigate', handleNavigate);
    browserService.on('server-navigate', handleServerNavigate);

    return () => {
      browserService.off('browser-navigate', handleNavigate);
      browserService.off('server-navigate', handleServerNavigate);
    };
  }, []);

  const navigateTo = useCallback(async (url: string) => {
    let target = url.trim();
    if (!target) return;
    // Only add https:// if there's no protocol at all
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(target)) {
      target = 'https://' + target;
    }

    browserService.navigate(target);
    setWebviewSrc(target);
    setBrowserUrl(target);
    setInputUrl(target);
  }, []);

  const handleRefresh = useCallback(() => {
    browserService.reload();
  }, []);

  const handleBack = useCallback(() => {
    browserService.goBack();
  }, []);

  const handleForward = useCallback(() => {
    browserService.goForward();
  }, []);

  const handleUrlKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      navigateTo((e.target as HTMLInputElement).value);
    }
  }, [navigateTo]);

  return {
    browserStatus,
    browserUrl,
    inputUrl,
    webviewSrc,
    latestSnapshot,
    setLatestSnapshot,
    setInputUrl,
    navigateTo,
    handleRefresh,
    handleBack,
    handleForward,
    handleUrlKeyDown
  };
}
