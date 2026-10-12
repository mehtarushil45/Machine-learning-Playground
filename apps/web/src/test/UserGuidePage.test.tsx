import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UserGuidePage } from '../features/guide/UserGuidePage';

describe('UserGuidePage Component', () => {
  it('renders header, title, and all core platform modules in sidebar', () => {
    render(<UserGuidePage />);

    expect(screen.getByText(/ML Playground — Student Guide/i)).toBeInTheDocument();
    expect(screen.getByText(/Simple, step-by-step documentation for students/i)).toBeInTheDocument();

    // Verify module buttons exist in sidebar
    expect(screen.getByRole('button', { name: /What is Machine Learning\?/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1\. Datasets & Profiler/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2\. Pipeline Code Studio/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /3\. Training & Experiments/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /4\. Model Deployments/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /5\. Classroom & Lab Exams/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ML Glossary for Students/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Common Mistakes to Avoid/i })).toBeInTheDocument();
  }, 15000);

  it('renders student-friendly explanations and glossary definitions', () => {
    render(<UserGuidePage />);

    // Check student-friendly intro analogy
    expect(screen.getByText(/What is Machine Learning\? \(The Simple Explanation\)/i)).toBeInTheDocument();
    expect(screen.getByText(/In traditional computer programming, a human programmer writes exact rules by hand/i)).toBeInTheDocument();
    expect(screen.getByText(/1\. Feed Data/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Train Model/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Predict & Deploy/i)).toBeInTheDocument();

    // Check glossary terms
    expect(screen.getByText('Overfitting')).toBeInTheDocument();
    expect(screen.getByText('Hyperparameter')).toBeInTheDocument();
    expect(screen.getByText('One-Hot Encoding')).toBeInTheDocument();
  });

  it('filters glossary and sections when using the search bar', () => {
    render(<UserGuidePage />);

    const searchInput = screen.getByPlaceholderText(/Search guides or topics/i);
    fireEvent.change(searchInput, { target: { value: 'Overfitting' } });

    expect(screen.getByText(/When a model memorizes the training data perfectly like a parrot/i)).toBeInTheDocument();
  });

  it('handles Open Workspace button navigation', () => {
    const handleNavigate = vi.fn();
    render(<UserGuidePage onNavigate={handleNavigate} />);

    const openWorkspaceBtn = screen.getByRole('button', { name: /Open Workspace/i });
    fireEvent.click(openWorkspaceBtn);

    expect(handleNavigate).toHaveBeenCalledWith('workspace');
  });
});
