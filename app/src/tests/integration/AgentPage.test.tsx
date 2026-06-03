import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentPage } from '@/components/pages/AgentPage';

// Mock the chat service
jest.mock('@/services/chatService', () => ({
  getChatService: () => ({
    sendMessage: jest.fn(async (conversationId, content, options) => {
      options.onChunk('Hello response');
      options.onDone();
    }),
  }),
}));

describe('AgentPage Integration', () => {
  it('renders header with title and New Chat button', () => {
    render(<AgentPage />);
    expect(screen.getByText('OpenSkynet')).toBeInTheDocument();
    expect(screen.getByText('New Chat')).toBeInTheDocument();
  });

  it('renders message input', () => {
    render(<AgentPage />);
    const input = screen.getByPlaceholderText(/Message OpenSkynet/);
    expect(input).toBeInTheDocument();
  });

  it('disables send button when input is empty', () => {
    render(<AgentPage />);
    // Get all buttons and find the send button (it has the Send icon/text)
    const buttons = screen.getAllByRole('button');
    const sendButton = buttons.find(btn => btn.classList.contains('bg-black'));
    expect(sendButton).toBeDisabled();
  });

  it('enables send button when input has text', () => {
    render(<AgentPage />);
    const input = screen.getByPlaceholderText(/Message OpenSkynet/);

    fireEvent.change(input, { target: { value: 'Hello' } });

    const buttons = screen.getAllByRole('button');
    const sendButton = buttons.find(btn => btn.classList.contains('bg-black'));
    expect(sendButton).not.toBeDisabled();
  });
});
