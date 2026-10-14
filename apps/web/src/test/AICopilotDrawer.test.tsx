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

  it('renders code block with Review Diff & Apply action and triggers onReviewDiff', () => {
    const handleReviewDiff = vi.fn();
    const chatMessages = [
      {
        id: 'msg-1',
        role: 'assistant' as const,
        text: 'Here is the proposed fix for missing values:\n\n```python\nfrom sklearn.impute import SimpleImputer\nimputer = SimpleImputer(strategy="median")\nX = imputer.fit_transform(X)\n```\n\nThis will replace NaNs with the median value.',
      },
    ];

    render(
      <AICopilotDrawer
        isOpen={true}
        onToggle={() => {}}
        chatMessages={chatMessages}
        onReviewDiff={handleReviewDiff}
      />
    );

    // Verify code block is rendered
    expect(screen.getByText(/from sklearn.impute import SimpleImputer/i)).toBeInTheDocument();

    // Verify Review Diff & Apply button is present
    const diffButton = screen.getByTestId('copilot-apply-diff-btn');
    expect(diffButton).toBeInTheDocument();
    expect(diffButton).toHaveTextContent(/review diff & apply/i);

    // Click the button and assert callback receives code snippet
    fireEvent.click(diffButton);
    expect(handleReviewDiff).toHaveBeenCalledWith(
      expect.stringContaining('from sklearn.impute import SimpleImputer')
    );
  });

  it('renders bold markdown and inline code styling cleanly', () => {
    const chatMessages = [
      {
        id: 'msg-2',
        role: 'assistant' as const,
        text: 'Use **RandomForestClassifier** with `n_estimators=100` for best results.',
      },
    ];

    render(
      <AICopilotDrawer
        isOpen={true}
        onToggle={() => {}}
        chatMessages={chatMessages}
      />
    );

    expect(screen.getByText('RandomForestClassifier')).toBeInTheDocument();
    expect(screen.getByText('n_estimators=100')).toBeInTheDocument();
  });
});
