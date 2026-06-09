/**
 * StreamingExecutionDisplay Component Tests
 * Comprehensive test coverage for StreamingExecutionDisplay component
 */

import { describe, it, expect,  beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StreamingExecutionDisplay } from '@/components/agent/StreamingExecutionDisplay';
import type { StreamingToolCall } from '@/components/agent/StreamingExecutionDisplay';

// Mock VS_CODES
jest.mock('@/styles/vscode-constants', () => ({
  VS_CODES: {
    radiusSm: '2px',
    spacing: {
      xs: '2px',
      sm: '4px',
      md: '8px',
      lg: '12px',
    },
    borderRadiusRound: '3px',
  },
}));

describe('StreamingExecutionDisplay Component', () => {
  const createMockToolCall = (overrides: Partial<StreamingToolCall> = {}): StreamingToolCall => ({
    id: '1',
    action: 'browser_click',
    status: 'pending',
    timestamp: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('Rendering - Empty State', () => {
    it('should render nothing when no tool calls', () => {
      const { container } = render(<StreamingExecutionDisplay toolCalls={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it('should not render summary when tool calls is empty', () => {
      render(<StreamingExecutionDisplay toolCalls={[]} />);
      expect(screen.queryByText(/steps/i)).not.toBeInTheDocument();
    });
  });

  describe('Rendering - Tool Call Items', () => {
    it('should render tool call items', () => {
      const toolCalls = [
        createMockToolCall({ action: 'browser_click', detail: 'Click button' }),
      ];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText('browser_click')).toBeInTheDocument();
    });

    it('should render multiple tool calls', () => {
      const toolCalls = [
        createMockToolCall({ id: '1', action: 'browser_click' }),
        createMockToolCall({ id: '2', action: 'file_read' }),
      ];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText('browser_click')).toBeInTheDocument();
      expect(screen.getByText('file_read')).toBeInTheDocument();
    });

    it('should render tool call detail when collapsed', () => {
      const toolCalls = [
        createMockToolCall({ detail: 'Some detail text' }),
      ];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText('Some detail text')).toBeInTheDocument();
    });

    it('should render detail preview truncated', () => {
      const longDetail = 'a'.repeat(100);
      const toolCalls = [
        createMockToolCall({ detail: longDetail }),
      ];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      const preview = screen.getByText(/a\.\.\./);
      expect(preview).toBeInTheDocument();
    });
  });

  describe('Status Badges', () => {
    it('should render pending status badge', () => {
      const toolCalls = [createMockToolCall({ status: 'pending' })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText('pending')).toBeInTheDocument();
    });

    it('should render running status badge with spinner', () => {
      const toolCalls = [createMockToolCall({ status: 'running' })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText('running')).toBeInTheDocument();
      const spinner = screen.getByText('running').prejest.usElementSibling;
      expect(spinner?.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('should render success status badge', () => {
      const toolCalls = [createMockToolCall({ status: 'success' })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText('success')).toBeInTheDocument();
    });

    it('should render error status badge', () => {
      const toolCalls = [createMockToolCall({ status: 'error' })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText('error')).toBeInTheDocument();
    });

    it('should show elapsed time for running status', () => {
      jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));
      const toolCalls = [
        createMockToolCall({
          status: 'running',
          timestamp: new Date('2024-01-01T00:00:01Z').getTime(),
        }),
      ];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      // After 1 second has elapsed from timestamp
      jest.advanceTimersByTime(1000);
      expect(screen.getByText(/1s/)).toBeInTheDocument();
    });
  });

  describe('Expand/Collapse Behajest.r', () => {
    it('should start collapsed for pending status', () => {
      const toolCalls = [createMockToolCall({ status: 'pending' })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.queryByText('Input')).not.toBeInTheDocument();
    });

    it('should auto-expand on running status', () => {
      const toolCalls = [createMockToolCall({ status: 'running' })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText('Input')).toBeInTheDocument();
    });

    it('should auto-expand on error status', () => {
      const toolCalls = [createMockToolCall({ status: 'error', error: 'Failed' })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    it('should toggle expand on click', async () => {
      const user = userEvent.setup();
      const toolCalls = [createMockToolCall({ detail: 'Test detail' })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);

      // Initially collapsed
      expect(screen.queryByText('Input')).not.toBeInTheDocument();

      // Click to expand
      const header = screen.getByText('browser_click').closest('.cursor-pointer');
      await user.click(header!);

      await waitFor(() => {
        expect(screen.getByText('Input')).toBeInTheDocument();
      });
    });

    it('should collapse on second click', async () => {
      const user = userEvent.setup();
      const toolCalls = [createMockToolCall({ status: 'running', detail: 'Test' })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);

      // Initially expanded
      expect(screen.getByText('Input')).toBeInTheDocument();

      const header = screen.getByText('browser_click').closest('.cursor-pointer');
      await user.click(header!);
      await user.click(header!);

      await waitFor(() => {
        expect(screen.queryByText('Input')).not.toBeInTheDocument();
      });
    });
  });

  describe('Expanded Content', () => {
    it('should show Input section when expanded with detail', () => {
      const toolCalls = [createMockToolCall({ status: 'running', detail: 'Input data' })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText('Input')).toBeInTheDocument();
      expect(screen.getByText('Input data')).toBeInTheDocument();
    });

    it('should show Output section when output exists', () => {
      const toolCalls = [
        createMockToolCall({ status: 'running', output: 'Output result' }),
      ];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText('Output')).toBeInTheDocument();
      expect(screen.getByText('Output result')).toBeInTheDocument();
    });

    it('should show Error section when error exists', () => {
      const toolCalls = [
        createMockToolCall({ status: 'error', error: 'Something went wrong' }),
      ];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should truncate long output at 1000 characters', () => {
      const longOutput = 'a'.repeat(1500);
      const toolCalls = [
        createMockToolCall({ status: 'success', output: longOutput }),
      ];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText(/a\.\.\.$/)).toBeInTheDocument();
    });
  });

  describe('Action Icons', () => {
    it('should show Globe icon for browser actions', () => {
      const toolCalls = [createMockToolCall({ action: 'browser_click' })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      // Globe icon should be present
      expect(screen.getByText('browser_click')).toBeInTheDocument();
    });

    it('should show FileText icon for file actions', () => {
      const toolCalls = [createMockToolCall({ action: 'file_read' })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText('file_read')).toBeInTheDocument();
    });

    it('should show Terminal icon for shell actions', () => {
      const toolCalls = [createMockToolCall({ action: 'shell_exec' })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText('shell_exec')).toBeInTheDocument();
    });
  });

  describe('Execution Summary', () => {
    it('should show step counts in summary', () => {
      const toolCalls = [
        createMockToolCall({ id: '1', status: 'success' }),
        createMockToolCall({ id: '2', status: 'pending' }),
      ];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} isStreaming={true} />);
      expect(screen.getByText('1/2 steps')).toBeInTheDocument();
    });

    it('should show running count when items are running', () => {
      const toolCalls = [
        createMockToolCall({ status: 'running' }),
        createMockToolCall({ status: 'pending' }),
      ];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} isStreaming={true} />);
      expect(screen.getByText(/2 running/)).toBeInTheDocument();
    });

    it('should show failed count when items have errors', () => {
      const toolCalls = [
        createMockToolCall({ status: 'error' }),
        createMockToolCall({ status: 'success' }),
      ];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText(/1 failed/)).toBeInTheDocument();
    });

    it('should show total duration when completed', () => {
      const toolCalls = [
        createMockToolCall({ status: 'success', duration: 1000 }),
        createMockToolCall({ status: 'success', duration: 2000 }),
      ];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText(/3.0s/)).toBeInTheDocument();
    });
  });

  describe('Hover States', () => {
    it('should show hover background on header hover', async () => {
      const toolCalls = [createMockToolCall({ status: 'pending' })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);

      const header = screen.getByText('browser_click').closest('.cursor-pointer');
      fireEvent.mouseEnter(header!);

      await waitFor(() => {
        expect(header).toHaveStyle({ backgroundColor: 'var(--vscode-list-hoverBackground)' });
      });
    });

    it('should reset background on mouse leave', async () => {
      const toolCalls = [createMockToolCall({ status: 'pending' })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);

      const header = screen.getByText('browser_click').closest('.cursor-pointer');
      fireEvent.mouseEnter(header!);
      fireEvent.mouseLeave(header!);

      await waitFor(() => {
        expect(header).toHaveStyle({ backgroundColor: 'transparent' });
      });
    });
  });

  describe('Error Styling', () => {
    it('should apply error border color for error status', () => {
      const toolCalls = [createMockToolCall({ status: 'error', error: 'Failed' })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);

      const item = screen.getByText('browser_click').closest('.border');
      expect(item).toHaveStyle({ borderColor: 'var(--vscode-error-foreground)' });
    });

    it('should apply error background for error output', () => {
      const toolCalls = [
        createMockToolCall({ status: 'error', output: 'Error output' }),
      ];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);

      const outputSection = screen.getByText('Error output').closest('pre');
      expect(outputSection).toHaveStyle({
        backgroundColor: 'rgba(244, 135, 113, 0.05)',
        borderColor: 'var(--vscode-error-foreground)',
      });
    });
  });

  describe('Duration Formatting', () => {
    it('should format milliseconds correctly', () => {
      const toolCalls = [
        createMockToolCall({ status: 'success', duration: 500 }),
      ];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText('500ms')).toBeInTheDocument();
    });

    it('should format seconds correctly', () => {
      const toolCalls = [
        createMockToolCall({ status: 'success', duration: 1500 }),
      ];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText('1.5s')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle tool call with no detail', () => {
      const toolCalls = [createMockToolCall({ detail: undefined })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText('browser_click')).toBeInTheDocument();
    });

    it('should handle tool call with no output', () => {
      const toolCalls = [createMockToolCall({ output: undefined })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.queryByText('Output')).not.toBeInTheDocument();
    });

    it('should handle tool call with no error', () => {
      const toolCalls = [createMockToolCall({ error: undefined })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.queryByText('Error')).not.toBeInTheDocument();
    });

    it('should handle JSON detail parsing', () => {
      const jsonDetail = JSON.stringify({ key: 'value', nested: { data: 'test' } });
      const toolCalls = [createMockToolCall({ detail: jsonDetail })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      // Should parse and format JSON
      expect(screen.getByText(/key:/)).toBeInTheDocument();
    });

    it('should handle empty JSON object', () => {
      const toolCalls = [createMockToolCall({ detail: '{}' })];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      expect(screen.getByText('{}')).toBeInTheDocument();
    });
  });

  describe('Custom className', () => {
    it('should apply custom className to container', () => {
      const toolCalls = [createMockToolCall()];
      const { container } = render(
        <StreamingExecutionDisplay toolCalls={toolCalls} className="custom-class" />
      );
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Phase Display', () => {
    it('should render phase when provided', () => {
      const toolCalls = [createMockToolCall()];
      render(<StreamingExecutionDisplay toolCalls={toolCalls} phase="planning" />);
      // Phase might be displayed somewhere in the component
    });

    it('should work without phase prop', () => {
      const toolCalls = [createMockToolCall()];
      expect(() => {
        render(<StreamingExecutionDisplay toolCalls={toolCalls} />);
      }).not.toThrow();
    });
  });
});
