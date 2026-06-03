import { useState } from 'react';
import { Play, Square, Plus } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shared/Card';
import { ScrollArea } from '@/components/shared/ScrollArea';
import { useTaskStore } from '@/stores/useTaskStore';
import { getChatService } from '@/services/chatService';

export function TasksPage() {
  const tasks = useTaskStore((state) => state.tasks);
  const activeTask = useTaskStore((state) => state.activeTask);
  const addTask = useTaskStore((state) => state.addTask);
  const updateTask = useTaskStore((state) => state.updateTask);
  const setActiveTask = useTaskStore((state) => state.setActiveTask);

  const [taskInput, setTaskInput] = useState('');

  const handleRunTask = async () => {
    if (!taskInput.trim()) return;

    const task = addTask({
      description: taskInput,
      status: 'running',
    });

    setActiveTask(task);
    setTaskInput('');

    try {
      const chatService = getChatService();
      let result = '';

      await chatService.runTask(task.description, {
        onChunk: (delta) => {
          result += delta;
          updateTask(task.id, { result });
        },
        onDone: () => {
          updateTask(task.id, {
            status: 'completed',
            completedAt: new Date(),
          });
        },
        onError: (error) => {
          updateTask(task.id, {
            status: 'failed',
            result: error,
          });
        },
      });
    } catch (error) {
      updateTask(task.id, {
        status: 'failed',
        result: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    setActiveTask(null);
  };

  const handleStopTask = () => {
    if (activeTask) {
      getChatService().stopCurrentTask();
      updateTask(activeTask.id, { status: 'failed' });
      setActiveTask(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'text-blue-500';
      case 'completed':
        return 'text-green-500';
      case 'failed':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 border-b border-border flex items-center px-4">
        <h2 className="text-lg font-semibold">Tasks</h2>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Task Input */}
        <div className="p-4 border-b border-border">
          <div className="flex gap-2">
            <Input
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRunTask();
              }}
              placeholder="Enter task description... (e.g., 'search for laptops on Amazon')"
              disabled={!!activeTask}
              className="flex-1"
            />
            {activeTask ? (
              <Button variant="destructive" onClick={handleStopTask}>
                <Square className="h-4 w-4 mr-2" />
                Stop
              </Button>
            ) : (
              <Button onClick={handleRunTask} disabled={!taskInput.trim()}>
                <Play className="h-4 w-4 mr-2" />
                Run
              </Button>
            )}
          </div>
        </div>

        {/* Task List */}
        <ScrollArea className="flex-1 p-4">
          <div className="max-w-3xl mx-auto space-y-4">
            {tasks.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>No tasks yet</CardTitle>
                  <CardDescription>
                    Create a task above to get started
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              tasks.map((task) => (
                <Card key={task.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-base">{task.description}</CardTitle>
                        <CardDescription>
                          Created: {new Date(task.createdAt).toLocaleString()}
                        </CardDescription>
                      </div>
                      <span className={cn('text-sm font-medium', getStatusColor(task.status))}>
                        {task.status.toUpperCase()}
                      </span>
                    </div>
                  </CardHeader>
                  {task.result && (
                    <CardContent>
                      <pre className="bg-secondary p-3 rounded text-sm overflow-x-auto">
                        {task.result}
                      </pre>
                    </CardContent>
                  )}
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
