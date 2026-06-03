import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from '@/components/shared/Input';

describe('Input Component', () => {
  it('renders with default props', () => {
    render(<Input />);
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveClass('h-9');
  });

  it('renders with placeholder text', () => {
    render(<Input placeholder="Enter text" />);
    const input = screen.getByPlaceholderText('Enter text');
    expect(input).toBeInTheDocument();
  });

  it('renders with value', () => {
    render(<Input value="Test value" />);
    const input = screen.getByDisplayValue('Test value');
    expect(input).toBeInTheDocument();
  });

  it('updates value on change', () => {
    render(<Input />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'New value' } });
    expect(input).toHaveValue('New value');
  });

  it('is disabled when disabled prop is true', () => {
    render(<Input disabled />);
    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
    expect(input).toHaveClass('disabled:opacity-50');
  });

  it('renders as password input', () => {
    render(<Input type="password" />);
    const input = screen.getByDisplayValue('');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('calls onChange handler', () => {
    const handleChange = jest.fn();
    render(<Input onChange={handleChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'test' } });
    expect(handleChange).toHaveBeenCalled();
  });
});
