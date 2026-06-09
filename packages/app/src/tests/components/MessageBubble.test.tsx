/**
 * MessageBubble Component Tests
 * Comprehensive test coverage for MessageBubble component
 */

import { describe, it, expect,  beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageBubble } from '@/components/agent/MessageBubble';
import type { Message } from '@/types';

// Mock dependencies
jest.mock('react-markdown', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="markdown">{children}</div>,
}));

jest.mock('remark-gfm', () => ({
  default: () => (tree: any) => tree,
}));

jest.mock('rehype-highlight', () => ({
  default: () => (tree: any) => tree,
}));

jest.mock('@/components/agent/ExecutionDisplay', () => ({
  ExecutionDisplay: ({ steps }: { steps: unknown[] }) => (
    <div data-testid="execution-display">{steps.length} tool calls</div>
  ),
}));

jest.mock('@/utils/thinkTagParser', () => ({
  formatThinkLabel: (tb: { category?: string; context?: string }) => {
    if (tb.category) return `${tb.category.toUpperCase()} - ${tb.context || ''}`;
    return 'THINKING';
  },
}));

describe('MessageBubble Component', () => {
  const createMockMessage = (overrides: Partial<Message> = {}): Message => ({
    id: '1',
    role: 'user',
    content: 'Test message',
    timestamp: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock najest.ator.clipboard
    Object.assign(najest.ator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Rendering - User Messages', () => {
    it('should render user message with content', () => {
      const message = createMockMessage({ role: 'user', content: 'Hello' });
      render(<MessageBubble message={message} />);
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    it('should show streaming indicator when streaming', () => {
      const message = createMockMessage({ role: 'assistant', content: '' });
      render(<MessageBubble message={message} isStreaming={true} />);
      expect(screen.getByText('▊')).toBeInTheDocument();
    });

    it('should not show streaming indicator when not streaming', () => {
      const message = createMockMessage({ role: 'assistant', content: 'Test' });
      render(<MessageBubble message={message} isStreaming={false} />);
      expect(screen.queryByText('▊')).not.toBeInTheDocument();
    });

    it('should render empty user message', () => {
      const message = createMockMessage({ role: 'user', content: '' });
      render(<MessageBubble message={message} />);
      const bubble = screen.getByText('').parentElement;
      expect(bubble).toBeInTheDocument();
    });

    it('should apply user message styling', () => {
      const message = createMockMessage({ role: 'user', content: 'Test' });
      const { container } = render(<MessageBubble message={message} />);
      const contentDiv = screen.getByText('Test').closest('.px-4');
      expect(contentDiv).toHaveClass('px-4');
    });
  });

  describe('Rendering - Assistant Messages', () => {
    it('should render assistant message with bot icon', () => {
      const message = createMockMessage({ role: 'assistant', content: 'Response' });
      render(<MessageBubble message={message} />);
      expect(screen.getByText('ASSISTANT')).toBeInTheDocument();
    });

    it('should render assistant message with markdown content', () => {
      const message = createMockMessage({ role: 'assistant', content: '**Bold** text' });
      render(<MessageBubble message={message} />);
      expect(screen.getByTestId('markdown')).toBeInTheDocument();
      expect(screen.getByText('Bold')).toBeInTheDocument();
    });

    it('should not show bot icon for user messages', () => {
      const message = createMockMessage({ role: 'user', content: 'Test' });
      render(<MessageBubble message={message} />);
      expect(screen.queryByText('ASSISTANT')).not.toBeInTheDocument();
    });
  });

  describe('Copy Functionality', () => {
    it('should copy text to clipboard on copy button click', async () => {
      const message = createMockMessage({ role: 'user', content: 'Test message' });
      const onCopy = jest.fn();
      render(<MessageBubble message={message} onCopy={onCopy} />);

      // Hover to show copy button
      const contentDiv = screen.getByText('Test message').closest('.group');
      fireEvent.mouseEnter(contentDiv!);

      await waitFor(() => {
        const copyButton = screen.getByTitle('Copy');
        expect(copyButton).toBeVisible();
      });

      const copyButton = screen.getByTitle('Copy');
      await userEvent.click(copyButton);

      expect(najest.ator.clipboard.writeText).toHaveBeenCalledWith('Test message');
      expect(onCopy).toHaveBeenCalled();
    });

    it('should show checkmark after copying', async () => {
      const message = createMockMessage({ role: 'user', content: 'Test' });
      render(<MessageBubble message={message} />);

      const contentDiv = screen.getByText('Test').closest('.group');
      fireEvent.mouseEnter(contentDiv!);

      await waitFor(() => {
        const copyButton = screen.getByTitle('Copy');
        fireEvent.click(copyButton);
        expect(screen.getByTitle('Copy').querySelector('svg')).toBeInTheDocument();
      });
    });

    it('should reset copy state after 2 seconds', async () => {
      jest.useFakeTimers();
      const message = createMockMessage({ role: 'user', content: 'Test' });
      render(<MessageBubble message={message} />);

      const contentDiv = screen.getByText('Test').closest('.group');
      fireEvent.mouseEnter(contentDiv!);

      await waitFor(() => {
        const copyButton = screen.getByTitle('Copy');
        fireEvent.click(copyButton);
      });

      jest.advanceTimersByTime(2000);
      jest.useRealTimers();
    });
  });

  describe('Thinking Blocks', () => {
    it('should render thinking block when message has thinking content', () => {
      const message = createMockMessage({
        role: 'assistant',
        content: 'Response',
        thinking: 'Thinking process...',
      });
      render(<MessageBubble message={message} />);
      expect(screen.getByText(/thinking/i)).toBeInTheDocument();
    });

    it('should toggle thinking block jest.ibility on click', async () => {
      const message = createMockMessage({
        role: 'assistant',
        content: 'Response',
        thinking: 'Thinking process...',
      });
      render(<MessageBubble message={message} />);

      const toggleButton = screen.getByText(/thinking/i).closest('button');
      await userEvent.click(toggleButton!);

      await waitFor(() => {
        expect(screen.getByText('Thinking process...')).toBeVisible();
      });
    });

    it('should call onToggleThinking when thinking block is toggled', async () => {
      const onToggleThinking = jest.fn();
      const message = createMockMessage({
        role: 'assistant',
        content: 'Response',
        thinking: 'Thinking...',
      });
      render(<MessageBubble message={message} onToggleThinking={onToggleThinking} />);

      const toggleButton = screen.getByText(/thinking/i).closest('button');
      await userEvent.click(toggleButton!);

      expect(onToggleThinking).toHaveBeenCalled();
    });

    it('should render multiple thinking blocks', () => {
      const message = createMockMessage({
        role: 'assistant',
        content: 'Response',
        thinking: [
          { content: 'First thought', category: 'planning' },
          { content: 'Second thought', category: 'analysis' },
        ],
      });
      render(<MessageBubble message={message} />);
      expect(screen.getAllByText(/planning|analysis/i).length).toBeGreaterThan(0);
    });

    it('should not show thinking for user messages', () => {
      const message = createMockMessage({
        role: 'user',
        content: 'User message',
        thinking: 'Should not show',
      });
      render(<MessageBubble message={message} />);
      expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
    });
  });

  describe('Tool Calls / Execution Display', () => {
    it('should render execution display when tool calls exist', () => {
      const message = createMockMessage({
        role: 'assistant',
        content: 'Done',
        toolCalls: [
          {
            id: '1',
            action: 'click',
            detail: 'Click button',
            status: 'success',
            startedAt: Date.now(),
            completedAt: Date.now() + 100,
            observation: 'Button clicked',
          },
        ],
      });
      render(<MessageBubble message={message} />);
      expect(screen.getByTestId('execution-display')).toBeInTheDocument();
    });

    it('should not render execution display when no tool calls', () => {
      const message = createMockMessage({ role: 'assistant', content: 'Done' });
      render(<MessageBubble message={message} />);
      expect(screen.queryByTestId('execution-display')).not.toBeInTheDocument();
    });

    it('should handle empty tool calls array', () => {
      const message = createMockMessage({
        role: 'assistant',
        content: 'Done',
        toolCalls: [],
      });
      render(<MessageBubble message={message} />);
      expect(screen.queryByTestId('execution-display')).not.toBeInTheDocument();
    });
  });

  describe('Attachments', () => {
    it('should render file attachments', () => {
      const message = createMockMessage({
        role: 'user',
        content: 'Here is the file',
        attachments: [
          {
            id: '1',
            name: 'document.pdf',
            type: 'application/pdf',
            size: 1024,
          },
        ],
      });
      render(<MessageBubble message={message} />);
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
    });

    it('should show file size in correct format', () => {
      const message = createMockMessage({
        role: 'user',
        content: 'File',
        attachments: [
          {
            id: '1',
            name: 'file.txt',
            type: 'text/plain',
            size: 2048,
          },
        ],
      });
      render(<MessageBubble message={message} />);
      expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    });

    it('should render image attachment with correct icon', () => {
      const message = createMockMessage({
        role: 'user',
        content: 'Image',
        attachments: [
          {
            id: '1',
            name: 'photo.png',
            type: 'image/png',
            size: 1024,
          },
        ],
      });
      render(<MessageBubble message={message} />);
      expect(screen.getByText('photo.png')).toBeInTheDocument();
    });

    it('should render multiple attachments', () => {
      const message = createMockMessage({
        role: 'user',
        content: 'Files',
        attachments: [
          { id: '1', name: 'file1.txt', type: 'text/plain', size: 100 },
          { id: '2', name: 'file2.txt', type: 'text/plain', size: 200 },
        ],
      });
      render(<MessageBubble message={message} />);
      expect(screen.getByText('file1.txt')).toBeInTheDocument();
      expect(screen.getByText('file2.txt')).toBeInTheDocument();
    });

    it('should align attachments right for user messages', () => {
      const message = createMockMessage({
        role: 'user',
        content: 'File',
        attachments: [{ id: '1', name: 'file.txt', type: 'text/plain', size: 100 }],
      });
      const { container } = render(<MessageBubble message={message} />);
      const attachmentsContainer = screen.getByText('file.txt').closest('.flex');
      expect(attachmentsContainer).toHaveClass('justify-end');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null content gracefully', () => {
      const message = createMockMessage({ role: 'assistant', content: null as unknown as string });
      render(<MessageBubble message={message} />);
      // Should not crash
    });

    it('should handle very long content', () => {
      const longContent = 'a'.repeat(10000);
      const message = createMockMessage({ role: 'user', content: longContent });
      render(<MessageBubble message={message} />);
      expect(screen.getByText(longContent)).toBeInTheDocument();
    });

    it('should handle special characters in content', () => {
      const specialContent = '<script>alert("test")</script>';
      const message = createMockMessage({ role: 'user', content: specialContent });
      render(<MessageBubble message={message} />);
      expect(screen.getByText(specialContent)).toBeInTheDocument();
    });

    it('should handle multiline content', () => {
      const multiline = 'Line 1\nLine 2\nLine 3';
      const message = createMockMessage({ role: 'user', content: multiline });
      render(<MessageBubble message={message} />);
      expect(screen.getByText('Line 1')).toBeInTheDocument();
      expect(screen.getByText('Line 2')).toBeInTheDocument();
      expect(screen.getByText('Line 3')).toBeInTheDocument();
    });

    it('should handle empty attachments array', () => {
      const message = createMockMessage({
        role: 'user',
        content: 'No files',
        attachments: [],
      });
      render(<MessageBubble message={message} />);
      // Should not crash
    });
  });

  describe('Styling and CSS Classes', () => {
    it('should apply proper spacing classes', () => {
      const message = createMockMessage({ role: 'user', content: 'Test' });
      const { container } = render(<MessageBubble message={message} />);
      const messageContainer = container.querySelector('.px-3');
      expect(messageContainer).toBeInTheDocument();
    });

    it('should use correct font family for user messages', () => {
      const message = createMockMessage({ role: 'user', content: 'Test' });
      const { container } = render(<MessageBubble message={message} />);
      expect(container.firstChild).toHaveStyle({ fontFamily: 'var(--font-system)' });
    });

    it('should use correct font family for assistant messages', () => {
      const message = createMockMessage({ role: 'assistant', content: 'Test' });
      const { container } = render(<MessageBubble message={message} />);
      expect(container.firstChild).toHaveStyle({ fontFamily: 'var(--font-mono)' });
    });
  });

  describe('Interaction States', () => {
    it('should show copy button on hover', async () => {
      const message = createMockMessage({ role: 'user', content: 'Test' });
      render(<MessageBubble message={message} />);

      const contentDiv = screen.getByText('Test').closest('.group');
      fireEvent.mouseEnter(contentDiv!);

      await waitFor(() => {
        const copyButton = screen.getByTitle('Copy');
        const parent = copyButton.closest('.opacity-0');
        expect(parent).toHaveClass('group-hover:opacity-100');
      });
    });

    it('should hide copy button when not hovering', () => {
      const message = createMockMessage({ role: 'user', content: 'Test' });
      render(<MessageBubble message={message} />);

      const copyButton = screen.getByTitle('Copy');
      const parent = copyButton.closest('.opacity-0');
      expect(parent).toHaveClass('opacity-0');
    });
  });

  describe('Memoization', () => {
    it('should not re-render when props are unchanged', () => {
      const message = createMockMessage({ role: 'user', content: 'Test' });
      const { rerender } = render(<MessageBubble message={message} />);

      const initialRender = screen.getByText('Test').innerHTML;
      rerender(<MessageBubble message={message} />);
      const secondRender = screen.getByText('Test').innerHTML;

      expect(initialRender).toBe(secondRender);
    });
  });
});
