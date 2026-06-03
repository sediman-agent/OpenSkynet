import { useState } from 'react';
import { Play, Square, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shared/Card';
import { ScrollArea } from '@/components/shared/ScrollArea';
import { StatusBadge } from '@/components/shared/StatusBadge';
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

  return (
    <div className="flex flex-col h-screen bg-muted/40">
      {/* Header */}
      <PageHeader
        icon={Sparkles}
        title="Tasks"
        subtitle="Run one-shot browser automation"
        iconVariant="primary"
      />

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Task Input */}
        <div className="p-6 border-b border-border bg-background">
          <div className="flex gap-3 max-w-3xl mx-auto">
            <Input
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRunTask();
              }}
              placeholder="What should OpenSkynet do? (e.g., 'search for laptops on Amazon and find top 3')"
              disabled={!!activeTask}
              className="flex-1"
            />
            {activeTask ? (
              <Button
                variant="destructive"
                onClick={handleStopTask}
              >
                <Square className="w-4 h-4 mr-2" />
                Stop
              </Button>
            ) : (
              <Button
                onClick={handleRunTask}
                disabled={!taskInput.trim()}
              >
                <Play className="w-4 h-4 mr-2" />
                Run
              </Button>
            )}
          </div>
        </div>

        {/* Task List */}
        <ScrollArea className="flex-1">
          <div className="max-w-3xl mx-auto py-6 px-6 space-y-4">
            {tasks.length === 0 ? (
              <Card>
                <CardHeader className="text-center pb-4">
                  <CardTitle className="text-lg">No tasks yet</CardTitle>
                  <CardDescription className="text-base">
                    Create a task above to get started with OpenSkynet
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              tasks.map((task) => (
                <Card key={task.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base">{task.description}</CardTitle>
                        <CardDescription className="text-sm mt-0.5">
                          Created: {new Date(task.createdAt).toLocaleString()}
                        </CardDescription>
                      </div>
                      <StatusBadge status={task.status as any} showLabel />
                    </div>
                  </CardHeader>
                  {task.result && (
                    <CardContent>
                      <pre className="bg-muted text-foreground p-4 rounded-lg text-sm overflow-x-auto border border-border">
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
