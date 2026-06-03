import { Sidebar } from './Sidebar';
import { useAppStore } from '@/stores/useAppStore';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <main
        className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
          sidebarOpen ? 'ml-64' : 'ml-16'
        }`}
      >
        {children}
      </main>
    </div>
  );
}
