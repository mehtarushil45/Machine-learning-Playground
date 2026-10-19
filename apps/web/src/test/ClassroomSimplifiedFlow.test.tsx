import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateClassroomModal } from '../features/classrooms/CreateClassroomModal';
import { ClassroomHub } from '../features/classrooms/ClassroomHub';
import { ClassroomService } from '../services/api';

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
      createClassroomEnhanced: vi.fn(),
      listMyClassrooms: vi.fn(),
      listClassrooms: vi.fn().mockResolvedValue([]),
      listAssignments: vi.fn(),
      createAssignment: vi.fn(),
      getSubmissions: vi.fn().mockResolvedValue([]),
      getExamLobby: vi.fn(),
      getMyDetails: vi.fn(),
      saveDraft: vi.fn(),
      copilotAsk: vi.fn(),
    },
    CodeExecutionService: {
      execute: vi.fn(),
      streamUrl: vi.fn().mockReturnValue('/api/v1/mock-stream'),
      getResult: vi.fn(),
    },
  };
});

const mockExamList = [
  {
    id: 'exam-asgn-1',
    title: 'Customer Churn Classification Lab Exam',
    course_code: 'CS401',
    duration_minutes: 90,
    problem_type: 'classification',
    dataset_name: 'telecom_churn.csv',
    dataset_id: 'telecom_churn.csv',
    target_column: 'churn',
    feature_columns: ['tenure', 'monthly_charges'],
    description: 'Build and deploy customer churn model.',
    rubric: {
      min_accuracy: 0.8,
      max_latency_ms: 100.0,
      max_score: 100.0,
    },
    starter_code: '# Starter code for lab exam\nimport pandas as pd',
  },
];

describe('Simplified Classroom & Assignment Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Part 1: CreateClassroomModal Simplification', () => {
    it('does NOT contain start time, end time, or exam rubric fields', () => {
      render(
        <CreateClassroomModal
          onClose={vi.fn()}
          onCreated={vi.fn()}
          onOpenProjector={vi.fn()}
        />
      );

      // Verify Title
      expect(screen.getByRole('heading', { name: /create classroom/i })).toBeInTheDocument();

      // Verify Classroom Section fields ARE present
      expect(screen.getByPlaceholderText(/CS401 Lab - Division A/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/CS401-LAB/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Brief section details/i)).toBeInTheDocument();
      expect(screen.getByText(/Require Instructor Approval to Join/i)).toBeInTheDocument();

      // Verify Exam Start/End Time and Exam Rubrics ARE NOT present
      expect(screen.queryByText(/Exam Start Time/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Exam End Time/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Assignment & Automated Rubric/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Starter Code \(Python\)/i)).not.toBeInTheDocument();
    });

    it('submits clean classroom payload and displays 6-char join code', async () => {
      (ClassroomService.createClassroomEnhanced as any).mockResolvedValue({
        id: 'cls-new-123',
        name: 'CS401 Lab Div A',
        course_id: 'CS401',
        join_code: 'ABC890',
      });

      const onCreated = vi.fn();
      render(
        <CreateClassroomModal
          onClose={vi.fn()}
          onCreated={onCreated}
          onOpenProjector={vi.fn()}
        />
      );

      // Fill in classroom name
      const nameInput = screen.getByPlaceholderText(/CS401 Lab - Division A/i);
      fireEvent.change(nameInput, { target: { value: 'CS401 Lab Div A' } });

      // Click Create
      const submitBtn = screen.getByRole('button', { name: /create classroom & generate code/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(ClassroomService.createClassroomEnhanced).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'CS401 Lab Div A',
            require_approval: false,
          })
        );
      });

      // Verify that exam fields were NOT in the payload
      const calledPayload = (ClassroomService.createClassroomEnhanced as any).mock.calls[0][0];
      expect(calledPayload.exam_start_time).toBeUndefined();
      expect(calledPayload.exam_end_time).toBeUndefined();
      expect(calledPayload.rubric_json).toBeUndefined();

      // Verify 6-character Join Code is displayed on screen
      expect(await screen.findByTestId('created-join-code')).toHaveTextContent('ABC890');
    });
  });

  describe('Part 2: Student Assignment Details and Start Flow', () => {
    it('displays assignment card in classroom view, shows details on click, and launches workspace via Start Exam', async () => {
      (ClassroomService.listExams as any).mockResolvedValue(mockExamList);
      (ClassroomService.listAssignments as any).mockResolvedValue([
        {
          id: 'asgn-1',
          title: 'Customer Churn Classification Lab Exam',
          description: 'Build an end-to-end churn model and deploy it to meet minimum 80% accuracy.',
          dataset_id: 'telecom_churn.csv',
          start_date: '2026-10-12T10:00:00Z',
          end_date: '2026-10-12T12:00:00Z',
          rubric: {
            problem_type: 'classification',
            min_accuracy: 0.85,
            max_latency_ms: 100,
            duration_minutes: 90,
            passing_score_percentage: 70,
          },
          max_score: 100,
        },
      ]);
      (ClassroomService.getExamLobby as any).mockResolvedValue({
        classroom_id: 'cls-1',
        can_enter_workspace: true,
      });

      render(<ClassroomHub initialView="classroom" />);

      // Verify Assignment is listed
      expect(await screen.findByText('Customer Churn Classification Lab Exam')).toBeInTheDocument();
      expect(screen.getByText('View Details')).toBeInTheDocument();

      // Click on "View Details"
      fireEvent.click(screen.getByText('View Details'));

      // Verify Assignment Details view appears
      expect(await screen.findByRole('heading', { name: 'Customer Churn Classification Lab Exam' })).toBeInTheDocument();
      expect(screen.getByText(/Problem Statement & Instructions/i)).toBeInTheDocument();
      expect(screen.getByText(/Evaluation Benchmark/i)).toBeInTheDocument();
      expect(screen.getByText(/85% Acc\/F1/i)).toBeInTheDocument();
      expect(screen.getByText(/< 100 ms/i)).toBeInTheDocument();
      expect(screen.getByText(/Back to Assignments/i)).toBeInTheDocument();

      // Verify "Start Exam" / "Start Assignment" button is visible
      const startBtns = screen.getAllByRole('button', { name: /start/i });
      expect(startBtns.length).toBeGreaterThan(0);

      // Click Start Exam (opens Safe Exam Browser pre-flight modal)
      fireEvent.click(startBtns[0]);

      // If Safe Exam Browser pre-flight modal appears, tick consent checkbox then confirm lockdown
      const consentCheckbox = screen.queryByRole('checkbox');
      if (consentCheckbox) {
        fireEvent.click(consentCheckbox);
      }
      const confirmBtn = screen.queryByRole('button', { name: /start exam \(enter lockdown\)|enter lockdown/i });
      if (confirmBtn) {
        fireEvent.click(confirmBtn);
      }

      // Should transition to Student Workspace
      await waitFor(() => {
        expect(screen.getByText(/lab_exam\.py/i)).toBeInTheDocument();
        expect(screen.getByText(/Python 3\.12 \(Scikit-Learn\)/i)).toBeInTheDocument();
      });
    });
  });

  describe('Part 3: Instructor Assignment Creation Form', () => {
    it('includes start_date, end_date, and all rubric options', async () => {
      (ClassroomService.listExams as any).mockResolvedValue(mockExamList);
      (ClassroomService.createAssignment as any).mockResolvedValue({
        id: 'new-asgn-1',
        title: 'New NLP Sentiment Assignment',
      });

      render(<ClassroomHub initialView="instructor" />);

      // Switch to create-assignment tab
      const createTabBtn = screen.getByRole('button', { name: /create assignment/i });
      fireEvent.click(createTabBtn);

      // Verify Assignment Name input
      expect(await screen.findByText(/Assignment Name \*/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Lab Exam 3: Customer Churn/i)).toBeInTheDocument();

      // Verify Start Date & End Date fields
      expect(screen.getByText(/Start Date & Time/i)).toBeInTheDocument();
      expect(screen.getByText(/End Date & Time \/ Deadline/i)).toBeInTheDocument();

      // Verify Problem Type and Dataset
      expect(screen.getByText(/Problem Type/i)).toBeInTheDocument();
      expect(screen.getByText(/Uploaded Dataset/i)).toBeInTheDocument();

      // Verify Advanced Evaluation & Rubric Settings accordion exists
      expect(screen.getByText(/Advanced Evaluation & Rubric Settings/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /publish lab assignment/i })).toBeInTheDocument();
    });
  });

  describe('Part 4: Curriculum Progress Tab Displays Created Assignments', () => {
    it('shows created assignments and omits old generic lessons in Curriculum Progress', async () => {
      (ClassroomService.listExams as any).mockResolvedValue(mockExamList);
      (ClassroomService.listClassrooms as any).mockResolvedValue([
        { id: 'c-100', name: 'Intro to ML Cohort A', course_id: 'CS401' },
      ]);
      (ClassroomService.listAssignments as any).mockResolvedValue([
        {
          id: 'asgn-curr-1',
          classroom_id: 'c-100',
          title: 'Classification Benchmark Lab',
          description: 'Build scikit-learn model with min 85% accuracy.',
          dataset_id: 'telecom_churn.csv',
          rubric: {
            problem_type: 'classification',
            min_accuracy: 0.85,
            max_latency_ms: 80,
            passing_score_percentage: 70,
            duration_minutes: 60,
          },
        },
      ]);
      (ClassroomService.getSubmissions as any).mockResolvedValue([
        { submission_id: 'sub-1', grade_score: 90, status: 'SUBMITTED' },
      ]);

      render(<ClassroomHub initialView="instructor" />);

      // Switch to Curriculum Progress tab
      const curriculumTabBtn = await screen.findByRole('button', { name: /curriculum progress/i });
      fireEvent.click(curriculumTabBtn);

      // Verify old static lesson headers and counters are NOT rendered
      expect(screen.queryByText(/Cohort Student Mastery & Lesson Completion Rates/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Active Cohort Learners/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Module 1/i)).not.toBeInTheDocument();

      // Verify created assignment appears in Curriculum Progress
      expect(await screen.findByText('Classification Benchmark Lab')).toBeInTheDocument();
      expect(screen.getByText(/Build scikit-learn model with min 85% accuracy/i)).toBeInTheDocument();
      expect(screen.getByText('85%')).toBeInTheDocument();
      expect(screen.getByText('80 ms')).toBeInTheDocument();
      expect(screen.getByText('70%')).toBeInTheDocument();
      expect(screen.getByText(/View Submissions & Grades/i)).toBeInTheDocument();
    });
  });
});
