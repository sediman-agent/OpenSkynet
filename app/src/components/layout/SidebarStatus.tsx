import { Circle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/useAppStore';

export function SidebarStatus() {
  const agentStatus = useAppStore((state) => state.agentStatus);
  const isConnected = useAppStore((state) => state.isConnected);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <Circle
          className={cn(
            'h-2 w-2',
            isConnected
              ? 'fill-green-500 text-green-500'
              : 'fill-destructive text-destructive'
          )}
        />
        <span className="text-muted-foreground">
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <div className="flex items-center gap-2 text-sm">
        {agentStatus.state === 'running' ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <span className="text-muted-foreground">Running</span>
          </>
        ) : (
          <>
            <Circle
              className={cn(
                'h-2 w-2',
                agentStatus.state === 'idle'
                  ? 'fill-green-500 text-green-500'
                  : 'fill-destructive text-destructive'
              )}
            />
            <span className="text-muted-foreground capitalize">
              {agentStatus.state}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
