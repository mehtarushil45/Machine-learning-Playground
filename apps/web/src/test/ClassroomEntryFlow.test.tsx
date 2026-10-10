import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClassroomEntryView } from '../features/classrooms/ClassroomEntryView';
import { JoinClassroomModal, normalizeCodeInput } from '../features/classrooms/JoinClassroomModal';
import { StudentDetailsModal } from '../features/classrooms/StudentDetailsModal';
import { ProjectorViewModal } from '../features/classrooms/ProjectorViewModal';
import { ClassroomRosterTab } from '../features/classrooms/ClassroomRosterTab';
import { ClassroomService } from '../services/api';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<any>('../services/api');
  return {
    ...actual,
    ClassroomService: {
      listMyClassrooms: vi.fn(),
      previewJoinCode: vi.fn(),
      joinClassroom: vi.fn(),
      getMyDetails: vi.fn(),
      saveMyDetails: vi.fn(),
      getExamLobby: vi.fn(),
      getRosterPaginated: vi.fn(),
      getRosterExportCsvUrl: vi.fn().mockReturnValue('/api/v1/classrooms/c1/roster/export.csv'),
      resetJoinCode: vi.fn(),
      toggleJoinCode: vi.fn(),
      setMemberApproval: vi.fn(),
      grantTimeExtension: vi.fn(),
      reopenSubmission: vi.fn(),
      removeMember: vi.fn(),
      inspectParticipant: vi.fn(),
    },
  };
});

describe('Classroom Entry & Management Flow (Parts B - G)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Part B & C: Entry Screen & Projector View', () => {
    it('renders Create Classroom, Join Classroom, Resume Exam, and My Classrooms list', async () => {
      (ClassroomService.listMyClassrooms as any).mockResolvedValue({
        owned: [
          {
            id: 'c-owned-1',
            name: 'CS401 ML Lab - Div A',
            course_id: 'CS401',
            role: 'owner',
            status: 'active',
            join_code: '7KM49P',
            join_code_active: true,
            member_count: 42,
            created_at: new Date().toISOString(),
          },
        ],
        joined: [
          {
            id: 'c-joined-1',
            name: 'CS502 Deep Learning Lab',
            course_id: 'CS502',
            role: 'student',
            status: 'in_progress',
            member_count: 35,
            created_at: new Date().toISOString(),
          },
        ],
        active_exam_resume: {
          classroom_id: 'c-joined-1',
          classroom_name: 'CS502 Deep Learning Lab',
          assignment_id: 'asgn-1',
          status: 'in_progress',
        },
      });

      render(
        <ClassroomEntryView
          onOpenClassroom={vi.fn()}
          onResumeExam={vi.fn()}
        />
      );

      // Verify actions
      expect(await screen.findByTestId('create-classroom-btn')).toBeInTheDocument();
      expect(screen.getByTestId('join-classroom-btn')).toBeInTheDocument();

      // Verify Resume exam banner and classroom in list
      expect(screen.getByTestId('resume-exam-banner')).toBeInTheDocument();
      expect(screen.getAllByText('CS502 Deep Learning Lab')).toHaveLength(2);

      // Verify classrooms rendered
      expect(screen.getByText('CS401 ML Lab - Div A')).toBeInTheDocument();
      expect(screen.getByText('7KM49P')).toBeInTheDocument();
    });

    it('renders Projector View modal with massive high-contrast code and student instructions', () => {
      const onClose = vi.fn();
      render(
        <ProjectorViewModal
          joinCode="7KM49P"
          classroomName="CS401 Machine Learning Lab"
          courseId="CS401"
          instructorName="Prof. Alan Turing"
          onClose={onClose}
        />
      );

      const codeDisplay = screen.getByTestId('projector-code-display');
      expect(codeDisplay).toBeInTheDocument();
      expect(codeDisplay).toHaveTextContent('7KM49P');
      expect(screen.getByText(/Student Instructions:/)).toBeInTheDocument();
    });
  });

  describe('Part D: Join Code Normalization and Preview Confirmation', () => {
    it('normalizes code: converts lowercase, strips spaces and hyphens, and converts look-alike Unicode', () => {
      expect(normalizeCodeInput('7km-49p')).toBe('7KM49P');
      expect(normalizeCodeInput('  7 K M 4 9 P  ')).toBe('7KM49P');
      // Cyrillic look-alikes
      expect(normalizeCodeInput('7КМ49Р')).toBe('7KM49P');
    });

    it('previews classroom confirmation before joining and provides uniform error message on failure', async () => {
      (ClassroomService.previewJoinCode as any).mockResolvedValue({
        id: 'c-123',
        name: 'CS401 Machine Learning Lab',
        course_id: 'CS401',
        owner_name: 'Dr. Jane Doe',
        require_approval: false,
      });

      render(
        <JoinClassroomModal
          onClose={vi.fn()}
          onJoined={vi.fn()}
        />
      );

      const input = screen.getByTestId('join-code-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '7km-49p' } });

      // Automatically cleaned to uppercase without hyphens
      expect(input.value).toBe('7KM49P');

      // Confirmation preview shown
      await waitFor(() => {
        expect(screen.getByTestId('join-confirmation-preview')).toBeInTheDocument();
      });
      expect(screen.getByText('CS401 Machine Learning Lab')).toBeInTheDocument();
      expect(screen.getByText('Dr. Jane Doe')).toBeInTheDocument();
      expect(screen.getByTestId('confirm-join-button')).toBeInTheDocument();
    });

    it('displays uniform generic failure message when preview fails', async () => {
      (ClassroomService.previewJoinCode as any).mockRejectedValue(
        new Error("Code not valid or the classroom isn't accepting students")
      );

      render(
        <JoinClassroomModal
          onClose={vi.fn()}
          onJoined={vi.fn()}
        />
      );

      const input = screen.getByTestId('join-code-input');
      fireEvent.change(input, { target: { value: 'BAD123' } });

      await waitFor(() => {
        expect(screen.getByTestId('join-error-banner')).toBeInTheDocument();
      });
      expect(screen.getByText("Code not valid or the classroom isn't accepting students")).toBeInTheDocument();
    });
  });

  describe('Part E: Student Details Gate & Locked State', () => {
    it('renders prefilled details form, requires fields, and shows privacy notice', async () => {
      (ClassroomService.getMyDetails as any).mockResolvedValue({
        classroom_id: 'c-1',
        classroom_name: 'CS401 Lab Exam',
        full_name: 'Rushil Mehta',
        enrollment_number: '',
        division: '',
        batch: '',
        status: 'joined',
        allowed_divisions: ['A', 'B'],
        allowed_batches: ['B1', 'B2'],
        enrollment_format_hint: 'CS2026XXX',
        is_exam_started: false,
        can_edit: true,
      });

      render(
        <StudentDetailsModal
          classroomId="c-1"
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('student-full-name-input')).toBeInTheDocument();
      });

      const nameInput = screen.getByTestId('student-full-name-input') as HTMLInputElement;
      expect(nameInput.value).toBe('Rushil Mehta');

      // Privacy notice
      expect(screen.getByText(/visible only to the classroom instructor/)).toBeInTheDocument();

      // Enrollment number input
      expect(screen.getByTestId('student-enrollment-input')).toBeInTheDocument();
      expect(screen.getByText('CS2026XXX')).toBeInTheDocument();
    });

    it('disables input when exam is started and can_edit is false', async () => {
      (ClassroomService.getMyDetails as any).mockResolvedValue({
        classroom_id: 'c-1',
        classroom_name: 'CS401 Lab Exam',
        full_name: 'Rushil Mehta',
        enrollment_number: 'CS2026042',
        division: 'A',
        batch: 'B1',
        status: 'in_progress',
        allowed_divisions: ['A', 'B'],
        allowed_batches: ['B1', 'B2'],
        is_exam_started: true,
        can_edit: false,
      });

      render(
        <StudentDetailsModal
          classroomId="c-1"
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('student-full-name-input')).toBeDisabled();
      });
      expect(screen.getByTestId('student-enrollment-input')).toBeDisabled();
      expect(screen.getByText(/Details are locked because your exam has already started/)).toBeInTheDocument();
    });
  });

  describe('Part G: Owner Paginated Roster and Controls', () => {
    it('renders paginated roster, join code badge, and export button', async () => {
      (ClassroomService.getRosterPaginated as any).mockResolvedValue({
        items: [
          {
            user_id: 'u-1',
            full_name: 'Aarav Sharma',
            enrollment_number: 'CS2026001',
            division: 'A',
            batch: 'B1',
            status: 'submitted',
            score: 92.5,
            submission_time: new Date().toISOString(),
            last_activity: new Date().toISOString(),
            joined_at: new Date().toISOString(),
            time_extension_minutes: 0,
            is_reopened: false,
          },
        ],
        total: 1,
        page: 1,
        page_size: 25,
        total_pages: 1,
      });

      render(
        <ClassroomRosterTab
          classroom={{
            id: 'c-1',
            name: 'CS401 ML Lab',
            join_code: '7KM49P',
            join_code_active: true,
          }}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('roster-active-code')).toHaveTextContent('7KM49P');
      });

      expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
      expect(screen.getByText('CS2026001')).toBeInTheDocument();
      expect(screen.getByText('SUBMITTED')).toBeInTheDocument();
      expect(screen.getByText('92.5 / 100')).toBeInTheDocument();
      expect(screen.getByText('Export CSV (G2)')).toBeInTheDocument();
      expect(screen.getByText('Projector View (C3)')).toBeInTheDocument();
      expect(screen.getByText('Reset Code (G4)')).toBeInTheDocument();
    });
  });
});
