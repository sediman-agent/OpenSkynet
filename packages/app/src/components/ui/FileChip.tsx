/**
 * FileChip Component - Industrial Grade
 * Enhanced file attachment display with VS Code styling and proper theme support
 */

import { useState, useCallback } from 'react';
import { X, FileText, FileImage, FileType, File, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VS_CODES } from '@/styles/vscode-constants';

// ============================================================================
// Types
// ============================================================================
interface FileChipProps {
  id: string;
  name: string;
  size: number;
  type: string;
  status?: 'uploading' | 'done' | 'error';
  onRemove: (id: string) => void;
  className?: string;
}

// ============================================================================
// Main Component
// ============================================================================
export function FileChip({ id, name, size, type, status = 'done', onRemove, className }: FileChipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [removeHovered, setRemoveHovered] = useState(false);

  const getFileIcon = () => {
    const style = { fontSize: `${VS_CODES.iconSize}px`, color: 'var(--vscode-secondary-text)' };
    if (type.includes('pdf')) return <FileText size={VS_CODES.iconSize} style={style} />;
    if (type.includes('image')) return <FileImage size={VS_CODES.iconSize} style={style} />;
    if (type.includes('powerpoint') || type.includes('presentation') || type.includes('ppt')) {
      return <FileType size={VS_CODES.iconSize} style={style} />;
    }
    return <File size={VS_CODES.iconSize} style={style} />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getStatusIndicator = () => {
    switch (status) {
      case 'uploading':
        return (
          <div style={{ color: 'var(--vscode-info-foreground)' }}>
            <Loader2 size={VS_CODES.iconSize} className="animate-spin" />
          </div>
        );
      case 'error':
        return (
          <div style={{ color: 'var(--vscode-error-foreground)' }}>
            <X size={VS_CODES.iconSize} />
          </div>
        );
      default:
        return getFileIcon();
    }
  };

  return (
    <div
      className={cn('inline-flex items-center font-mono transition-all duration-150', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        gap: '8px',
        padding: `${VS_CODES.padding.y} ${VS_CODES.padding.x}`,
        borderRadius: VS_CODES.radiusLg,
        fontSize: `${VS_CODES.fontSize}px`,
        backgroundColor: isHovered ? 'var(--vscode-list-hoverBackground)' : 'var(--vscode-button-secondary-background)',
        border: `1px solid ${isHovered ? 'var(--vscode-focus-border)' : 'var(--vscode-border-color)'}`,
        color: 'var(--vscode-foreground)',
        transform: isHovered ? 'scale(1.01)' : 'scale(1)',
        cursor: 'default'
      }}
    >
      {/* Status Indicator */}
      <div className="flex items-center shrink-0">
        {getStatusIndicator()}
      </div>

      {/* File Name */}
      <span
        className="truncate font-medium"
        style={{
          maxWidth: '120px',
          color: status === 'error' ? 'var(--vscode-error-foreground)' : 'var(--vscode-foreground)'
        }}
      >
        {name}
      </span>

      {/* File Size */}
      <span
        className="truncate"
        style={{
          color: 'var(--vscode-secondary-text)',
          opacity: 0.8,
          fontSize: '11px'
        }}
      >
        ({formatFileSize(size)})
      </span>

      {/* Remove Button */}
      <button
        onClick={() => onRemove(id)}
        onMouseEnter={() => setRemoveHovered(true)}
        onMouseLeave={() => setRemoveHovered(false)}
        className="flex items-center justify-center shrink-0 rounded transition-all duration-150"
        style={{
          padding: '2px',
          backgroundColor: removeHovered ? 'var(--vscode-error-foreground)' : 'transparent',
          cursor: 'pointer',
          transform: removeHovered ? 'scale(1.1)' : 'scale(1)'
        }}
        title="Remove attachment"
      >
        <X
          size={12}
          style={{
            color: removeHovered ? '#ffffff' : 'var(--vscode-secondary-text)'
          }}
        />
      </button>
    </div>
  );
}
