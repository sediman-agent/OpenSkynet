import { LayoutList, Bot, Puzzle, FileText, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/useAppStore';

const navItems = [
  { id: 'tasks' as const, label: 'Tasks', icon: LayoutList },
  { id: 'agent' as const, label: 'Agent', icon: Bot },
  { id: 'skills' as const, label: 'Skills', icon: Puzzle },
  { id: 'logs' as const, label: 'Logs', icon: FileText },
  { id: 'settings' as const, label: 'Settings', icon: Settings },
];

export function SidebarNav() {
  const currentPage = useAppStore((state) => state.currentPage);
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);

  return (
    <div className="px-3">
      <div className="text-xs font-medium text-muted-foreground px-3 mb-2">
        Navigation
      </div>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
