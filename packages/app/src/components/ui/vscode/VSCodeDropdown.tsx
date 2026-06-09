/**
 * VS Code Dropdown Component
 * Official VS Code Webview UI Toolkit dropdown styles
 * Proper VS Code dropdown with list behavior
 */

import { useState, useRef, useEffect, useCallback, ReactNode, ReactElement } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { VSCodeList, VSCodeListItem } from './VSCodeList';

// ============================================================================
// VS Code Dropdown Styles
// ============================================================================

const dropdownTriggerStyles = "inline-flex items-center justify-between gap-2 px-3 py-1 font-mono text-sm bg-[var(--vscode-dropdown-background)] text-[var(--vscode-dropdown-foreground)] border border-[var(--vscode-dropdown-border)] rounded cursor-pointer select-none transition-colors duration-150";
const dropdownTriggerHoverStyles = "hover:border-[var(--vscode-focusBorder)] hover:shadow-[0_0_0_1px_var(--vscode-focusBorder)]";
const dropdownIconStyles = "transition-transform duration-150";

// ============================================================================
// Dropdown Option Type
// ============================================================================

export interface VSCodeDropdownOption {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

// ============================================================================
// Dropdown Component
// ============================================================================

interface VSCodeDropdownProps {
  options: VSCodeDropdownOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function VSCodeDropdown({
  options,
  value,
  onChange,
  placeholder = "Select...",
  disabled = false,
  className,
  style
}: VSCodeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(value);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === selectedValue);

  const handleToggle = useCallback(() => {
    if (!disabled) {
      setIsOpen(prev => !prev);
    }
  }, [disabled]);

  const handleSelect = useCallback((optionValue: string) => {
    setSelectedValue(optionValue);
    onChange?.(optionValue);
    setIsOpen(false);
  }, [onChange]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !triggerRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Update selected value when value prop changes
  useEffect(() => {
    if (value !== undefined) {
      setSelectedValue(value);
    }
  }, [value]);

  return (
    <div className="relative" style={style}>
      {/* Dropdown Trigger */}
      <div
        ref={triggerRef}
        className={cn(
          dropdownTriggerStyles,
          dropdownTriggerHoverStyles,
          disabled && "opacity-40 cursor-not-allowed",
          className
        )}
        onClick={handleToggle}
        style={{
          height: 'var(--vscode-input-height)',
          minHeight: '26px',
          fontSize: 'var(--vscode-font-size-base)',
        }}
      >
        <span className="flex-1 truncate">
          {selectedOption ? (
            <div className="flex items-center gap-2">
              {selectedOption.icon && <span className="flex-shrink-0">{selectedOption.icon}</span>}
              <span>{selectedOption.label}</span>
            </div>
          ) : (
            <span style={{ color: 'var(--vscode-secondary-foreground)' }}>{placeholder}</span>
          )}
        </span>
        <ChevronDown
          size={14}
          className={cn(dropdownIconStyles, isOpen && "rotate-180")}
          style={{ color: 'var(--vscode-secondary-foreground)' }}
        />
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1"
          style={{ minWidth: triggerRef.current?.offsetWidth }}
        >
          <VSCodeList>
            {options.map(option => (
              <VSCodeListItem
                key={option.value}
                selected={selectedValue === option.value}
                icon={option.icon}
                onClick={() => !option.disabled && handleSelect(option.value)}
                style={{
                  opacity: option.disabled ? 'var(--vscode-disabled-opacity)' : undefined,
                  cursor: option.disabled ? 'not-allowed' : 'pointer',
                }}
              >
                {option.label}
              </VSCodeListItem>
            ))}
          </VSCodeList>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export default VSCodeDropdown;
