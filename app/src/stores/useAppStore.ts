import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings, AgentStatus, Notification } from '@/types';

interface AppState extends AppSettings {
  // State
  isConnected: boolean;
  agentStatus: AgentStatus;
  notifications: Notification[];
  sidebarOpen: boolean;
  currentPage: 'tasks' | 'agent' | 'skills' | 'logs' | 'settings';

  // Actions
  setConnected: (connected: boolean) => void;
  setAgentStatus: (status: Partial<AgentStatus>) => void;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  setSettings: (settings: Partial<AppSettings>) => void;
  setSidebarOpen: (open: boolean) => void;
  setCurrentPage: (page: AppState['currentPage']) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Initial state
      rpcUrl: 'ws://localhost:8765',
      autoConnect: true,
      theme: 'light',
      isConnected: false,
      agentStatus: {
        state: 'idle',
        rpcConnected: false,
        browserConnected: false,
      },
      notifications: [],
      sidebarOpen: true,
      currentPage: 'agent',

      // Actions
      setConnected: (connected) =>
        set({ isConnected: connected }),

      setAgentStatus: (status) =>
        set((state) => ({
          agentStatus: { ...state.agentStatus, ...status },
        })),

      addNotification: (notification) =>
        set((state) => ({
          notifications: [
            ...state.notifications,
            {
              ...notification,
              id: crypto.randomUUID(),
              timestamp: new Date(),
            },
          ],
        })),

      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),

      setSettings: (settings) =>
        set((state) => ({ ...state, ...settings })),

      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      setCurrentPage: (page) => set({ currentPage: page }),
    }),
    {
      name: 'openskynet-app-store',
      partialize: (state) => ({
        rpcUrl: state.rpcUrl,
        autoConnect: state.autoConnect,
        theme: state.theme,
        model: state.model,
        provider: state.provider,
        headless: state.headless,
        stealth: state.stealth,
      }),
    }
  )
);
