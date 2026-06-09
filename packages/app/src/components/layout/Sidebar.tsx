/**
 * VS Code-Style Sidebar
 * Primary sidebar with navigation - exact VS Code styling
 */

import {
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { navItems } from '@/lib/navigation';
import { useAppStore } from '@/stores/useAppStore';
import { SidebarNav } from './SidebarNav';
import { SidebarAgent } from './SidebarAgent';
import { SidebarStatus } from './SidebarStatus';

export function Sidebar() {
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const setSidebarOpen = useAppStore((state) => state.setSidebarOpen);
  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-[100] px-4 py-2 rounded"
        style={{ backgroundColor: 'var(--vscode-button-primary-background)', color: 'var(--vscode-button-primary-foreground)' }}
      >
        Skip to main content
      </a>
      <aside
        className={cn(
          'h-full flex flex-col transition-all duration-200 ease-out border-r',
          sidebarOpen ? 'w-56' : 'w-14'
        )}
        style={{
          backgroundColor: 'var(--vscode-sideBar-background)',
          borderColor: 'var(--vscode-sideBar-border)',
          color: 'var(--vscode-sideBar-foreground)'
        }}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Header */}
        <div
          className="h-11 flex items-center justify-between px-4 border-b flex-shrink-0"
          style={{ borderColor: 'var(--vscode-sideBar-border)' }}
        >
          <div className="flex items-center gap-2">
            {sidebarOpen && (
              <span className="text-sm font-medium whitespace-nowrap" style={{ color: 'var(--vscode-sideBar-foreground)' }}>
                OpenSkynet
              </span>
            )}
          </div>
          <div className={cn('flex items-center gap-1.5', !sidebarOpen && 'mx-auto')}>
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="h-8 w-8 shrink-0 rounded flex items-center justify-center transition-colors"
              style={{ backgroundColor: 'transparent' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <Sun size={16} style={{ color: 'var(--vscode-sideBar-foreground)' }} />
              ) : (
                <Moon size={16} style={{ color: 'var(--vscode-sideBar-foreground)' }} />
              )}
            </button>

            {/* Collapse/Expand Button */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="h-8 w-8 shrink-0 rounded flex items-center justify-center transition-colors"
              style={{ backgroundColor: 'transparent' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarOpen ? (
                <ChevronLeft size={16} style={{ color: 'var(--vscode-sideBar-foreground)' }} />
              ) : (
                <ChevronRight size={16} style={{ color: 'var(--vscode-sideBar-foreground)' }} />
              )}
            </button>
          </div>
        </div>

        {/* Expanded State - Navigation */}
        {sidebarOpen && (
          <>
            <nav className="flex-1 overflow-y-auto py-2" aria-label="Page navigation">
              <div className="px-2">
                <SidebarNav />
              </div>

              <div className="mx-4 my-2 h-px" style={{ backgroundColor: 'var(--vscode-sideBar-border)' }} />

              <div className="px-2">
                <SidebarAgent />
              </div>
            </nav>

            <div
              className="flex items-center p-2 border-t min-h-[38px] flex-shrink-0"
              style={{ borderColor: 'var(--vscode-sideBar-border)' }}
            >
              <SidebarStatus />
            </div>
          </>
        )}

        {/* Collapsed State - Icons only */}
        {!sidebarOpen && (
          <nav className="flex-1 flex flex-col items-center py-6 gap-2" aria-label="Page navigation (collapsed)">
            {navItems.map((item) => (
              <CollapsedNavItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                page={item.id}
              />
            ))}
          </nav>
        )}
      </aside>
    </>
  );
}

interface CollapsedNavItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  page: string;
}

function CollapsedNavItem({ icon: Icon, label, page }: CollapsedNavItemProps) {
  const currentPage = useAppStore((state) => state.currentPage);
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const isActive = currentPage === page;

  return (
    <div className="group relative">
      <button
        onClick={() => setCurrentPage(page as any)}
        className="w-9 h-9 rounded flex items-center justify-center transition-colors"
        style={{
          backgroundColor: isActive ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
          color: isActive ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-sideBar-foreground)'
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
        }}
        title={label}
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon className="w-[18px] h-[18px]" />
      </button>

      {/* Tooltip */}
      <div
        className="absolute left-full ml-2 px-2 py-1 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50"
        style={{
          backgroundColor: 'var(--vscode-editorHoverWidget-background)',
          color: 'var(--vscode-editorHoverWidget-foreground)',
          border: '1px solid var(--vscode-editorHoverWidget-border)'
        }}
      >
        {label}
      </div>
    </div>
  );
}

export default Sidebar;
