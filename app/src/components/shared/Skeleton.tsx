import React from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Whether to animate the skeleton
   * @default true
   */
  animate?: boolean;
}

export function Skeleton({
  className,
  animate = true,
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-md bg-muted',
        animate && 'animate-pulse',
        className
      )}
      {...props}
    />
  );
}

Skeleton.displayName = 'Skeleton';

// Pre-defined skeleton components for common patterns

export function SkeletonText({
  lines = 3,
  className,
  ...props
}: Omit<SkeletonProps, 'children'> & { lines?: number }) {
  return (
    <div className={cn('space-y-2', className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4',
            i === lines - 1 && 'w-2/3' // Last line is shorter
          )}
        />
      ))}
    </div>
  );
}

SkeletonText.displayName = 'SkeletonText';

export function SkeletonAvatar({
  size = 'md',
  className,
  ...props
}: Omit<SkeletonProps, 'children'> & { size?: 'sm' | 'md' | 'lg' }) {
  const sizeStyles = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };

  return (
    <Skeleton
      className={cn(sizeStyles[size], 'rounded-full', className)}
      {...props}
    />
  );
}

SkeletonAvatar.displayName = 'SkeletonAvatar';

export function SkeletonCard({
  showAvatar = true,
  className,
  ...props
}: Omit<SkeletonProps, 'children'> & { showAvatar?: boolean }) {
  return (
    <div
      className={cn('p-4 rounded-lg border border-border space-y-3', className)}
      {...props}
    >
      <div className="flex items-start gap-3">
        {showAvatar && <SkeletonAvatar />}
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  );
}

SkeletonCard.displayName = 'SkeletonCard';
