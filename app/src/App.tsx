import { useEffect } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { AppLayout } from '@/components/layout/AppLayout';
import { TasksPage } from '@/components/pages/TasksPage';
import { AgentPage } from '@/components/pages/AgentPage';
import { SkillsPage } from '@/components/pages/SkillsPage';
import { LogsPage } from '@/components/pages/LogsPage';
import { SettingsPage } from '@/components/pages/SettingsPage';

function App() {
  const currentPage = useAppStore((state) => state.currentPage);

  // Initialize app
  useEffect(() => {
    console.log('[Sediman] App initialized');
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'tasks':
        return <TasksPage />;
      case 'agent':
        return <AgentPage />;
      case 'skills':
        return <SkillsPage />;
      case 'logs':
        return <LogsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <AgentPage />;
    }
  };

  return (
    <AppLayout>
      {renderPage()}
    </AppLayout>
  );
}

export default App;
