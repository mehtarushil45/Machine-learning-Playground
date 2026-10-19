import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { UserGuidePage } from '../features/guide/UserGuidePage';

describe('UserGuidePage Component', { timeout: 25000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders user guide header, title, and all sections in sidebar', () => {
    render(<UserGuidePage />);

    expect(screen.getByText(/ML Playground — Complete Machine Learning Guide/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Learn How to Explore Data, Train Models, and Understand Predictions/i)
    ).toBeInTheDocument();

    // Verify friendly ML guide sections exist in sidebar
    expect(screen.getByRole('button', { name: /1\. The Machine Learning Journey/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2\. Core Machine Learning Concepts/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /3\. Preparing & Cleaning Data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /4\. Code Studio & Pipeline Editor/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /5\. Algorithms & Models Guide/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /6\. Settings & Sliders Explained/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /7\. Comparing Experiments & Models/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /8\. Understanding Model Scores/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /9\. Making Predictions on New Data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /10\. Machine Learning Glossary/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /11\. Keyboard Shortcuts Cheatsheet/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /12\. Frequently Asked Questions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /13\. Common Mistakes to Avoid/i })).toBeInTheDocument();
  }, 15000);

  it('renders the interactive 5-stage machine learning journey diagram', () => {
    render(<UserGuidePage />);

    const diagram = screen.getByTestId('architecture-topology-diagram');
    expect(diagram).toBeInTheDocument();
    expect(within(diagram).getByText(/The 5 Stages of Machine Learning/i)).toBeInTheDocument();
    expect(within(diagram).getByText(/1\. DATASET & PROFILER/i)).toBeInTheDocument();
    expect(within(diagram).getByText(/2\. DATA PREPROCESSING/i)).toBeInTheDocument();
    expect(within(diagram).getByText(/3\. CODE & TRAINING STUDIO/i)).toBeInTheDocument();
    expect(within(diagram).getByText(/4\. RESULTS & EVALUATION/i)).toBeInTheDocument();
    expect(within(diagram).getByText(/5\. MODEL PREDICTIONS/i)).toBeInTheDocument();
  });

  it('renders core machine learning glossary definitions', () => {
    render(<UserGuidePage />);

    expect(screen.getByText('Overfitting')).toBeInTheDocument();
    expect(screen.getByText('Target Leakage')).toBeInTheDocument();
    expect(screen.getByText('Dataset Profiler')).toBeInTheDocument();
    expect(screen.getByText('Population Stability Index (PSI)')).toBeInTheDocument();
    expect(screen.getByText('Kolmogorov-Smirnov (KS) Test')).toBeInTheDocument();
    expect(screen.getByText('Hyperparameter')).toBeInTheDocument();
    expect(screen.getByText('One-Hot Encoding')).toBeInTheDocument();
    expect(screen.getByText('Random Forest')).toBeInTheDocument();
  });

  it('filters glossary and FAQs when using the search bar', () => {
    render(<UserGuidePage />);

    const searchInput = screen.getByTestId('guide-search-input');
    fireEvent.change(searchInput, { target: { value: 'Decision Threshold' } });

    // FAQ should match
    expect(
      screen.getByText(/How does the Decision Threshold slider work\?/i)
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
