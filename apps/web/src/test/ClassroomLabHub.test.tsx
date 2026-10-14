import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClassroomHub } from '../features/classrooms/ClassroomHub';
import { ClassroomService } from '../services/api';

// Mock ClassroomService
vi.mock('../services/api', async () => {
  const actual = await vi.importActual<any>('../services/api');
  return {
    ...actual,
    ClassroomService: {
      listExams: vi.fn(),
      getExam: vi.fn(),
      getSession: vi.fn(),
      deployModel: vi.fn(),
      evaluateModel: vi.fn(),
      submitExam: vi.fn(),
    },
    CodeExecutionService: {
      execute: vi.fn(),
      streamUrl: vi.fn().mockReturnValue('/api/v1/mock-stream'),
      getResult: vi.fn(),
    },
  };
});

const mockExams = [
  {
    id: 'lab-exam-01',
    title: 'Lab Exam 1: Customer Churn Classification Pipeline',
    course_code: 'CS401 - Machine Learning Lab',
    duration_minutes: 90,
    problem_type: 'classification',
    dataset_name: 'churn_lab_dataset.csv',
    dataset_id: 'churn_lab_dataset.csv',
    target_column: 'churn',
    feature_columns: ['tenure', 'monthly_charges', 'total_charges'],
    description: 'Build and deploy customer churn model.',
    rubric: {
      min_accuracy: 0.8,
      min_f1: 0.75,
      max_latency_ms: 100.0,
      max_score: 100.0,
    },
    starter_code: '# Python starter code for Lab 1\nimport pandas as pd',
  },
  {
    id: 'lab-exam-02',
    title: 'Lab Exam 2: Real Estate Price Regression',
    course_code: 'CS401 - Machine Learning Lab',
    duration_minutes: 90,
    problem_type: 'regression',
    dataset_name: 'sample_dataset.csv',
    dataset_id: 'sample_dataset.csv',
    target_column: 'target',
    feature_columns: ['feature1', 'feature2'],
    description: 'Build and deploy regression model.',
    rubric: {
      min_r2: 0.7,
      max_latency_ms: 100.0,
      max_score: 100.0,
    },
    starter_code: '# Python starter code for Lab 2\nimport numpy as np',
  },
];

describe('University Lab Exam ClassroomHub', { timeout: 20000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ClassroomService.listExams as any).mockResolvedValue(mockExams);
    (ClassroomService.getSession as any).mockResolvedValue({
      code_draft: '# Python starter code for Lab 1\nimport pandas as pd',
      status: 'IN_PROGRESS',
    });
  });

  const waitForExamLoaded = async () => {
    return screen.findByText('lab_exam.py');
  };

  it('renders lab workspace, code studio controls, and exam selector', async () => {
    render(<ClassroomHub />);

    await waitForExamLoaded();
    expect(screen.getByText('lab_exam.py')).toBeInTheDocument();
    expect(screen.getByText(/Python 3\.\d+ \(Scikit-Learn\)/)).toBeInTheDocument();
    expect(screen.getByText('Run Code')).toBeInTheDocument();
    expect(screen.getByText('Deploy to Lab Slot')).toBeInTheDocument();
    expect(screen.getByText('Submit Exam')).toBeInTheDocument();
  });

  it('allows switching between exams in the selector', async () => {
    render(<ClassroomHub />);

    await waitForExamLoaded();

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('lab-exam-01');

    fireEvent.change(select, { target: { value: 'lab-exam-02' } });

    expect(select.value).toBe('lab-exam-02');
    await waitFor(() => {
      expect(screen.getByText(/Switched to Lab Exam 2/i)).toBeInTheDocument();
    });
  });

  it('handles in-place singleton deployment update with zero duplicates', async () => {
    (ClassroomService.deployModel as any).mockResolvedValue({
      deployment_id: 'dep-singleton-123',
      model_id: 'model-exec-001',
      model_version: 'v1.0.0',
      is_updated_in_place: false,
      status: 'RUNNING',
      endpoint_path: '/api/v1/local-deployments/dep-singleton-123/predict',
      sample_inputs: { tenure: 12, monthly_charges: 65.5 },
      input_schema: { tenure: { type: 'numeric' }, monthly_charges: { type: 'numeric' } },
      metrics: { accuracy: 0.91, f1_score: 0.89 },
      version_count: 1,
      logs: [],
    });

    render(<ClassroomHub />);
    await waitForExamLoaded();

    // Click deploy
    const deployBtn = screen.getByTitle(/Deploy newly trained model to active lab slot/i);
    fireEvent.click(deployBtn);

    await waitFor(() => {
      expect(screen.getByText(/Slot: Lab-01/i)).toBeInTheDocument();
      expect(screen.getByText(/0 duplicate deployment records are formed/i)).toBeInTheDocument();
      expect(screen.getByText(/Version: v1\.0/i)).toBeInTheDocument();
    });

    // Redeploy in-place
    (ClassroomService.deployModel as any).mockResolvedValue({
      deployment_id: 'dep-singleton-123', // SAME ID!
      model_id: 'model-exec-002',
      model_version: 'v2.0.0',
      is_updated_in_place: true,
      status: 'RUNNING',
      endpoint_path: '/api/v1/local-deployments/dep-singleton-123/predict',
      sample_inputs: { tenure: 12, monthly_charges: 65.5 },
      input_schema: { tenure: { type: 'numeric' }, monthly_charges: { type: 'numeric' } },
      metrics: { accuracy: 0.94, f1_score: 0.93 },
      version_count: 2,
      logs: [],
    });

    const redeployBtn = screen.getByTitle(/Re-deploy updated model in-place/i);
    fireEvent.click(redeployBtn);

    await waitFor(() => {
      // Must stay on same slot and show Version v2.0
      expect(screen.getByText(/Version: v2\.0/i)).toBeInTheDocument();
    });
  });

  it('runs automated rubric benchmark tests and displays criteria results', async () => {
    (ClassroomService.deployModel as any).mockResolvedValue({
      deployment_id: 'dep-singleton-123',
      model_id: 'model-exec-001',
      model_version: 'v1.0.0',
      is_updated_in_place: false,
      status: 'RUNNING',
      endpoint_path: '/api/v1/local-deployments/dep-singleton-123/predict',
      sample_inputs: { tenure: 12 },
      input_schema: { tenure: { type: 'numeric' } },
      metrics: { accuracy: 0.91 },
      version_count: 1,
      logs: [],
    });

    (ClassroomService.evaluateModel as any).mockResolvedValue({
      score: 95.0,
      max_score: 100.0,
      percentage: 95.0,
      passed: true,
      criteria_results: [
        {
          criterion: 'Serving Health & Availability',
          description: 'Model artifact loaded in RUNNING state.',
          target: 'RUNNING',
          actual: 'RUNNING',
          passed: true,
          points_awarded: 15.0,
          max_points: 15.0,
        },
        {
          criterion: 'Live Inference & Latency Benchmark',
          description: 'Latency <= 100ms.',
          target: '<= 100ms',
          actual: '8.4ms',
          passed: true,
          points_awarded: 30.0,
          max_points: 30.0,
        },
      ],
      summary: 'Automated evaluation completed: Score 95.0/100.',
    });

    render(<ClassroomHub />);
    await waitForExamLoaded();

    // Deploy
    fireEvent.click(screen.getByTitle(/Deploy newly trained model/i));
    await screen.findByText(/Slot: Lab-01/i);

    // Evaluate
    const evalBtn = screen.getByText('Run Automated Rubric Tests');
    fireEvent.click(evalBtn);

    await waitFor(() => {
      expect(screen.getByText('Score: 95/100')).toBeInTheDocument();
      expect(screen.getByText('Serving Health & Availability')).toBeInTheDocument();
      expect(screen.getByText('Live Inference & Latency Benchmark')).toBeInTheDocument();
    });
  });

  it('opens confirmation modal and finalizes submission', async () => {
    (ClassroomService.submitExam as any).mockResolvedValue({
      submission_id: 'sub-lab-888',
      status: 'SUBMITTED',
      grade_score: 95.0,
      percentage: 95.0,
      passed: true,
      submitted_at: new Date().toISOString(),
      message: 'Exam submission locked successfully.',
    });

    render(<ClassroomHub />);
    await waitForExamLoaded();

    // Click Submit Exam in toolbar
    fireEvent.click(screen.getByText('Submit Exam'));

    // Modal appears
    expect(screen.getByText('Finalize & Submit Lab Exam')).toBeInTheDocument();

    // Confirm submission
    fireEvent.click(screen.getByText('Confirm Final Submission'));

    await waitFor(() => {
      expect(screen.getByText('Exam Locked & Submitted (95/100)')).toBeInTheDocument();
      expect(screen.getByText('sub-lab-888')).toBeInTheDocument();
    });
  });
});
