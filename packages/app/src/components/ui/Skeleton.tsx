/**
 * VS Code-Style Skeleton Loaders
 * Professional loading states with shimmer effects
 */

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
  className,
  variant = 'rectangular',
  width,
  height,
  animation = 'pulse'
}: SkeletonProps) {
  const baseStyles = 'bg-gray-200 dark:bg-gray-700 transition-all duration-300';

  const variantStyles = {
    text: 'rounded h-4 w-full',
    circular: 'rounded-full',
    rectangular: 'rounded-sm',
    rounded: 'rounded-md'
  };

  const animationStyles = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer',
    none: ''
  };

  return (
    <div
      className={cn(
        baseStyles,
        variantStyles[variant],
        animationStyles[animation],
        className
      )}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

// ============================================================================
// Skeleton Components for Common Patterns
// ============================================================================

export function MessageSkeleton() {
  return (
    <div className="flex gap-3 p-4">
      {/* Avatar */}
      <Skeleton variant="circular" width={32} height={32} />

      {/* Content */}
      <div className="flex-1 space-y-2">
        <Skeleton variant="text" width="40%" height={16} />
        <Skeleton variant="text" width="100%" height={14} />
        <Skeleton variant="text" width="80%" height={14} />
      </div>
    </div>
  );
}

export function AgentInputSkeleton() {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 p-3 border rounded">
        <Skeleton variant="rectangular" width={24} height={24} />
        <Skeleton variant="text" width="60%" height={16} className="flex-1" />
        <Skeleton variant="rectangular" width={24} height={24} />
      </div>
    </div>
  );
}

export function SkillsListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 border rounded">
          <Skeleton variant="circular" width={40} height={40} />
          <div className="flex-1 space-y-2">
            <Skeleton variant="text" width="30%" height={16} />
            <Skeleton variant="text" width="60%" height={14} />
          </div>
          <Skeleton variant="rectangular" width={80} height={32} />
        </div>
      ))}
    </div>
  );
}

export function BrowserPanelSkeleton() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton variant="rectangular" width={100} height={24} />
          <Skeleton variant="rectangular" width={24} height={24} />
        </div>
        <Skeleton variant="text" width="100%" height={32} />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Skeleton variant="circular" width={48} height={48} className="mx-auto" />
          <Skeleton variant="text" width={200} height={16} className="mx-auto" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Loading State with Skeleton
// ============================================================================

interface LoadingStateProps {
  title?: string;
  description?: string;
  skeleton?: React.ReactNode;
}

export function LoadingState({
  title = 'Loading...',
  description = 'Please wait while we fetch your data',
  skeleton = <MessageSkeleton />
}: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] p-8 text-center">
      {/* Loading Indicator */}
      <div className="relative mb-4">
        <div className="w-12 h-12 border-2 border-current border-t-transparent rounded-full animate-spin"
             style={{ color: 'var(--vscode-info-foreground)' }} />
      </div>

      {/* Text */}
      <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--vscode-foreground)' }}>
        {title}
      </h3>
      <p className="text-xs" style={{ color: 'var(--vscode-secondary-text)' }}>
        {description}
      </p>

      {/* Optional Skeleton */}
      {skeleton && (
        <div className="mt-8 w-full max-w-md">
          {skeleton}
        </div>
      )}
    </div>
  );
}
