/**
 * useProjectManager Hook
 * Manages project state, threads, and server communication
 */

import { useState, useEffect, useCallback } from 'react';
import { useProjectStore } from '@/stores/useProjectStore';
import type { Project, ThreadMessage } from '@/types/project';

const API_BASE = 'http://localhost:3001';

export function useProjectManager() {
  const activeProject = useProjectStore(state => state.getActiveProject());
  const activeThread = useProjectStore(state => state.getActiveThread());
  const createThread = useProjectStore(state => state.createThread);
  const setActiveThread = useProjectStore(state => state.setActiveThread);
  const addThreadMessage = useProjectStore(state => state.addThreadMessage);
  const updateThreadMessage = useProjectStore(state => state.updateThreadMessage);
  const updateThreadStatus = useProjectStore(state => state.updateThreadStatus);
  const updateProjectFiles = useProjectStore(state => state.updateProjectFiles);

  const [serverProjects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // Load projects from server
  useEffect(() => {
    const loadProjects = async () => {
      setIsLoadingProjects(true);
      try {
        const response = await fetch(`${API_BASE}/api/projects`);
        if (response.ok) {
          const data = await response.json();
          setProjects(data.projects || []);
        }
      } catch (error) {
        console.error('Failed to load projects:', error);
      } finally {
        setIsLoadingProjects(false);
      }
    };
    loadProjects();
  }, []);

  // Create initial thread if none exists
  useEffect(() => {
    if (activeProject && !activeThread) {
      const thread = createThread(activeProject.id, 'Main Thread');
      setActiveThread(activeProject.id, thread.id);
    }
  }, [activeProject?.id, activeThread?.id, createThread, setActiveThread]);

  // Refresh projects
  const refreshProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    try {
      const response = await fetch(`${API_BASE}/api/projects`);
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error('Failed to refresh projects:', error);
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  // Add message to active thread
  const addMessage = useCallback((message: ThreadMessage) => {
    if (!activeProject || !activeThread) return;
    addThreadMessage(activeProject.id, activeThread.id, message);
  }, [activeProject, activeThread, addThreadMessage]);

  // Update message in active thread
  const updateMessage = useCallback((messageId: string, updates: Partial<ThreadMessage>) => {
    if (!activeProject || !activeThread) return;
    updateThreadMessage(activeProject.id, activeThread.id, messageId, updates);
  }, [activeProject, activeThread, updateThreadMessage]);

  // Create new thread
  const createNewThread = useCallback((name: string) => {
    if (!activeProject) return;
    const thread = createThread(activeProject.id, name);
    setActiveThread(activeProject.id, thread.id);
    return thread;
  }, [activeProject, createThread, setActiveThread]);

  // Switch to different thread
  const switchThread = useCallback((threadId: string) => {
    if (!activeProject) return;
    setActiveThread(activeProject.id, threadId);
  }, [activeProject, setActiveThread]);

  return {
    activeProject,
    activeThread,
    serverProjects,
    isLoadingProjects,
    createNewThread,
    switchThread,
    addMessage,
    updateMessage,
    updateThreadStatus,
    updateProjectFiles,
    refreshProjects
  };
}
