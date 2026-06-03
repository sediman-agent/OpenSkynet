import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const statusBadgeVariants = cva(
  'inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border',
  {
    variants: {
      status: {
        idle: 'bg-muted text-muted-foreground border-border',
        pending: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-800',
        running: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800',
        completed: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800',
        failed: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800',
        error: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800',
        success: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800',
        warning: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-800',
        info: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-0.5 text-xs',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: {
      status: 'idle',
      size: 'md',
    },
  }
);

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  /**
   * Status of the badge
   */
  status?: 'idle' | 'pending' | 'running' | 'completed' | 'failed' | 'error' | 'success' | 'warning' | 'info';
  /**
   * Size of the badge
   */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Whether to show the status as text
   */
  showLabel?: boolean;
}

export function StatusBadge({
  status = 'idle',
  size = 'md',
  showLabel = false,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={cn(statusBadgeVariants({ status, size }), className)}
      {...props}
    >
      {showLabel ? status.toUpperCase() : children}
    </span>
  );
}

StatusBadge.displayName = 'StatusBadge';
