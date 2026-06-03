import {
  LayoutList,
  Bot,
  Puzzle,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
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

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full flex flex-col z-50',
        'bg-white/95 backdrop-blur-xl',
        'border-r border-gray-200/50',
        'transition-all duration-300 ease-out',
        sidebarOpen ? 'w-64' : 'w-16'
      )}
    >
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-gray-200/50">
        {sidebarOpen ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gray-900 to-black flex items-center justify-center shadow-lg">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-semibold text-gray-900 tracking-tight">OpenSkynet</span>
          </div>
        ) : (
          <div className="w-full flex justify-center">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gray-900 to-black flex items-center justify-center shadow-lg">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="h-8 w-8 shrink-0 hover:bg-gray-100 rounded-full transition-colors"
        >
          {sidebarOpen ? (
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-600" />
          )}
        </Button>
      </div>

      {/* Content */}
      {sidebarOpen && (
        <>
          <nav className="flex-1 overflow-y-auto py-2">
            {/* Navigation */}
            <div className="px-3 py-2">
              <SidebarNav />
            </div>

            {/* Divider */}
            <div className="mx-3 my-2 h-px bg-gradient-to-r from-transparent via-gray-200/50 to-transparent" />

            {/* Agent History */}
            <div className="px-3 py-2">
              <SidebarAgent />
            </div>
          </nav>

          {/* Status */}
          <div className="p-4 border-t border-gray-200/50">
            <SidebarStatus />
          </div>
        </>
      )}

      {/* Collapsed state */}
      {!sidebarOpen && (
        <nav className="flex-1 flex flex-col items-center py-2 gap-1">
          <CollapsedNavItem icon={LayoutList} page="tasks" />
          <CollapsedNavItem icon={Bot} page="agent" />
          <CollapsedNavItem icon={Puzzle} page="skills" />
          <CollapsedNavItem icon={FileText} page="logs" />
          <CollapsedNavItem icon={Settings} page="settings" />
        </nav>
      )}
    </aside>
  );
}

function CollapsedNavItem({
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
        'w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200',
        'hover:bg-gray-100 active:scale-105',
        isActive
          ? 'bg-black text-white shadow-md'
          : 'text-gray-600'
      )}
      title={page.charAt(0).toUpperCase() + page.slice(1)}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
}
