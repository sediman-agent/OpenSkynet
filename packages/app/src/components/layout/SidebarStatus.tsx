/**
 * VS Code-Style Sidebar Status
 * Connection and agent status display
 */

import { Circle, Loader2 } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';

export function SidebarStatus() {
  const agentStatus = useAppStore((state) => state.agentStatus);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Circle
          size={8}
          className="shrink-0"
          style={{
            fill: agentStatus.rpcConnected
              ? 'var(--vscode-success-foreground)'
              : 'var(--vscode-error-foreground)',
            color: agentStatus.rpcConnected
              ? 'var(--vscode-success-foreground)'
              : 'var(--vscode-error-foreground)'
          }}
          aria-hidden="true"
        />
        <span
          className="text-xs font-medium"
          style={{
            color: agentStatus.rpcConnected
              ? 'var(--vscode-sideBar-foreground)'
              : 'var(--vscode-error-foreground)'
          }}
        >
          {agentStatus.rpcConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {agentStatus.state === 'running' ? (
          <>
            <Loader2 size={14} className="animate-spin shrink-0" style={{ color: 'var(--vscode-sideBar-foreground)' }} aria-hidden="true" />
            <span className="text-xs font-medium" style={{ color: 'var(--vscode-sideBar-foreground)' }}>
              Running
            </span>
          </>
        ) : (
          <>
            <Circle
              size={8}
              className="shrink-0"
              style={{
                fill: agentStatus.state === 'idle'
                  ? 'var(--vscode-success-foreground)'
                  : 'var(--vscode-error-foreground)',
                color: agentStatus.state === 'idle'
                  ? 'var(--vscode-success-foreground)'
                  : 'var(--vscode-error-foreground)'
              }}
              aria-hidden="true"
            />
            <span
              className="text-xs font-medium capitalize"
              style={{
                color: agentStatus.state === 'idle'
                  ? 'var(--vscode-sideBar-foreground)'
                  : 'var(--vscode-error-foreground)'
              }}
            >
              {agentStatus.state}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export default SidebarStatus;
