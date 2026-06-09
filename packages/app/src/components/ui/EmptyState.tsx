/**
 * VS Code-Style Empty States
 * Professional empty states with clear CTAs
 */

import { ReactNode } from 'react';
import { Package, MessageSquare, Search, FolderOpen, Sparkles, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  };
  className?: string;
}

// ============================================================================
// Empty State Component
// ============================================================================

export function EmptyState({
  icon,
  title,
  description,
  action,
  className
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-8',
        'min-h-[300px] max-w-md mx-auto',
        className
      )}
    >
      {/* Icon */}
      {icon && (
        <div
          className="mb-4 p-4 rounded-full"
          style={{
            backgroundColor: 'var(--vscode-input-background)',
            color: 'var(--vscode-secondary-text)'
          }}
        >
          {icon}
        </div>
      )}

      {/* Title */}
      <h3
        className="text-sm font-semibold mb-2"
        style={{ color: 'var(--vscode-foreground)' }}
      >
        {title}
      </h3>

      {/* Description */}
      <p
        className="text-xs mb-6 max-w-xs mx-auto"
        style={{ color: 'var(--vscode-secondary-text)', lineHeight: 1.5 }}
      >
        {description}
      </p>

      {/* Action Button */}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 text-xs font-medium rounded transition-all duration-150"
          style={{
            backgroundColor: action.variant === 'primary'
              ? 'var(--vscode-button-primary-background)'
              : 'var(--vscode-button-secondary-background)',
            color: action.variant === 'primary'
              ? 'var(--vscode-button-primary-foreground)'
              : 'var(--vscode-button-secondary-foreground)',
            border: '1px solid transparent'
          }}
          onMouseEnter={(e) => {
            if (action.variant === 'primary') {
              e.currentTarget.style.backgroundColor = 'var(--vscode-button-primary-hover-background)';
            } else {
              e.currentTarget.style.backgroundColor = 'var(--vscode-button-secondary-hoverBackground)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = action.variant === 'primary'
              ? 'var(--vscode-button-primary-background)'
              : 'var(--vscode-button-secondary-background)';
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Pre-configured Empty States
// ============================================================================

export function NoConversationsEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      icon={<MessageSquare size={32} />}
      title="No conversations yet"
      description="Start a new conversation to begin chatting with the agent"
      action={{ label: 'Start Conversation', onClick: onCreate, variant: 'primary' }}
    />
  );
}

export function NoSkillsEmptyState({ onRecord }: { onRecord: () => void }) {
  return (
    <EmptyState
      icon={<Package size={32} />}
      title="No skills available"
      description="Record a new skill or install skills from the hub to enhance agent capabilities"
      action={{ label: 'Start Recording', onClick: onRecord, variant: 'primary' }}
    />
  );
}

export function NoMessagesEmptyState() {
  return (
    <EmptyState
      icon={<Sparkles size={32} />}
      title="Start a conversation"
      description="Type a message below or use a slash command for quick actions"
    />
  );
}

export function NoSearchResultsEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <EmptyState
      icon={<Search size={32} />}
      title="No results found"
      description="Try adjusting your search terms or filters"
      action={{ label: 'Clear Search', onClick: onClear, variant: 'secondary' }}
    />
  );
}

export function NoProjectsEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      icon={<FolderOpen size={32} />}
      title="No projects yet"
      description="Create a new project to organize your work"
      action={{ label: 'Create Project', onClick: onCreate, variant: 'primary' }}
    />
  );
}

export function NoModelsConfiguredEmptyState({ onConfigure }: { onConfigure: () => void }) {
  return (
    <EmptyState
      icon={<Zap size={32} />}
      title="No models configured"
      description="Add a model provider to start using the agent"
      action={{ label: 'Configure Models', onClick: onConfigure, variant: 'primary' }}
    />
  );
}

// ============================================================================
// Empty State with Illustration
// ============================================================================

interface EmptyStateWithIllustrationProps {
  illustration?: ReactNode;
  title: string;
  description: string;
  hints?: string[];
}

export function EmptyStateWithIllustration({
  illustration,
  title,
  description,
  hints
}: EmptyStateWithIllustrationProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 min-h-[400px] max-w-lg mx-auto">
      {/* Illustration */}
      {illustration || (
        <div
          className="mb-6 p-6 rounded-full opacity-50"
          style={{ backgroundColor: 'var(--vscode-input-background)' }}
        >
          <Package size={48} style={{ color: 'var(--vscode-secondary-text)' }} />
        </div>
      )}

      {/* Title */}
      <h3
        className="text-base font-semibold mb-2"
        style={{ color: 'var(--vscode-foreground)' }}
      >
        {title}
      </h3>

      {/* Description */}
      <p
        className="text-sm mb-6"
        style={{ color: 'var(--vscode-secondary-text)', lineHeight: 1.6 }}
      >
        {description}
      </p>

      {/* Hints */}
      {hints && hints.length > 0 && (
        <div className="flex flex-col gap-2 max-w-xs mx-auto">
          {hints.map((hint, index) => (
            <div
              key={index}
              className="text-xs p-3 border-l-2 text-left"
              style={{
                borderColor: 'var(--vscode-border-color)',
                backgroundColor: 'var(--vscode-input-background)',
                color: 'var(--vscode-secondary-text)'
              }}
            >
              {hint}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
