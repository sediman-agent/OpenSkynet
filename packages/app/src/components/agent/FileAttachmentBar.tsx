/**
 * FileAttachmentBar Component - Industrial Grade
 * Enhanced file attachment display with VS Code styling and proper theme support
 */

import { Upload } from 'lucide-react';
import { FileChip } from '@/components/ui/FileChip';
import { cn } from '@/lib/utils';
import type { AttachedFile } from '@/hooks/agent/useFileAttachments';

// ============================================================================
// VS Code Design Tokens (using CSS variables for theme support)
// ============================================================================
const VS_CODES = {
  padding: { x: '16px', y: '8px' },
  spacing: '8px',
  transition: '150ms',
} as const;

// ============================================================================
// Types
// ============================================================================
interface FileAttachmentBarProps {
  files: AttachedFile[];
  onRemove: (id: string) => void;
  isDragOver?: boolean;
}

// ============================================================================
// Main Component
// ============================================================================
export function FileAttachmentBar({ files, onRemove, isDragOver = false }: FileAttachmentBarProps) {
  if (files.length === 0 && !isDragOver) return null;

  return (
    <div
      className={cn('flex flex-wrap items-center gap-2 transition-all duration-150')}
      style={{
        padding: `${VS_CODES.padding.y} ${VS_CODES.padding.x}`,
        backgroundColor: isDragOver ? 'rgba(0, 127, 212, 0.08)' : 'transparent',
        border: isDragOver ? `1px dashed var(--vscode-focus-border)` : 'none',
        borderRadius: isDragOver ? '4px' : '0',
        margin: '0'
      }}
    >
      {files.map(file => (
        <FileChip
          key={file.id}
          id={file.id}
          name={file.name}
          size={file.size}
          type={file.type}
          status={file.status}
          onRemove={() => onRemove(file.id)}
        />
      ))}

      {isDragOver && (
        <div
          className="flex items-center gap-2 font-mono"
          style={{
            color: 'var(--vscode-info-foreground)',
            fontSize: '13px',
            fontWeight: 500,
            padding: '4px 8px',
            borderRadius: '2px',
            backgroundColor: 'rgba(0, 127, 212, 0.1)'
          }}
        >
          <Upload size={14} className="animate-pulse" />
          <span>Drop files to attach</span>
        </div>
      )}
    </div>
  );
}
