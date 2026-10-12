import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProjectGatekeeper } from '../features/datasets/ProjectGatekeeper';
import { ProjectProvider } from '../providers/ProjectContext';

// Mock apiClient to prevent real network requests during tests
vi.mock('../services/apiClient', () => ({
  apiClient: {
    get: vi.fn().mockRejectedValue(new Error('offline')),
    upload: vi.fn().mockResolvedValue({ dataset_id: 'mock-dataset-123' }),
    post: vi.fn().mockResolvedValue({}),
  },
}));

function renderGatekeeper() {
  return render(
    <ProjectProvider>
      <ProjectGatekeeper />
    </ProjectProvider>
  );
}

describe('ProjectGatekeeper Component', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders the top Upload Dataset block with browse button and dropzone', () => {
    renderGatekeeper();

    // Check header and top upload block
    expect(screen.getByRole('heading', { name: /Upload Dataset/i })).toBeInTheDocument();
    expect(screen.getByText(/Drop your CSV file here/i)).toBeInTheDocument();
    expect(screen.getByText(/Browse CSV File/i)).toBeInTheDocument();
  });

  it('renders the 3-column section: Previous Uploads, Ready-Made Examples, and User Guide', () => {
    renderGatekeeper();

    // Column 1: Left
    expect(screen.getByRole('heading', { name: /Previous Uploads/i })).toBeInTheDocument();

    // Column 2: Middle
    expect(screen.getByRole('heading', { name: /Learn with Ready-Made Examples/i })).toBeInTheDocument();

    // Column 3: Right
    expect(screen.getByRole('heading', { name: /User Guide/i })).toBeInTheDocument();
  });

  it('strictly ensures NO rows or column details are displayed in Previous Uploads', () => {
    renderGatekeeper();

    // STRICT CHECK: Ensure strings like "rows", "columns", "cols" are NOT present in the previous upload section
    const previousUploadsContainer = screen.getByRole('heading', { name: /Previous Uploads/i }).parentElement?.parentElement;
    expect(previousUploadsContainer).toBeDefined();

    // Verify Previous Uploads lists files line by line
    expect(previousUploadsContainer).toHaveTextContent('telecom_churn.csv');
    expect(previousUploadsContainer).toHaveTextContent('housing_prices.csv');

    const textContent = previousUploadsContainer?.textContent || '';
    expect(textContent).not.toMatch(/\d+\s*rows/i);
    expect(textContent).not.toMatch(/\d+\s*columns/i);
    expect(textContent).not.toMatch(/\d+\s*cols/i);
  });

  it('renders ready-made examples line by line and allows 1-click loading to experiment file prompt', async () => {
    renderGatekeeper();

    // Verify ready-made benchmark items exist
    expect(screen.getByText(/Customer Churn Analysis/i)).toBeInTheDocument();
    expect(screen.getByText(/California Housing Valuation/i)).toBeInTheDocument();
    expect(screen.getByText(/Credit Risk & Default Assessment/i)).toBeInTheDocument();
    expect(screen.getByText(/Iris Flower Taxonomy Benchmark/i)).toBeInTheDocument();

    // Click "Try" on Customer Churn Analysis
    const tryButtons = screen.getAllByRole('button', { name: /Try/i });
    expect(tryButtons.length).toBeGreaterThan(0);
    fireEvent.click(tryButtons[0]);

    // Should transition to Step 2: Name Experiment File modal
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Name Experiment File/i })).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText('experiment_1.py')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create File & Enter Studio/i })).toBeInTheDocument();
  });

  it('renders user guide launcher and opens #guide in a new window', () => {
    const originalOpen = window.open;
    const mockOpen = vi.fn();
    window.open = mockOpen;

    renderGatekeeper();

    expect(screen.getByRole('heading', { name: /User Guide/i })).toBeInTheDocument();
    expect(screen.getByText(/New to machine learning\? Open our comprehensive student guide/i)).toBeInTheDocument();

    const guideBtn = screen.getByTestId('gatekeeper-open-guide-btn');
    expect(guideBtn).toBeInTheDocument();

    fireEvent.click(guideBtn);
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockOpen).toHaveBeenCalledWith(expect.stringContaining('#guide'), '_blank');

    window.open = originalOpen;
  });

  it('strictly limits previous uploads to a maximum of 5 items and prevents vertical scroll', () => {
    // Seed 7 items in localStorage
    const sevenItems = Array.from({ length: 7 }, (_, i) => ({
      id: `seed-${i}`,
      fileName: `dataset_${i}.csv`,
      uploadedAt: 'Recent',
      csvContent: 'a,b,c\n1,2,3',
    }));
    localStorage.setItem('ml_previous_uploads_v2', JSON.stringify(sevenItems));

    renderGatekeeper();

    const previousUploadsContainer = screen.getByRole('heading', { name: /Previous Uploads/i }).parentElement?.parentElement;
    expect(previousUploadsContainer).toBeDefined();

    // The first 5 should be present, the 6th and 7th should NOT be rendered
    expect(previousUploadsContainer).toHaveTextContent('dataset_0.csv');
    expect(previousUploadsContainer).toHaveTextContent('dataset_4.csv');
    expect(previousUploadsContainer).not.toHaveTextContent('dataset_5.csv');
    expect(previousUploadsContainer).not.toHaveTextContent('dataset_6.csv');

    // Verify root region prevents scroll down
    const rootRegion = screen.getByRole('region', { name: /Project Setup/i });
    expect(rootRegion).toHaveStyle({ overflow: 'hidden' });
  });
});

