import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AICopilotDrawer } from '../components/shared/AICopilotDrawer';

describe('AICopilotDrawer Component', () => {
  it('renders correctly when open and omits static suggested question pills', () => {
    const handleToggle = vi.fn();
    const handleSend = vi.fn();

    render(
      <AICopilotDrawer
        isOpen={true}
        onToggle={handleToggle}
        onSendMessage={handleSend}
        placeholder="Ask AI Copilot..."
      />
    );

    // Assert drawer is mounted
    expect(screen.getByRole('complementary', { name: /ai copilot agent drawer/i })).toBeInTheDocument();

    // Assert NO suggested questions label or static suggested buttons exist
    expect(screen.queryByText(/suggested questions/i)).not.toBeInTheDocument();
  });

  it('allows user to type prompt and trigger onSendMessage', () => {
    const handleSend = vi.fn();

    render(
      <AICopilotDrawer
        isOpen={true}
        onToggle={() => {}}
        onSendMessage={handleSend}
      />
    );

    const input = screen.getByPlaceholderText(/ask ai copilot…/i);
    fireEvent.change(input, { target: { value: 'How to calculate ROC-AUC?' } });
    
    const sendButton = screen.getByTitle(/send to copilot/i);
    fireEvent.click(sendButton);

    expect(handleSend).toHaveBeenCalledWith('How to calculate ROC-AUC?');
    expect(input).toHaveValue('');
  });

  it('renders reasoning indicator and disables input while isLoading is true', () => {
    render(
      <AICopilotDrawer
        isOpen={true}
        onToggle={() => {}}
        onSendMessage={() => {}}
        isLoading={true}
      />
    );

    // Check reasoning indicator
    expect(screen.getByText(/ai copilot is reasoning/i)).toBeInTheDocument();

    // Check input is disabled
    const input = screen.getByPlaceholderText(/ai copilot is responding/i);
    expect(input).toBeDisabled();
  });
});
