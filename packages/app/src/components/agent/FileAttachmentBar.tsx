/**
 * FileAttachmentBar Component
 * Display and manage file attachments
 */

import { X, FileText, Image, Upload } from 'lucide-react';
import { FileChip } from '@/components/ui/FileChip';
import { cn } from '@/lib/utils';
import type { AttachedFile } from '@/hooks/agent/useFileAttachments';

interface FileAttachmentBarProps {
  files: AttachedFile[];
  onRemove: (id: string) => void;
  isDragOver?: boolean;
}

export function FileAttachmentBar({ files, onRemove, isDragOver = false }: FileAttachmentBarProps) {
  if (files.length === 0 && !isDragOver) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap gap-2 px-4 py-2",
        isDragOver && "bg-primary/5"
      )}
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
        <div className="flex items-center gap-2 text-sm text-primary">
          <Upload className="w-4 h-4" />
          <span>Drop files to attach</span>
        </div>
      )}
    </div>
  );
}
