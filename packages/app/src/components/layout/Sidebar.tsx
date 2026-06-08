import {
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  MessageSquare,
  FolderOpen,
  Bot,
  Server,
  Database,
  History,
  Package,
  FileText,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/useAppStore';
import { SidebarNav } from './SidebarNav';
import { SidebarAgent } from './SidebarAgent';
import { SidebarStatus } from './SidebarStatus';
import { Button } from '@/elements/actions/Button';

const navItems = [
  { id: 'agent' as const, label: 'Chat', icon: MessageSquare, shortcut: '1' },
  { id: 'projects' as const, label: 'Projects', icon: FolderOpen, shortcut: '2' },
  { id: 'models' as const, label: 'Models', icon: Bot, shortcut: '3' },
  { id: 'provider' as const, label: 'Provider', icon: Server, shortcut: '4' },
  { id: 'memory' as const, label: 'Memory', icon: Database, shortcut: '5' },
  { id: 'sessions' as const, label: 'Sessions', icon: History, shortcut: '6' },
  { id: 'skills' as const, label: 'Skills', icon: Package, shortcut: '7' },
  { id: 'logs' as const, label: 'Logs', icon: FileText, shortcut: '8' },
  { id: 'settings' as const, label: 'Settings', icon: Settings, shortcut: '9' },
];

export function Sidebar() {
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const setSidebarOpen = useAppStore((state) => state.setSidebarOpen);
  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);

  return (
    <>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-[100] bg-primary text-primary-foreground px-4 py-2 rounded">
        Skip to main content
      </a>
      <aside
        className={cn(
          'h-full flex flex-col',
          'transition-all duration-300 ease-out',
          'bg-card text-foreground border-r border-border/50',
          sidebarOpen ? 'w-56' : 'w-16'
        )}
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="h-10 flex items-center justify-between px-3 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            {sidebarOpen && (
              <span className="text-sm font-medium whitespace-nowrap">
                OpenSkynet
              </span>
            )}
          </div>
          <div className={cn('flex items-center gap-1', !sidebarOpen && 'mx-auto')}>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="h-7 w-7 shrink-0 p-0 rounded-lg hover:bg-muted transition-all duration-200"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5 text-foreground" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-foreground" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="h-7 w-7 shrink-0 p-0 rounded-lg hover:bg-muted transition-all duration-200"
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarOpen ? (
                <ChevronLeft className="w-3.5 h-3.5 text-foreground" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-foreground" />
              )}
            </Button>
          </div>
        </div>

        {sidebarOpen && (
          <>
            <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin" aria-label="Page navigation">
              <div className="px-2">
                <SidebarNav />
              </div>

              <div className="mx-4 my-2 h-px bg-border/50" />

              <div className="px-2">
                <SidebarAgent />
              </div>
            </nav>

            <div className="flex items-center p-2 border-t border-border/50 min-h-[38px] flex-shrink-0">
              <SidebarStatus />
            </div>
          </>
        )}

        {!sidebarOpen && (
          <nav className="flex-1 flex flex-col items-center py-3 gap-1" aria-label="Page navigation (collapsed)">
            {navItems.map((item) => (
              <CollapsedNavItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                page={item.id}
                shortcut={item.shortcut}
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
  shortcut?: string;
}

function CollapsedNavItem({ icon: Icon, label, page, shortcut }: CollapsedNavItemProps) {
  const currentPage = useAppStore((state) => state.currentPage);
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const isActive = currentPage === page;

  return (
    <div className="group relative">
      <button
        onClick={() => setCurrentPage(page as any)}
        className={cn(
          'sidebar-icon-btn',
          'w-12 h-12',
          isActive && 'active'
        )}
        title={label}
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon className="w-5 h-5" />
      </button>

      {/* Elegant tooltip */}
      <div className="sidebar-tooltip">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">{label}</span>
          {shortcut && (
            <kbd className="tooltip-shortcut">{shortcut}</kbd>
          )}
        </div>
      </div>
    </div>
  );
}
