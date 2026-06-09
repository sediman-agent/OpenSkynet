/**
 * FileAttachmentBar Component Tests
 * Comprehensive test coverage for FileAttachmentBar component
 */

import { describe, it, expect,  beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileAttachmentBar } from '@/components/agent/FileAttachmentBar';
import type { AttachedFile } from '@/hooks/agent/useFileAttachments';

// Mock FileChip component
jest.mock('@/components/ui/FileChip', () => ({
  FileChip: ({ id, name, onRemove }: { id: string; name: string; onRemove: () => void }) => (
    <div data-testid={`file-chip-${id}`}>
      <span>{name}</span>
      <button onClick={onRemove} data-testid={`remove-${id}`}>
        Remove
      </button>
    </div>
  ),
}));

describe('FileAttachmentBar Component', () => {
  const createMockFile = (overrides: Partial<AttachedFile> = {}): AttachedFile => ({
    id: '1',
    name: 'test.txt',
    size: 1024,
    type: 'text/plain',
    status: 'done',
    ...overrides,
  });

  const onRemove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering - Empty State', () => {
    it('should not render when files array is empty and not dragging', () => {
      const { container } = render(
        <FileAttachmentBar files={[]} onRemove={onRemove} isDragOver={false} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('should render when files array is empty but dragging', () => {
      render(<FileAttachmentBar files={[]} onRemove={onRemove} isDragOver={true} />);
      expect(screen.getByText('Drop files to attach')).toBeInTheDocument();
    });
  });

  describe('Rendering - With Files', () => {
    it('should render file chips for each file', () => {
      const files = [
        createMockFile({ id: '1', name: 'file1.txt' }),
        createMockFile({ id: '2', name: 'file2.txt' }),
      ];
      render(<FileAttachmentBar files={files} onRemove={onRemove} />);

      expect(screen.getByTestId('file-chip-1')).toBeInTheDocument();
      expect(screen.getByTestId('file-chip-2')).toBeInTheDocument();
    });

    it('should render single file', () => {
      const files = [createMockFile({ name: 'single.txt' })];
      render(<FileAttachmentBar files={files} onRemove={onRemove} />);

      expect(screen.getByText('single.txt')).toBeInTheDocument();
    });

    it('should render multiple files', () => {
      const files = [
        createMockFile({ id: '1', name: 'a.txt' }),
        createMockFile({ id: '2', name: 'b.txt' }),
        createMockFile({ id: '3', name: 'c.txt' }),
      ];
      render(<FileAttachmentBar files={files} onRemove={onRemove} />);

      expect(screen.getByTestId('file-chip-1')).toBeInTheDocument();
      expect(screen.getByTestId('file-chip-2')).toBeInTheDocument();
      expect(screen.getByTestId('file-chip-3')).toBeInTheDocument();
    });
  });

  describe('File Removal', () => {
    it('should call onRemove when file remove button is clicked', async () => {
      const user = userEvent.setup();
      const files = [createMockFile({ id: '1', name: 'test.txt' })];
      render(<FileAttachmentBar files={files} onRemove={onRemove} />);

      const removeButton = screen.getByTestId('remove-1');
      await user.click(removeButton);

      expect(onRemove).toHaveBeenCalledWith('1');
    });

    it('should call onRemove with correct id for multiple files', async () => {
      const user = userEvent.setup();
      const files = [
        createMockFile({ id: 'abc', name: 'a.txt' }),
        createMockFile({ id: 'xyz', name: 'b.txt' }),
      ];
      render(<FileAttachmentBar files={files} onRemove={onRemove} />);

      await user.click(screen.getByTestId('remove-abc'));
      expect(onRemove).toHaveBeenCalledWith('abc');

      await user.click(screen.getByTestId('remove-xyz'));
      expect(onRemove).toHaveBeenCalledWith('xyz');
    });
  });

  describe('Drag Over State', () => {
    it('should show drag over styling when isDragOver is true', () => {
      const files = [createMockFile()];
      const { container } = render(
        <FileAttachmentBar files={files} onRemove={onRemove} isDragOver={true} />
      );

      const bar = container.firstChild as HTMLElement;
      expect(bar.style.backgroundColor).toBe('rgba(0, 127, 212, 0.08)');
      expect(bar.style.border).toContain('dashed');
    });

    it('should not show drag over styling when isDragOver is false', () => {
      const files = [createMockFile()];
      const { container } = render(
        <FileAttachmentBar files={files} onRemove={onRemove} isDragOver={false} />
      );

      const bar = container.firstChild as HTMLElement;
      expect(bar.style.backgroundColor).toBe('transparent');
      expect(bar.style.border).toBe('none');
    });

    it('should show drop message when dragging', () => {
      render(<FileAttachmentBar files={[]} onRemove={onRemove} isDragOver={true} />);
      expect(screen.getByText('Drop files to attach')).toBeInTheDocument();
      expect(screen.getByText('Drop files to attach')).toBeInTheDocument();
    });

    it('should show Upload icon when dragging', () => {
      render(<FileAttachmentBar files={[]} onRemove={onRemove} isDragOver={true} />);
      const uploadIcon = screen.getByText('Drop files to attach').prejest.usElementSibling;
      expect(uploadIcon).toBeInTheDocument();
    });

    it('should not show drop message when not dragging', () => {
      const files = [createMockFile()];
      render(<FileAttachmentBar files={files} onRemove={onRemove} isDragOver={false} />);
      expect(screen.queryByText('Drop files to attach')).not.toBeInTheDocument();
    });
  });

  describe('File Chip Props', () => {
    it('should pass all file properties to FileChip', () => {
      const files = [
        createMockFile({
          id: '123',
          name: 'document.pdf',
          size: 2048,
          type: 'application/pdf',
          status: 'uploading',
        }),
      ];
      render(<FileAttachmentBar files={files} onRemove={onRemove} />);

      expect(screen.getByTestId('file-chip-123')).toBeInTheDocument();
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
    });
  });

  describe('Styling and Layout', () => {
    it('should apply flex layout', () => {
      const files = [createMockFile()];
      const { container } = render(
        <FileAttachmentBar files={files} onRemove={onRemove} />
      );

      const bar = container.firstChild as HTMLElement;
      expect(bar.className).toContain('flex');
    });

    it('should apply flex-wrap for multiple files', () => {
      const files = [
        createMockFile({ id: '1', name: 'a.txt' }),
        createMockFile({ id: '2', name: 'b.txt' }),
      ];
      const { container } = render(
        <FileAttachmentBar files={files} onRemove={onRemove} />
      );

      const bar = container.firstChild as HTMLElement;
      expect(bar.className).toContain('flex-wrap');
    });

    it('should apply proper padding', () => {
      const files = [createMockFile()];
      const { container } = render(
        <FileAttachmentBar files={files} onRemove={onRemove} />
      );

      const bar = container.firstChild as HTMLElement;
      expect(bar.style.padding).toBe('8px 16px');
    });
  });

  describe('Edge Cases', () => {
    it('should handle files with special characters in name', () => {
      const files = [createMockFile({ name: 'file (1) [test].txt' })];
      render(<FileAttachmentBar files={files} onRemove={onRemove} />);
      expect(screen.getByText('file (1) [test].txt')).toBeInTheDocument();
    });

    it('should handle files with very long names', () => {
      const longName = 'a'.repeat(200) + '.txt';
      const files = [createMockFile({ name: longName })];
      render(<FileAttachmentBar files={files} onRemove={onRemove} />);
      expect(screen.getByText(longName)).toBeInTheDocument();
    });

    it('should handle files with zero size', () => {
      const files = [createMockFile({ size: 0 })];
      expect(() => {
        render(<FileAttachmentBar files={files} onRemove={onRemove} />);
      }).not.toThrow();
    });

    it('should handle files with very large size', () => {
      const files = [createMockFile({ size: Number.MAX_SAFE_INTEGER })];
      expect(() => {
        render(<FileAttachmentBar files={files} onRemove={onRemove} />);
      }).not.toThrow();
    });
  });

  describe('Different File Statuses', () => {
    it('should render file with uploading status', () => {
      const files = [createMockFile({ status: 'uploading' })];
      render(<FileAttachmentBar files={files} onRemove={onRemove} />);
      expect(screen.getByTestId('file-chip-1')).toBeInTheDocument();
    });

    it('should render file with error status', () => {
      const files = [createMockFile({ status: 'error' })];
      render(<FileAttachmentBar files={files} onRemove={onRemove} />);
      expect(screen.getByTestId('file-chip-1')).toBeInTheDocument();
    });

    it('should render file with done status', () => {
      const files = [createMockFile({ status: 'done' })];
      render(<FileAttachmentBar files={files} onRemove={onRemove} />);
      expect(screen.getByTestId('file-chip-1')).toBeInTheDocument();
    });
  });

  describe('Transitions', () => {
    it('should apply transition classes', () => {
      const files = [createMockFile()];
      const { container } = render(
        <FileAttachmentBar files={files} onRemove={onRemove} />
      );

      const bar = container.firstChild as HTMLElement;
      expect(bar.className).toContain('transition-all');
    });
  });
});
