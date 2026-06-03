import React, { forwardRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ToggleSwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'value'> {
  /**
   * Whether the toggle is checked
   */
  checked?: boolean;
  /**
   * Default checked state (uncontrolled)
   */
  defaultChecked?: boolean;
  /**
   * Label text for the toggle
   */
  label?: string;
  /**
   * Description text for the toggle
   */
  description?: string;
  /**
   * Size of the toggle
   * @default 'md'
   */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Callback when toggle state changes
   */
  onCheckedChange?: (checked: boolean) => void;
}

const sizeStyles = {
  sm: 'w-8 h-5',
  md: 'w-11 h-6',
  lg: 'w-14 h-8',
};

const thumbSizeStyles = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

const thumbTranslateStyles = {
  sm: 'translate-x-3',
  md: 'translate-x-5',
  lg: 'translate-x-6',
};

export const ToggleSwitch = forwardRef<HTMLButtonElement, ToggleSwitchProps>(
  (
    {
      checked,
      defaultChecked = false,
      label,
      description,
      size = 'md',
      onCheckedChange,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const [internalChecked, setInternalChecked] = useState(defaultChecked);

    const isControlled = checked !== undefined;
    const isChecked = isControlled ? checked : internalChecked;

    const handleToggle = () => {
      if (disabled) return;
      const newChecked = !isChecked;
      if (!isControlled) {
        setInternalChecked(newChecked);
      }
      onCheckedChange?.(newChecked);
    };

    return (
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <button
            ref={ref}
            type="button"
            role="switch"
            aria-checked={isChecked}
            disabled={disabled}
            onClick={handleToggle}
            className={cn(
              'relative inline-flex flex-shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              sizeStyles[size],
              isChecked
                ? 'bg-primary'
                : 'bg-input hover:bg-muted-foreground/20',
              disabled && 'opacity-50 cursor-not-allowed',
              className
            )}
            {...props}
          >
            <span
              className={cn(
                'pointer-events-none inline-block rounded-full bg-white shadow-sm transition-transform duration-200',
                thumbSizeStyles[size],
                isChecked ? thumbTranslateStyles[size] : 'translate-x-0'
              )}
            />
          </button>
          {(label || description) && (
            <div>
              {label && (
                <label className="text-sm font-medium text-foreground">
                  {label}
                </label>
              )}
              {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
);

ToggleSwitch.displayName = 'ToggleSwitch';
