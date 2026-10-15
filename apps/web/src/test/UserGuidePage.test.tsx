import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { UserGuidePage } from '../features/guide/UserGuidePage';

describe('UserGuidePage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders enterprise header, title, and all 4 pillars in sidebar', () => {
    render(<UserGuidePage />);

    expect(screen.getByText(/ML Playground — Enterprise MLOps Guide/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Production Architecture, Core Pillars, and Operational Reference/i)
    ).toBeInTheDocument();

    // Verify all core pillar & reference buttons exist in sidebar
    expect(screen.getByRole('button', { name: /Platform Architecture & Topology/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1\. Dataset Engine & Governance/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2\. Monaco Code Studio & Guardian/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /3\. Experiment Tracking & Registry/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /4\. Model Serving & Batch Scoring/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Diagnostic Metrics & Formulas/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /MLOps & ML Glossary/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Keyboard Shortcuts Cheatsheet/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Frequently Asked Questions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enterprise Pitfalls to Avoid/i })).toBeInTheDocument();
  }, 15000);

  it('renders the interactive architecture topology diagram', () => {
    render(<UserGuidePage />);

    const diagram = screen.getByTestId('architecture-topology-diagram');
    expect(diagram).toBeInTheDocument();
    expect(within(diagram).getByText(/CLIENT LAYER: Web Monaco IDE/i)).toBeInTheDocument();
    expect(within(diagram).getByText(/FASTAPI GATEWAY: Stateless API Pods/i)).toBeInTheDocument();
    expect(within(diagram).getByText(/^1\. DATASET ENGINE$/i)).toBeInTheDocument();
    expect(within(diagram).getByText(/^2\. CODE STUDIO$/i)).toBeInTheDocument();
    expect(within(diagram).getByText(/^3\. EXPERIMENT HUB$/i)).toBeInTheDocument();
    expect(within(diagram).getByText(/^4\. MODEL SERVING$/i)).toBeInTheDocument();
    expect(within(diagram).getByText(/STORAGE & QUEUE INFRASTRUCTURE/i)).toBeInTheDocument();
  });

  it('renders core MLOps glossary definitions', () => {
    render(<UserGuidePage />);

    expect(screen.getByText('Overfitting')).toBeInTheDocument();
    expect(screen.getByText('Target Leakage')).toBeInTheDocument();
    expect(screen.getByText('Population Stability Index (PSI)')).toBeInTheDocument();
    expect(screen.getByText('Kolmogorov-Smirnov (KS) Test')).toBeInTheDocument();
    expect(screen.getByText('Hyperparameter')).toBeInTheDocument();
    expect(screen.getByText('One-Hot Encoding')).toBeInTheDocument();
  });

  it('filters glossary and FAQs when using the search bar', () => {
    render(<UserGuidePage />);

    const searchInput = screen.getByTestId('guide-search-input');
    fireEvent.change(searchInput, { target: { value: 'DuckDB' } });

    // FAQ should match
    expect(
      screen.getByText(/How does DuckDB prevent Out-Of-Memory \(OOM\) crashes on large datasets\?/i)
    ).toBeInTheDocument();
  });

  it('handles Open Workspace button navigation', () => {
    const handleNavigate = vi.fn();
    render(<UserGuidePage onNavigate={handleNavigate} />);

    const openWorkspaceBtn = screen.getByTestId('guide-open-workspace');
    fireEvent.click(openWorkspaceBtn);

    expect(handleNavigate).toHaveBeenCalledWith('workspace');
  });

  it('displays keyboard shortcuts and allows copying', () => {
    // Mock navigator.clipboard
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<UserGuidePage />);

    expect(screen.getByText('Run Pipeline in Code Studio')).toBeInTheDocument();
    const ctrlEnterBtn = screen.getByRole('button', { name: /Ctrl \+ Enter/i });
    expect(ctrlEnterBtn).toBeInTheDocument();

    fireEvent.click(ctrlEnterBtn);
    expect(writeTextMock).toHaveBeenCalledWith('Ctrl + Enter');
  });
});
