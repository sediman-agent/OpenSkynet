/**
 * VS Code-Style App Layout
 * Three-panel layout: Primary Sidebar | Editor Area | Secondary Sidebar
 * Secondary Sidebar contains chat and browser panels
 */

import { useEffect, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';
import { SandboxPanel } from '@/components/sandbox';
import { PanelSystem } from './PanelSystem';
import { useSandboxStore } from '@/stores/useSandboxStore';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const sandboxOpen = useSandboxStore((state) => state.isOpen);
  const toggleSandbox = useSandboxStore((state) => state.togglePanel);
  const setIsActive = useSandboxStore((state) => state.setIsActive);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // BrowserView overlay disabled - no cleanup needed
    };
  }, []);

  // Create panel configuration
  const rightPanel = {
    id: 'browser',
    title: 'Browser',
    component: <SandboxPanel />,
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Primary Sidebar */}
      <div className="flex-shrink-0 z-50">
        <Sidebar />
      </div>

      {/* Main Content with Panel System */}
      <PanelSystem
        rightPanel={rightPanel}
        rightOpen={sandboxOpen}
        onRightToggle={toggleSandbox}
      >
        {/* Editor Area */}
        {children}
      </PanelSystem>
    </div>
  );
}
