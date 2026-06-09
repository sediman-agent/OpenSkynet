/**
 * AgentInput Component Tests
 * Comprehensive test coverage for AgentInput component
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentInput } from '@/components/agent/AgentInput';

// Mock SuggestionChip component
jest.mock('@/components/ui/SuggestionChip', () => ({
  SuggestionChip: ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button onClick={onClick} data-testid={`suggestion-${label}`}>
      {label}
    </button>
  ),
}));

// Mock slash commands type
const mockSlashCommands = [
  { id: '1', label: 'New Task', description: 'Create a new task' },
  { id: '2', label: 'Help', description: 'Get help' },
] as const;

describe('AgentInput Component', () => {
  const defaultProps = {
    value: '',
    onChange: jest.fn(),
    onSend: jest.fn(),
    onStop: jest.fn(),
    onToggleFileUpload: jest.fn(),
    onSelectSlashCommand: jest.fn(),
    onKeyDown: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should render without crashing', () => {
      render(<AgentInput {...defaultProps} />);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('should render with placeholder text', () => {
      render(<AgentInput {...defaultProps} placeholder="Ask anything..." />);
      const textarea = screen.getByPlaceholderText('Ask anything...');
      expect(textarea).toBeInTheDocument();
    });

    it('should render with initial value', () => {
      render(<AgentInput {...defaultProps} value="Hello" onChange={jest.fn()} />);
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(textarea.value).toBe('Hello');
    });

    it('should render file upload button', () => {
      render(<AgentInput {...defaultProps} />);
      const fileButton = screen.getByTitle('Attach file');
      expect(fileButton).toBeInTheDocument();
    });

    it('should render send button with sparkles icon when empty', () => {
      render(<AgentInput {...defaultProps} value="" />);
      const sendButton = screen.getByTitle('Type a message to send');
      expect(sendButton).toBeInTheDocument();
    });

    it('should render send button with send icon when has content', () => {
      render(<AgentInput {...defaultProps} value="test" />);
      const sendButton = screen.getByTitle('Send message');
      expect(sendButton).toBeInTheDocument();
    });

    it('should render stop button when sending', () => {
      render(<AgentInput {...defaultProps} isSending={true} />);
      const stopButton = screen.getByTitle('Stop generation');
      expect(stopButton).toBeInTheDocument();
    });
  });

  describe('User Input', () => {
    it('should call onChange when user types', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      render(<AgentInput {...defaultProps} onChange={onChange} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Hello');

      expect(onChange).toHaveBeenCalledWith('Hello');
    });

    it('should update textarea value when onChange is called', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      const { rerender } = render(<AgentInput {...defaultProps} value="" onChange={onChange} />);

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(textarea.value).toBe('');

      onChange('test');
      rerender(<AgentInput {...defaultProps} value="test" onChange={onChange} />);
      expect(textarea.value).toBe('test');
    });

    it('should handle empty input', async () => {
      const user = userEvent.setup();
      render(<AgentInput {...defaultProps} value="test" onChange={jest.fn()} />);

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      await user.clear(textarea);
      expect(textarea.value).toBe('');
    });

    it('should handle long text input', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      const longText = 'a'.repeat(1500);
      render(<AgentInput {...defaultProps} onChange={onChange} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, longText);

      expect(onChange).toHaveBeenCalled();
    });
  });

  describe('Send Button Behajest.r', () => {
    it('should disable send button when input is empty', () => {
      render(<AgentInput {...defaultProps} value="" />);
      const sendButton = screen.getByTitle('Type a message to send');
      expect(sendButton).toBeDisabled();
    });

    it('should enable send button when input has content', () => {
      render(<AgentInput {...defaultProps} value="test" />);
      const sendButton = screen.getByTitle('Send message');
      expect(sendButton).not.toBeDisabled();
    });

    it('should call onSend when send button is clicked', async () => {
      const user = userEvent.setup();
      const onSend = jest.fn();
      render(<AgentInput {...defaultProps} value="test" onSend={onSend} />);

      const sendButton = screen.getByTitle('Send message');
      await user.click(sendButton);

      expect(onSend).toHaveBeenCalledTimes(1);
    });

    it('should call onStop when stop button is clicked', async () => {
      const user = userEvent.setup();
      const onStop = jest.fn();
      render(<AgentInput {...defaultProps} isSending={true} onStop={onStop} />);

      const stopButton = screen.getByTitle('Stop generation');
      await user.click(stopButton);

      expect(onStop).toHaveBeenCalledTimes(1);
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should call onSend when Ctrl+Enter is pressed', async () => {
      const user = userEvent.setup();
      const onSend = jest.fn();
      render(<AgentInput {...defaultProps} value="test" onSend={onSend} />);

      const textarea = screen.getByRole('textbox');
      await user.click(textarea);
      await user.keyboard('{Control>}+{Enter}');

      expect(onSend).toHaveBeenCalledTimes(1);
    });

    it('should call onSend when Cmd+Enter is pressed', async () => {
      const user = userEvent.setup();
      const onSend = jest.fn();
      render(<AgentInput {...defaultProps} value="test" onSend={onSend} />);

      const textarea = screen.getByRole('textbox');
      await user.click(textarea);
      await user.keyboard('{Meta>}+{Enter}');

      expect(onSend).toHaveBeenCalledTimes(1);
    });

    it('should not call onSend when Enter alone is pressed', async () => {
      const user = userEvent.setup();
      const onSend = jest.fn();
      render(<AgentInput {...defaultProps} value="test" onSend={onSend} />);

      const textarea = screen.getByRole('textbox');
      await user.click(textarea);
      await user.keyboard('{Enter}');

      expect(onSend).not.toHaveBeenCalled();
    });

    it('should not call onSend when input is empty and shortcut is pressed', async () => {
      const user = userEvent.setup();
      const onSend = jest.fn();
      render(<AgentInput {...defaultProps} value="" onSend={onSend} />);

      const textarea = screen.getByRole('textbox');
      await user.click(textarea);
      await user.keyboard('{Control>}+{Enter}');

      expect(onSend).not.toHaveBeenCalled();
    });

    it('should call custom onKeyDown handler', async () => {
      const user = userEvent.setup();
      const onKeyDown = jest.fn();
      render(<AgentInput {...defaultProps} onKeyDown={onKeyDown} />);

      const textarea = screen.getByRole('textbox');
      await user.click(textarea);
      await user.keyboard('a');

      expect(onKeyDown).toHaveBeenCalled();
    });
  });

  describe('Focus States', () => {
    it('should apply focus border class when focused', async () => {
      const user = userEvent.setup();
      render(<AgentInput {...defaultProps} />);

      const container = screen.getByRole('textbox').closest('.border') || screen.getByRole('textbox').parentElement?.parentElement;

      if (container) {
        expect(container).not.toHaveClass('border-[var(--vscode-focus-border)]');

        const textarea = screen.getByRole('textbox');
        await user.click(textarea);

        expect(container).toHaveClass('border-[var(--vscode-focus-border)]');
      }
    });

    it('should remove focus border class when blurred', async () => {
      const user = userEvent.setup();
      render(<AgentInput {...defaultProps} />);

      const textarea = screen.getByRole('textbox');
      await user.click(textarea);

      const container = textarea.closest('.border') || textarea.parentElement?.parentElement;
      if (container) {
        expect(container).toHaveClass('border-[var(--vscode-focus-border)]');

        await user.tab();
        expect(container).not.toHaveClass('border-[var(--vscode-focus-border)]');
      }
    });
  });

  describe('File Upload Button', () => {
    it('should show paperclip icon when not uploading', () => {
      render(<AgentInput {...defaultProps} showFileUpload={false} />);
      const button = screen.getByTitle('Attach file');
      expect(button).toBeInTheDocument();
    });

    it('should show upload icon when uploading', () => {
      render(<AgentInput {...defaultProps} showFileUpload={true} />);
      const button = screen.getByTitle('Close file upload');
      expect(button).toBeInTheDocument();
    });

    it('should call onToggleFileUpload when clicked', async () => {
      const user = userEvent.setup();
      const onToggleFileUpload = jest.fn();
      render(<AgentInput {...defaultProps} onToggleFileUpload={onToggleFileUpload} />);

      const button = screen.getByTitle('Attach file');
      await user.click(button);

      expect(onToggleFileUpload).toHaveBeenCalledTimes(1);
    });

    it('should be disabled when disabled prop is true', () => {
      render(<AgentInput {...defaultProps} disabled={true} />);
      const button = screen.getByTitle('Attach file');
      expect(button).toBeDisabled();
    });
  });

  describe('Error States', () => {
    it('should show error indicator when sendError is true', () => {
      render(<AgentInput {...defaultProps} sendError={true} />);
      expect(screen.getByText('Failed to send')).toBeInTheDocument();
    });

    it('should not show error indicator when sendError is false', () => {
      render(<AgentInput {...defaultProps} sendError={false} />);
      expect(screen.queryByText('Failed to send')).not.toBeInTheDocument();
    });

    it('should apply error border class when sendError is true', () => {
      render(<AgentInput {...defaultProps} sendError={true} />);
      const container = screen.getByRole('textbox').closest('.border') || screen.getByRole('textbox').parentElement?.parentElement;
      if (container) {
        expect(container).toHaveClass('border-[var(--vscode-error-border)]');
      }
    });
  });

  describe('Character Counter', () => {
    it('should not show character counter for short text', () => {
      render(<AgentInput {...defaultProps} value="short" />);
      expect(screen.queryByText('5')).not.toBeInTheDocument();
    });

    it('should show character counter for long text', () => {
      render(<AgentInput {...defaultProps} value={'a'.repeat(1001)} />);
      expect(screen.getByText('1,001')).toBeInTheDocument();
    });

    it('should format large numbers correctly', () => {
      render(<AgentInput {...defaultProps} value={'a'.repeat(10000)} />);
      expect(screen.getByText('10,000')).toBeInTheDocument();
    });
  });

  describe('Disabled State', () => {
    it('should disable textarea when disabled prop is true', () => {
      render(<AgentInput {...defaultProps} disabled={true} />);
      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeDisabled();
    });

    it('should disable textarea when sending', () => {
      render(<AgentInput {...defaultProps} isSending={true} />);
      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeDisabled();
    });

    it('should disable all buttons when disabled', () => {
      render(<AgentInput {...defaultProps} disabled={true} value="test" />);
      const sendButton = screen.getByTitle('Send message');
      const fileButton = screen.getByTitle('Attach file');
      expect(sendButton).toBeDisabled();
      expect(fileButton).toBeDisabled();
    });
  });

  describe('Slash Commands', () => {
    it('should not show dropdown when showSlashCommands is false', () => {
      render(<AgentInput {...defaultProps} showSlashCommands={false} />);
      expect(screen.queryByText('QUICK ACTIONS')).not.toBeInTheDocument();
    });

    it('should show dropdown when showSlashCommands is true', () => {
      render(
        <AgentInput
          {...defaultProps}
          showSlashCommands={true}
          filteredSlashCommands={mockSlashCommands}
        />
      );
      expect(screen.getByText('QUICK ACTIONS')).toBeInTheDocument();
    });

    it('should render all slash commands', () => {
      render(
        <AgentInput
          {...defaultProps}
          showSlashCommands={true}
          filteredSlashCommands={mockSlashCommands}
        />
      );
      expect(screen.getByTestId('suggestion-New Task')).toBeInTheDocument();
      expect(screen.getByTestId('suggestion-Help')).toBeInTheDocument();
    });

    it('should call onSelectSlashCommand when suggestion is clicked', async () => {
      const user = userEvent.setup();
      const onSelectSlashCommand = jest.fn();
      render(
        <AgentInput
          {...defaultProps}
          showSlashCommands={true}
          filteredSlashCommands={mockSlashCommands}
          onSelectSlashCommand={onSelectSlashCommand}
        />
      );

      const suggestion = screen.getByTestId('suggestion-New Task');
      await user.click(suggestion);

      expect(onSelectSlashCommand).toHaveBeenCalledWith(mockSlashCommands[0]);
    });

    it('should not show dropdown when filtered commands is empty', () => {
      render(
        <AgentInput
          {...defaultProps}
          showSlashCommands={true}
          filteredSlashCommands={[]}
        />
      );
      expect(screen.queryByText('QUICK ACTIONS')).not.toBeInTheDocument();
    });
  });

  describe('Auto-resize Behajest.r', () => {
    it('should set initial height to 26px', () => {
      render(<AgentInput {...defaultProps} />);
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(textarea.style.height).toBe('26px');
    });

    it('should increase height when content grows', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      const { rerender } = render(<AgentInput {...defaultProps} value="" onChange={onChange} />);

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      const initialHeight = textarea.style.height;

      await user.type(textarea, 'a'.repeat(100));
      onChange('a'.repeat(100));
      rerender(<AgentInput {...defaultProps} value={'a'.repeat(100)} onChange={onChange} />);

      expect(textarea.style.height).not.toBe(initialHeight);
    });

    it('should cap height at 180px', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      render(<AgentInput {...defaultProps} onChange={onChange} />);

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      await user.type(textarea, 'a'.repeat(500));
      onChange('a'.repeat(500));

      await waitFor(() => {
        expect(parseInt(textarea.style.height)).toBeLessThanOrEqual(180);
      });
    });
  });

  describe('Ref Handling', () => {
    it('should use forwarded ref when provided', () => {
      const TestComponent = () => {
        const ref = jest.fn() as any;
        return <AgentInput {...defaultProps} textareaRef={ref} />;
      };

      render(<TestComponent />);
      // Component should render without errors
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('should use custom textareaRef when provided', () => {
      const customRef = { current: null };
      render(<AgentInput {...defaultProps} textareaRef={customRef as any} />);
      expect(customRef.current).toBeInstanceOf(HTMLTextAreaElement);
    });
  });

  describe('Accessibility', () => {
    it('should have proper button types', () => {
      render(<AgentInput {...defaultProps} />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveAttribute('type', 'button');
      });
    });

    it('should have proper title attributes on buttons', () => {
      render(<AgentInput {...defaultProps} />);
      expect(screen.getByTitle('Attach file')).toBeInTheDocument();
      expect(screen.getByTitle('Type a message to send')).toBeInTheDocument();
    });

    it('should have disabled state on buttons when appropriate', () => {
      render(<AgentInput {...defaultProps} disabled={true} />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toBeDisabled();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle whitespace-only input', async () => {
      const user = userEvent.setup();
      render(<AgentInput {...defaultProps} value="   " />);

      const sendButton = screen.getByTitle('Type a message to send');
      expect(sendButton).toBeDisabled();
    });

    it('should handle rapid value changes', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      render(<AgentInput {...defaultProps} onChange={onChange} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'abc');

      expect(onChange).toHaveBeenCalledTimes(3);
    });

    it('should handle undefined callbacks gracefully', () => {
      expect(() => {
        render(<AgentInput value="" onChange={jest.fn()} />);
      }).not.toThrow();
    });

    it('should handle null ref gracefully', () => {
      expect(() => {
        render(<AgentInput {...defaultProps} />);
      }).not.toThrow();
    });
  });
});
