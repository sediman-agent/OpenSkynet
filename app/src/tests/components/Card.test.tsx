import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/shared/Card';

describe('Card Components', () => {
  it('renders Card with proper styles', () => {
    const { container } = render(<Card>Card Content</Card>);
    const card = screen.getByText('Card Content');
    expect(card).toBeInTheDocument();
    const cardElement = container.querySelector('.rounded-lg.border');
    expect(cardElement).toBeInTheDocument();
  });

  it('renders CardHeader with children', () => {
    render(
      <CardHeader>
        <CardTitle>Title</CardTitle>
        <CardDescription>Description</CardDescription>
      </CardHeader>
    );
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
  });

  it('CardTitle has proper styling classes', () => {
    render(<CardTitle>Test Title</CardTitle>);
    const title = screen.getByText('Test Title');
    expect(title).toHaveClass('text-lg');
    expect(title).toHaveClass('font-semibold');
  });

  it('CardDescription has proper styling classes', () => {
    render(<CardDescription>Test Description</CardDescription>);
    const description = screen.getByText('Test Description');
    expect(description).toHaveClass('text-sm');
    expect(description).toHaveClass('text-muted-foreground');
  });

  it('CardContent renders children', () => {
    render(
      <CardContent>
        <p>Content goes here</p>
      </CardContent>
    );
    expect(screen.getByText('Content goes here')).toBeInTheDocument();
  });

  it('CardFooter renders children', () => {
    render(
      <CardFooter>
        <button>Action</button>
      </CardFooter>
    );
    expect(screen.getByText('Action')).toBeInTheDocument();
  });
});
