/**
 * VS Code Keyboard Shortcuts Hook
 * Implements VS Code-style keyboard shortcuts
 */

import { useEffect, useCallback } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useChatStore } from '@/stores/useChatStore';
import { useSandboxStore } from '@/stores/useSandboxStore';
import { navItems } from '@/lib/navigation';

export function useKeyboardShortcuts() {
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const setSidebarOpen = useAppStore((state) => state.setSidebarOpen);
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const toggleTheme = useAppStore((state) => state.toggleTheme);

  const createConversation = useChatStore((state) => state.createConversation);
  const selectConversation = useChatStore((state) => state.selectConversation);

  const sandboxOpen = useSandboxStore((state) => state.isOpen);
  const toggleSandbox = useSandboxStore((state) => state.togglePanel);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    // Don't trigger shortcuts when typing in input fields
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' ||
                     target.tagName === 'TEXTAREA' ||
                     target.contentEditable === 'true';

    if (isInput) return;

    // === VS Code Standard Shortcuts ===

    // Ctrl/Cmd + B: Toggle Primary Sidebar
    if (cmdOrCtrl && e.key === 'b') {
      e.preventDefault();
      setSidebarOpen(!sidebarOpen);
      return;
    }

    // Ctrl/Cmd + J: Toggle Secondary Sidebar (Browser Panel)
    if (cmdOrCtrl && e.key === 'j') {
      e.preventDefault();
      toggleSandbox();
      return;
    }

    // Ctrl/Cmd + ,: Open Settings
    if (cmdOrCtrl && e.key === ',') {
      e.preventDefault();
      setCurrentPage('settings');
      return;
    }

    // Ctrl/Cmd + Shift + A: Toggle Dark/Light Mode
    if (cmdOrCtrl && e.shiftKey && e.key === 'A') {
      e.preventDefault();
      toggleTheme();
      return;
    }

    // Ctrl/Cmd + N: New Conversation
    if (cmdOrCtrl && e.key === 'n') {
      e.preventDefault();
      createConversation('New Chat').then(conv => {
        selectConversation(conv.id);
        setCurrentPage('agent');
      });
      return;
    }

    // Ctrl/Cmd + 1-9: Switch to pages by number
    if (cmdOrCtrl && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      const idx = parseInt(e.key) - 1;
      if (idx < navItems.length) {
        setCurrentPage(navItems[idx].id);
      }
      return;
    }

    // Escape: Close panels
    if (e.key === 'Escape') {
      if (sandboxOpen) {
        toggleSandbox();
      }
      return;
    }
  }, [sidebarOpen, setSidebarOpen, sandboxOpen, toggleSandbox, setCurrentPage, toggleTheme, createConversation, selectConversation]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export default useKeyboardShortcuts;
