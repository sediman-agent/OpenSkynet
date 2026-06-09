/**
 * VS Code-Style Sidebar Navigation
 * Navigation items with exact VS Code styling
 */

import { Globe } from 'lucide-react';
import { navItems } from '@/lib/navigation';
import { useAppStore } from '@/stores/useAppStore';
import { useSandboxStore } from '@/stores/useSandboxStore';

export function SidebarNav() {
  const currentPage = useAppStore((state) => state.currentPage);
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const togglePanel = useSandboxStore((state) => state.togglePanel);
  const isPanelOpen = useSandboxStore((state) => state.isOpen);

  return (
    <div className="space-y-0">
      {navItems.map((item) => {
        const isActive = currentPage === item.id;
        const Icon = item.icon;

        return (
          <button
            key={item.id}
            onClick={() => setCurrentPage(item.id as any)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors duration-150 border-l-2"
            style={{
              borderColor: isActive ? 'var(--vscode-focus-border)' : 'transparent',
              color: isActive ? 'var(--vscode-sideBar-foreground)' : 'var(--vscode-sideBar-foreground)'
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon size={14} />
            <span>{item.label}</span>
          </button>
        );
      })}

      {/* Browser Panel Button */}
      <button
        onClick={togglePanel}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors duration-150 border-l-2"
        style={{
          borderColor: isPanelOpen ? 'var(--vscode-focus-border)' : 'transparent',
          backgroundColor: isPanelOpen ? 'rgba(0, 127, 212, 0.1)' : 'transparent',
          color: 'var(--vscode-sideBar-foreground)'
        }}
        onMouseEnter={(e) => {
          if (!isPanelOpen) {
            e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isPanelOpen) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
        aria-label="Open browser panel"
      >
        <Globe size={14} />
        <span>Browser</span>
      </button>
    </div>
  );
}

export default SidebarNav;
