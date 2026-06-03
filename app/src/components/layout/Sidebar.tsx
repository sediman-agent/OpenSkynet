import { useState } from 'react';
import {
  LayoutList,
  Bot,
  Puzzle,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/useAppStore';
import { SidebarNav } from './SidebarNav';
import { SidebarAgent } from './SidebarAgent';
import { SidebarStatus } from './SidebarStatus';
import { Button } from '@/components/shared/Button';

export function Sidebar() {
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const setSidebarOpen = useAppStore((state) => state.setSidebarOpen);
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full bg-card border-r border-border flex flex-col z-50 transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-16'
      )}
    >
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border">
        {sidebarOpen && (
          <span className="text-lg font-semibold text-foreground">
            Sediman
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="ml-auto"
        >
          {sidebarOpen ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      {sidebarOpen && (
        <>
          <nav className="flex-1 overflow-y-auto py-4">
            <SidebarNav />
            <div className="my-4 border-t border-border" />
            <SidebarAgent />
          </nav>

          {/* Status */}
          <div className="p-4 border-t border-border">
            <SidebarStatus />
          </div>
        </>
      )}

      {/* Collapsed: Icons only */}
      {!sidebarOpen && (
        <nav className="flex-1 flex flex-col items-center py-4 gap-2">
          <NavIcon icon={LayoutList} page="tasks" />
          <NavIcon icon={Bot} page="agent" />
          <NavIcon icon={Puzzle} page="skills" />
          <NavIcon icon={FileText} page="logs" />
          <NavIcon icon={Settings} page="settings" />
        </nav>
      )}
    </aside>
  );
}

function NavIcon({
  icon: Icon,
  page,
}: {
  icon: React.ElementType;
  page: string;
}) {
  const currentPage = useAppStore((state) => state.currentPage);
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const isActive = currentPage === page;

  return (
    <button
      onClick={() => setCurrentPage(page as any)}
      className={cn(
        'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
