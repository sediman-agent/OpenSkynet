import { create } from 'zustand';
import type { Task } from '@/types';

interface TaskState {
  // State
  tasks: Task[];
  activeTask: Task | null;

  // Actions
  addTask: (task: Omit<Task, 'id' | 'createdAt'>) => Task;
  updateTask: (id: string, updates: Partial<Task>) => void;
  removeTask: (id: string) => void;
  setActiveTask: (task: Task | null) => void;
  clearCompleted: () => void;
}

export const useTaskStore = create<TaskState>()((set) => ({
  // Initial state
  tasks: [],
  activeTask: null,

  // Actions
  addTask: (task) => {
    const newTask: Task = {
      ...task,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    };

    set((state) => ({
      tasks: [...state.tasks, newTask],
      activeTask: task.status === 'running' ? newTask : state.activeTask,
    }));

    return newTask;
  },

  updateTask: (id, updates) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
      activeTask: state.activeTask?.id === id
        ? { ...state.activeTask, ...updates }
        : state.activeTask,
    }));
  },

  removeTask: (id) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      activeTask: state.activeTask?.id === id
        ? null
        : state.activeTask,
    }));
  },

  setActiveTask: (task) => {
    set({ activeTask: task });
  },

  clearCompleted: () => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.status !== 'completed'),
    }));
  },
}));
