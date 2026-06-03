import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /**
   * Enable auto-resize using CSS field-sizing
   * @default true
   */
  autoResize?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoResize = true, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[80px] max-h-[320px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-colors duration-200',
          autoResize && 'textarea-autoresize',
          !autoResize && 'resize-y',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
