import React, { useState, useEffect, useRef, useMemo, useCallback, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Rocket,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  FileCode,
  RotateCcw,
  Sparkles,
  Award,
  Layers,
  ChevronDown,
  Cpu,
  Zap,
  Users,
  PlusCircle,
  RefreshCw,
  Lock,
  Shield,
  FileCheck,
  Check,
  GraduationCap,
  Settings,
  Sliders,
  HelpCircle,
  Clock,
  Calendar,
  ArrowLeft,
  ChevronRight,
  FileText,
  BookOpen,
  Table,
  Search,
  X,
  ChevronLeft,
  Database,
} from 'lucide-react';
import {
  ClassroomService,
  type LabExamInfo,
  type LabDeployResponse,
  type LabEvaluateResponse,
  type LabSubmitResponse,
  type SubmissionDashboardItem,
  type ClassroomSummary,
  type ExamViolationReport,
  CodeExecutionService,
} from '../../services/api';
import { ClassroomEntryView } from './ClassroomEntryView';
import { ClassroomRosterTab } from './ClassroomRosterTab';
import { ExamLobbyView } from './ExamLobbyView';
import { StudentDetailsModal } from './StudentDetailsModal';
import { MonacoCodeStudioEditor } from '../pipelines/MonacoCodeStudioEditor';
import { AICopilotDrawer, type ChatMessage } from '../../components/shared/AICopilotDrawer';
import { AuthContext } from '../../providers/AuthContext';
import { useOptionalProject } from '../../providers/ProjectContext';
import { useLearning, PanelLearningCollapsible } from '../learning';
import { useSafeExamBrowser } from './hooks/useSafeExamBrowser';
import { SafeExamConfirmModal } from './components/SafeExamConfirmModal';
import { SafeExamViolationOverlay } from './components/SafeExamViolationOverlay';

/* ── Enterprise Design Tokens ─────────────────────────────────────────── */
const BB = {
  base: '#0B0912',
  surface: '#151026',
  surfaceSubtle: '#1C1534',
  elevated: '#241B42',
  elevatedHover: '#2E2254',
  border: 'rgba(107,92,166,0.22)',
  borderHover: 'rgba(107,92,166,0.48)',
  primary: '#4B3B7C',
  primaryLight: '#7C6BAE',
  primaryGlow: 'rgba(124, 107, 174, 0.25)',
  gold: '#C9A24B',
  goldLight: '#E2BD68',
  text: '#F5F1EC',
  muted: '#9E93B8',
  disabled: '#3D3558',
  success: '#00F5A0',
  warning: '#F59E0B',
  error: '#EF4444',
  cyan: '#00D4FF',
} as const;

const formatISTDateTime = (dateStr?: string | null) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).replace(/am|pm/i, (m) => m.toUpperCase()) + ' IST';
  } catch {
    return dateStr;
  }
};

const formatFriendlyDatasetName = (rawId?: string | null): string => {
  if (!rawId) return 'Assigned Exam Dataset';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(rawId)) {
    const parts = rawId.split('_');
    if (parts.length > 1) return parts.slice(1).join('_');
    return 'Assigned Exam Dataset';
  }
  return rawId;
};

export interface ClassroomHubProps {
  onShowToast?: (title: string, description?: string, type?: 'success' | 'info' | 'error') => void;
  initialView?: 'entry' | 'instructor' | 'student' | 'lobby' | 'classroom';
  /** Called whenever exam lockdown is activated/released — parent can hide sidebar */
  onExamLockChange?: (locked: boolean) => void;
}

export const ClassroomHub: React.FC<ClassroomHubProps> = ({ onShowToast, initialView, onExamLockChange }) => {
  const authCtx = useContext(AuthContext);
  const user = authCtx?.user;
  const project = useOptionalProject();
  const projectDataset = project?.dataset;
  const activeDatasetId = projectDataset?.fileName || projectDataset?.datasetId;

  // Role Detection: faculty, lab coordinator, admin can view Instructor Side
  const isFacultyRole = useMemo(() => {
    if (!user?.role) return true; // Default to full capabilities for demo/review
    const r = user.role.toLowerCase();
    return ['faculty', 'org_admin', 'admin', 'platform_admin', 'platform_owner', 'lab_coordinator', 'reviewer'].includes(r);
  }, [user]);

  // Primary View Mode: 'entry' | 'instructor' | 'student' | 'lobby' | 'classroom'
  const [viewMode, setViewMode] = useState<'entry' | 'instructor' | 'student' | 'lobby' | 'classroom'>(
    initialView || 'student'
  );
  const [activeClassroom, setActiveClassroom] = useState<ClassroomSummary | null>(null);
  const [detailsClassroomId, setDetailsClassroomId] = useState<string | null>(null);

  // Classroom Dashboard (student view): assignments list
  const [classroomAssignments, setClassroomAssignments] = useState<any[]>([]);
  const [isLoadingClassroomAssignments, setIsLoadingClassroomAssignments] = useState(false);
  const [selectedClassroomAssignment, setSelectedClassroomAssignment] = useState<any | null>(null);

  // Instructor Tabs: 'submissions' | 'create-assignment' | 'roster' | 'curriculum'
  const [instructorTab, setInstructorTab] = useState<'submissions' | 'create-assignment' | 'roster' | 'curriculum'>('submissions');
  const [selectedAssignment, setSelectedAssignment] = useState<any | null>(null);
  const [curriculumAssignments, setCurriculumAssignments] = useState<any[]>([]);
  const [curriculumAssignmentsSummary, setCurriculumAssignmentsSummary] = useState<Record<string, { totalSubmissions: number; avgScore: number; passedCount: number }>>({});
  const [isLoadingCurriculum, setIsLoadingCurriculum] = useState(false);

  // Student Workspace State
  const [exams, setExams] = useState<LabExamInfo[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('lab-exam-01');
  const [activeExam, setActiveExam] = useState<LabExamInfo | null>(null);
  const [isLoadingExams, setIsLoadingExams] = useState(true);

  // Student manual coding state
  const [code, setCode] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [registeredModelId, setRegisteredModelId] = useState<string | null>(null);
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  // Lab Deployment State (Singleton In-Place Deployment)
  const [deployment, setDeployment] = useState<LabDeployResponse | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);

  // Live Test Playground inputs & prediction
  const [testInputs, setTestInputs] = useState<Record<string, any>>({});
  const [isPredicting, setIsPredicting] = useState(false);
  const [predictionResult, setPredictionResult] = useState<any | null>(null);

  // Automated Rubric Evaluation Benchmark
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<LabEvaluateResponse | null>(null);

  // Exam Submission
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionReceipt, setSubmissionReceipt] = useState<LabSubmitResponse | null>(null);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);

  // Safe Browser Lock: prevents navigation during active exam
  const [examLocked, setExamLocked] = useState(false);
  // SEB Confirm Modal state
  const [showSebModal, setShowSebModal] = useState(false);
  const [sebPendingExamInfo, setSebPendingExamInfo] = useState<{
    examTitle: string;
    durationMinutes?: number;
    targetCid: string;
    /** Deferred exam state setter — runs on confirm, not on button click */
    applyExamState: () => Promise<void>;
  } | null>(null);
  // SEB Flagged (max violations)
  const [sebFlagged, setSebFlagged] = useState(false);
  // Post-submit release confirm: lockdown stays until student explicitly dismisses
  const [showSebReleaseModal, setShowSebReleaseModal] = useState(false);
  const [pendingReceipt, setPendingReceipt] = useState<any>(null);

  // AI Copilot State (Server Enforced)
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [copilotChat, setCopilotChat] = useState<ChatMessage[]>([]);
  const [isCopilotThinking, setIsCopilotThinking] = useState(false);

  // Instructor State: Classrooms, Submissions
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>('');
  const [submissions, setSubmissions] = useState<SubmissionDashboardItem[]>([]);
  const [isLoadingInstructor, setIsLoadingInstructor] = useState(false);
  const [proctorAlerts, setProctorAlerts] = useState<ExamViolationReport[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('ml_proctor_violations') || '[]');
    } catch {
      return [];
    }
  });

  // Data Preview State (Modal & Pagination)
  const [showDataPreview, setShowDataPreview] = useState(false);
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState(15);
  const [serverPreview, setServerPreview] = useState<{
    file_name: string;
    columns: string[];
    rows: Record<string, any>[];
    row_count: number;
  } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Load preview data when active exam changes or preview modal opens
  useEffect(() => {
    setServerPreview(null);
    if (!selectedExamId || typeof ClassroomService.getExamDatasetPreview !== 'function') return;

    let mounted = true;
    setIsLoadingPreview(true);
    const previewPromise = ClassroomService.getExamDatasetPreview(selectedExamId);
    if (previewPromise && typeof previewPromise.then === 'function') {
      previewPromise
        .then((data) => {
          if (mounted && data) setServerPreview(data);
        })
        .catch((err) => {
          console.debug('Dataset preview fetch error:', err);
        })
        .finally(() => {
          if (mounted) setIsLoadingPreview(false);
        });
    } else {
      setIsLoadingPreview(false);
    }

    return () => {
      mounted = false;
    };
  }, [selectedExamId]);

  // Refetch if modal opened and preview is not yet loaded
  useEffect(() => {
    if (!showDataPreview || !selectedExamId || serverPreview) return;
    let mounted = true;
    setIsLoadingPreview(true);
    ClassroomService.getExamDatasetPreview(selectedExamId)
      .then((data) => {
        if (mounted && data) setServerPreview(data);
      })
      .catch((err) => {
        console.debug('Dataset preview fetch error:', err);
      })
      .finally(() => {
        if (mounted) setIsLoadingPreview(false);
      });

    return () => {
      mounted = false;
    };
  }, [showDataPreview, selectedExamId, serverPreview]);

  const activePreviewData = useMemo(() => {
    if (serverPreview && serverPreview.rows && serverPreview.rows.length > 0) {
      return {
        fileName: serverPreview.file_name,
        columns: serverPreview.columns,
        rows: serverPreview.rows,
        rowCount: serverPreview.row_count,
      };
    }
    return null;
  }, [serverPreview]);

  const filteredPreviewRows = useMemo(() => {
    if (!activePreviewData) return [];
    if (!previewSearch.trim()) return activePreviewData.rows;
    const q = previewSearch.toLowerCase();
    return activePreviewData.rows.filter((row) =>
      Object.values(row).some((val) => String(val ?? '').toLowerCase().includes(q))
    );
  }, [activePreviewData, previewSearch]);

  const totalPreviewPages = Math.max(1, Math.ceil(filteredPreviewRows.length / previewPageSize));
  const paginatedPreviewRows = useMemo(() => {
    const start = (previewPage - 1) * previewPageSize;
    return filteredPreviewRows.slice(start, start + previewPageSize);
  }, [filteredPreviewRows, previewPage, previewPageSize]);

  // Manual Grading Modal State
  const [gradingSubmission, setGradingSubmission] = useState<SubmissionDashboardItem | null>(null);
  const [manualScore, setManualScore] = useState<number>(85);
  const [gradingComments, setGradingComments] = useState<string>('');
  const [isSavingGrade, setIsSavingGrade] = useState(false);

  // Create Assignment Form State
  const [newAssignmentTitle, setNewAssignmentTitle] = useState('');
  const [newAssignmentDesc, setNewAssignmentDesc] = useState('');
  const [newAssignmentStartDate, setNewAssignmentStartDate] = useState('');
  const [newAssignmentEndDate, setNewAssignmentEndDate] = useState('');
  const [newAssignmentType, setNewAssignmentType] = useState('classification');
  const [newAssignmentDataset, setNewAssignmentDataset] = useState(activeDatasetId || '');

  useEffect(() => {
    if (activeDatasetId) {
      setNewAssignmentDataset(activeDatasetId);
    }
  }, [activeDatasetId]);

  // Helper: Format ISO date string for display
  const formatExamDate = useCallback((dateStr?: string | null): string => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }, []);
  // Advanced Evaluation & Rubric Options State
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [evalMinMetric, setEvalMinMetric] = useState(true);
  const [newAssignmentMinAcc, setNewAssignmentMinAcc] = useState('0.80');
  const [evalMaxLat, setEvalMaxLat] = useState(true);
  const [newAssignmentMaxLat, setNewAssignmentMaxLat] = useState('100.0');
  const [evalGuardrails, setEvalGuardrails] = useState(true);
  const [newAssignmentDuration, setNewAssignmentDuration] = useState('90');
  const [newAssignmentPassingScore, setNewAssignmentPassingScore] = useState('60');

  const { setLearningAidsAllowed } = useLearning();

  const eventSourceRef = useRef<EventSource | null>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // ── Safe Exam Browser Hook & Proctor Security Monitoring ───────────────────
  const studentDisplayName = authCtx?.user?.full_name || authCtx?.user?.email?.split('@')[0] || 'Active Student';
  const studentEmail = authCtx?.user?.email || 'student@university.edu';

  const seb = useSafeExamBrowser(
    examLocked,
    (count) => {
      const isRedAlert = count >= 3;
      const violationPayload: ExamViolationReport = {
        exam_id: selectedExamId || 'active-exam',
        student_name: studentDisplayName,
        student_email: studentEmail,
        student_id: authCtx?.user?.id,
        violation_count: count,
        flagged: isRedAlert,
        alert_type: isRedAlert ? 'RED_ALERT' : 'WARNING',
        reason: 'Tab switch or window blur detected during exam',
        timestamp: new Date().toISOString(),
      };

      // 1. Report to Backend Proctor Integrity Service
      if (selectedExamId) {
        ClassroomService.reportExamViolation?.(selectedExamId, violationPayload)?.catch?.(() => {});
      }

      // 2. Persist locally & broadcast live proctor alert to instructors
      try {
        const stored = JSON.parse(localStorage.getItem('ml_proctor_violations') || '[]');
        stored.unshift(violationPayload);
        localStorage.setItem('ml_proctor_violations', JSON.stringify(stored.slice(0, 50)));
      } catch {}

      window.dispatchEvent(new CustomEvent('ml-exam-proctor-alert', { detail: violationPayload }));

      // 3. User feedback
      if (isRedAlert) {
        setSebFlagged(true);
        onShowToast?.(
          `🚨 RED ALERT — Session Flagged!`,
          `Student '${studentDisplayName}' reached maximum allowed tab switches (3/3). Instructor flagged for cheating review.`,
          'error',
        );
      } else {
        onShowToast?.(
          `⚠️ Violation Warning (${count}/3)`,
          `Tab switch detected for ${studentDisplayName}. Instructor and proctors notified.`,
          'error',
        );
      }
    },
    () => {
      setSebFlagged(true);
    },
  );

  // Instructor Live Proctor Alert Event Listener
  useEffect(() => {
    const handleProctorEvent = (e: Event) => {
      const custom = e as CustomEvent<ExamViolationReport>;
      if (custom.detail) {
        setProctorAlerts((prev) => [custom.detail, ...prev.filter(p => p.timestamp !== custom.detail.timestamp)].slice(0, 50));
        if (viewMode === 'instructor') {
          if (custom.detail.alert_type === 'RED_ALERT' || custom.detail.flagged) {
            onShowToast?.(
              `🚨 PROCTOR RED ALERT: ${custom.detail.student_name}`,
              `Student '${custom.detail.student_name}' reached 3 tab switches — exam session FLAGGED!`,
              'error',
            );
          } else {
            onShowToast?.(
              `⚠️ Proctor Alert: ${custom.detail.student_name}`,
              `Student '${custom.detail.student_name}' switched tabs during exam (Violation ${custom.detail.violation_count}/3).`,
              'error',
            );
          }
        }
      }
    };

    window.addEventListener('ml-exam-proctor-alert', handleProctorEvent);
    return () => window.removeEventListener('ml-exam-proctor-alert', handleProctorEvent);
  }, [viewMode, onShowToast]);

  // Sync recent violations from backend when entering instructor mode
  useEffect(() => {
    if (viewMode === 'instructor') {
      ClassroomService.getRecentViolations?.()
        .then((remoteAlerts) => {
          if (Array.isArray(remoteAlerts) && remoteAlerts.length > 0) {
            setProctorAlerts((prev) => {
              const combined = [...remoteAlerts, ...prev];
              const map = new Map();
              for (const item of combined) {
                const key = `${item.student_name}_${item.timestamp}_${item.violation_count}`;
                if (!map.has(key)) map.set(key, item);
              }
              return Array.from(map.values()).slice(0, 50);
            });
          }
        })
        .catch(() => {});
    }
  }, [viewMode]);

  // Notify parent (App) whenever lockdown state changes so sidebar can be hidden
  useEffect(() => {
    onExamLockChange?.(examLocked);
  }, [examLocked, onExamLockChange]);

  // 1. Initial Load: Exams & Student Session
  useEffect(() => {
    let mounted = true;
    async function loadExams() {
      try {
        setIsLoadingExams(true);
        const data = await ClassroomService.listExams(activeDatasetId);
        if (mounted) {
          setExams(data);
          if (data.length > 0) {
            const initial = data.find((e) => e.id === selectedExamId) || data[0];
            setActiveExam(initial);
            setSelectedExamId(initial.id);
            setCode('');
            setLearningAidsAllowed(initial.learning_aids_enabled ?? true);

            // Fetch active session state for this exam
            try {
              const sess = await ClassroomService.getSession(initial.id);
              if (sess?.code_draft) setCode(sess.code_draft);
              if (sess?.active_deployment_id) {
                try {
                  const depData = await ClassroomService.getLabDeployment(initial.id);
                  if (depData) {
                    setDeployment(depData as any);
                    if (depData.sample_inputs && Object.keys(depData.sample_inputs).length > 0) {
                      setTestInputs(depData.sample_inputs);
                    }
                  }
                } catch (depErr) {
                  console.debug('Session deployment restore notice:', depErr);
                }
              }
              if (sess?.status === 'SUBMITTED' && sess?.submission_receipt) {
                setSubmissionReceipt({
                  submission_id: sess.submission_receipt.submission_id || 'sub-locked',
                  status: 'SUBMITTED',
                  grade_score: sess.grade_score || 85.0,
                  percentage: sess.grade_score || 85.0,
                  passed: (sess.grade_score || 0) >= 60.0,
                  submitted_at: sess.submitted_at || new Date().toISOString(),
                  code_sha256: sess.submission_receipt.code_sha256,
                  model_sha256: sess.submission_receipt.model_sha256,
                  rubric_snapshot: sess.submission_receipt.rubric_snapshot,
                  guardrail_flags: sess.submission_receipt.guardrail_flags || [],
                  message: 'Exam submission locked.',
                });
              }
            } catch (sessErr) {
              console.debug('Session load notice:', sessErr);
            }
          }
        }
      } catch (err: any) {
        onShowToast?.('Failed to load lab exams', err.message, 'error');
      } finally {
        if (mounted) setIsLoadingExams(false);
      }
    }
    loadExams();
    return () => {
      mounted = false;
    };
  }, [activeDatasetId]);

  // 2. Load Instructor Data
  const loadInstructorData = useCallback(async () => {
    setIsLoadingInstructor(true);
    try {
      const clsList = await ClassroomService.listClassrooms().catch(() => []);
      setClassrooms(clsList);

      // Prefer activeClassroom (the one the instructor clicked into), otherwise fall back to first
      const activeCls =
        (activeClassroom && clsList.find((c: any) => c.id === activeClassroom.id)) ||
        clsList[0];

      if (activeCls) {
        setSelectedClassroomId(activeCls.id);
        const asgnList = await ClassroomService.listAssignments(activeCls.id).catch(() => []);
        setClassroomAssignments(asgnList || []);
        setCurriculumAssignments(asgnList || []);

        if (asgnList.length > 0) {
          const asgnToSelect = selectedAssignment && asgnList.some((a: any) => a.id === selectedAssignment.id)
            ? selectedAssignment
            : asgnList[0];
          setSelectedAssignment(asgnToSelect);
          const subData = await ClassroomService.getSubmissions(asgnToSelect.id).catch(() => []);
          setSubmissions(subData);
        } else {
          setSubmissions([]);
          setSelectedAssignment(null);
        }
      }
    } catch (err: any) {
      console.debug('Instructor data fetch notice:', err);
    } finally {
      setIsLoadingInstructor(false);
    }
  }, [activeClassroom, selectedAssignment]);

  // Load assignments when in classroom view mode
  useEffect(() => {
    let mounted = true;
    if (viewMode === 'classroom') {
      const cid = activeClassroom?.id || selectedClassroomId;
      setIsLoadingClassroomAssignments(true);
      ClassroomService.listAssignments(cid || undefined)
        .then((asgns) => {
          if (mounted) setClassroomAssignments(asgns || []);
        })
        .catch(() => {
          if (mounted) setClassroomAssignments([]);
        })
        .finally(() => {
          if (mounted) setIsLoadingClassroomAssignments(false);
        });
    }
    return () => {
      mounted = false;
    };
  }, [viewMode, activeClassroom?.id, selectedClassroomId]);

  const loadCurriculumProgress = useCallback(async () => {
    const targetClassroomId = selectedClassroomId || activeClassroom?.id || classrooms[0]?.id;
    if (!targetClassroomId) return;
    setIsLoadingCurriculum(true);
    try {
      const asgns = await ClassroomService.listAssignments(targetClassroomId).catch(() => []);
      setCurriculumAssignments(asgns || []);
      setClassroomAssignments(asgns || []);

      const summaryMap: Record<string, { totalSubmissions: number; avgScore: number; passedCount: number }> = {};
      await Promise.all(
        asgns.map(async (asgn: any) => {
          try {
            const subs = await ClassroomService.getSubmissions(asgn.id).catch(() => []);
            const validScores = subs.filter((s: any) => s.grade_score !== null && s.grade_score !== undefined);
            const sumScore = validScores.reduce((acc: number, s: any) => acc + (s.grade_score || 0), 0);
            const avg = validScores.length > 0 ? Math.round((sumScore / validScores.length) * 10) / 10 : 0;
            const passingScore = asgn.rubric?.passing_score_percentage ?? 60.0;
            const passed = subs.filter((s: any) => (s.grade_score ?? 0) >= passingScore).length;

            summaryMap[asgn.id] = {
              totalSubmissions: subs.length,
              avgScore: avg,
              passedCount: passed,
            };
          } catch {
            summaryMap[asgn.id] = { totalSubmissions: 0, avgScore: 0, passedCount: 0 };
          }
        })
      );
      setCurriculumAssignmentsSummary(summaryMap);
    } catch (err: any) {
      console.error('Failed to load curriculum progress:', err);
    } finally {
      setIsLoadingCurriculum(false);
    }
  }, [selectedClassroomId, activeClassroom?.id, classrooms]);

  useEffect(() => {
    if (viewMode === 'instructor') {
      loadInstructorData();
    }
  }, [viewMode, loadInstructorData]);

  // 3. Switch Exam Handler
  const handleSelectExam = async (examId: string) => {
    const target = exams.find((e) => e.id === examId);
    if (!target) return;
    setSelectedExamId(examId);
    setActiveExam(target);
    setCode('');
    setServerPreview(null);
    setDeployment(null);
    setTestInputs({});
    setEvaluationResult(null);
    setPredictionResult(null);
    setRegisteredModelId(null);
    setOutputLines([`[System] Switched to ${target.title}.`]);
    setLearningAidsAllowed(target.learning_aids_enabled ?? true);

    try {
      const localDraft = localStorage.getItem(`ml_classroom_draft_${examId}`);
      if (localDraft) {
        setCode(localDraft);
      }
      const sess = await ClassroomService.getSession(examId);
      if (sess?.code_draft && !localDraft) setCode(sess.code_draft);
      if (sess?.active_deployment_id) {
        try {
          const depData = await ClassroomService.getLabDeployment(examId);
          if (depData) {
            setDeployment(depData as any);
            if (depData.sample_inputs && Object.keys(depData.sample_inputs).length > 0) {
              setTestInputs(depData.sample_inputs);
            }
          }
        } catch {
          // ignore
        }
      }
      if (sess?.status === 'SUBMITTED' && sess?.submission_receipt) {
        setSubmissionReceipt({
          submission_id: sess.submission_receipt.submission_id || 'sub-locked',
          status: 'SUBMITTED',
          grade_score: sess.grade_score || 85.0,
          percentage: sess.grade_score || 85.0,
          passed: (sess.grade_score || 0) >= 60.0,
          submitted_at: sess.submitted_at || new Date().toISOString(),
          code_sha256: sess.submission_receipt.code_sha256,
          model_sha256: sess.submission_receipt.model_sha256,
          rubric_snapshot: sess.submission_receipt.rubric_snapshot,
          guardrail_flags: sess.submission_receipt.guardrail_flags || [],
          message: 'Exam submission locked.',
        });
      }
    } catch {
      // Ignored
    }
  };

  // 4. Auto-save Draft Code to Server (Debounced E3)
  useEffect(() => {
    if (!selectedExamId || submissionReceipt || !code) return;
    try {
      localStorage.setItem(`ml_classroom_draft_${selectedExamId}`, code);
    } catch {}
    const timer = setTimeout(async () => {
      try {
        const res = await ClassroomService.saveDraft(selectedExamId, code);
        setDraftSavedAt(new Date(res.saved_at).toLocaleTimeString());
      } catch {
        // Ignored in autosave
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [code, selectedExamId, submissionReceipt]);

  // 5. Code Execution in Isolated Sandbox
  const handleRunCode = async () => {
    if (!code.trim()) {
      onShowToast?.('No Code to Run', 'Please write Python code before running.', 'info');
      return;
    }

    setIsExecuting(true);
    setOutputLines((prev) => [
      ...prev,
      '─────────────────────────────────────────────────────────────',
      `[${new Date().toLocaleTimeString()}] Starting sandboxed execution for ${activeExam?.title || 'Lab Exam'}...`,
    ]);

    try {
      const exec = await CodeExecutionService.execute({
        code,
        filename: 'lab_exam.py',
        dataset_id: activeExam?.dataset_id || activeDatasetId || '',
        timeout: 90,
      });

      if (eventSourceRef.current) eventSourceRef.current.close();
      const sse = new EventSource(CodeExecutionService.streamUrl(exec.exec_id));
      eventSourceRef.current = sse;

      let executionFinished = false;

      sse.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'stdout' || data.type === 'stderr' || data.type === 'system') {
            const text = data.data ?? data.line ?? '';
            if (text) {
              const lines = String(text).split('\n');
              setOutputLines((prev) => [...prev, ...lines]);
            }
          } else if (data.type === 'exit') {
            executionFinished = true;
            setIsExecuting(false);
            if (data.status === 'completed' || data.exit_code === 0) {
              setOutputLines((prev) => [
                ...prev,
                `[ML Playground] Execution completed in ${data.duration_seconds?.toFixed(2) || '0.00'}s.`,
              ]);
              if (data.model_id) {
                setRegisteredModelId(data.model_id);
                setOutputLines((prev) => [
                  ...prev,
                  `[Artifact] Registered model pipeline: ${data.model_id}`,
                  `[Ready] Model is ready for in-place deployment to your lab slot!`,
                ]);
                onShowToast?.('Model Artifact Created!', 'Click "Deploy to Lab Slot" to activate your model.', 'success');
              }
            } else {
              setOutputLines((prev) => [
                ...prev,
                `[Execution Error] ${data.error || `Process exited with code ${data.exit_code}`}`,
              ]);
              onShowToast?.('Execution Failed', data.error || 'Check terminal for traceback.', 'error');
            }
          } else if (data.line) {
            setOutputLines((prev) => [...prev, data.line]);
          } else if (data.data) {
            setOutputLines((prev) => [...prev, String(data.data)]);
          }
        } catch {
          if (event.data) setOutputLines((prev) => [...prev, String(event.data)]);
        }
      };

      sse.onerror = async () => {
        sse.close();
        if (executionFinished) return;

        let attempts = 0;
        const maxAttempts = 15;
        const poll = async () => {
          try {
            const result = await CodeExecutionService.getResult(exec.exec_id);
            if (result.status === 'completed') {
              executionFinished = true;
              setIsExecuting(false);
              setOutputLines((prev) => [
                ...prev,
                `[ML Playground] Execution completed in ${result.duration_seconds?.toFixed(2) || '0.00'}s.`,
              ]);
              if (result.model_id) {
                setRegisteredModelId(result.model_id);
                setOutputLines((prev) => [
                  ...prev,
                  `[Artifact] Registered model pipeline: ${result.model_id}`,
                  `[Ready] Model is ready for in-place deployment to your lab slot!`,
                ]);
                onShowToast?.('Model Artifact Created!', 'Click "Deploy to Lab Slot" to activate your model.', 'success');
              }
              return;
            } else if (result.status === 'failed') {
              executionFinished = true;
              setIsExecuting(false);
              setOutputLines((prev) => [
                ...prev,
                `[Execution Error] ${result.error || result.stderr || 'Execution failed.'}`,
              ]);
              onShowToast?.('Execution Failed', result.error || 'Check terminal for traceback.', 'error');
              return;
            }

            attempts++;
            if (attempts < maxAttempts) {
              setTimeout(poll, 600);
            } else {
              setIsExecuting(false);
            }
          } catch {
            setIsExecuting(false);
          }
        };
        poll();
      };
    } catch (err: any) {
      setIsExecuting(false);
      setOutputLines((prev) => [...prev, `[Fatal Error] ${err.message}`]);
      onShowToast?.('Execution Error', err.message, 'error');
    }
  };

  // 6. Deploy / In-Place Redeploy Model (Singleton Guarantee)
  const handleDeploy = async () => {
    if (!selectedExamId) return;
    setIsDeploying(true);
    try {
      const effectiveDatasetId = activeExam?.dataset_id || activeExam?.dataset_name || activeDatasetId || undefined;
      const depRes = await ClassroomService.deployModel(selectedExamId, registeredModelId || undefined, code, effectiveDatasetId);
      setDeployment(depRes);

      if (depRes.sample_inputs && Object.keys(depRes.sample_inputs).length > 0) {
        setTestInputs(depRes.sample_inputs);
      }

      if (depRes.is_updated_in_place) {
        onShowToast?.(
          'Model Updated In-Place!',
          `Deployment slot hot-reloaded with new weights (v${depRes.version_count}.0). Zero duplicate instances created.`,
          'success'
        );
        setOutputLines((prev) => [
          ...prev,
          `[Deployment Hot-Reload] Successfully updated in-place deployment ${depRes.deployment_id} (Version v${depRes.version_count}.0).`,
        ]);
      } else {
        onShowToast?.(
          'Model Deployed!',
          `Serving endpoint allocated for ${activeExam?.title}. You can now test live inference.`,
          'success'
        );
        setOutputLines((prev) => [
          ...prev,
          `[Deployment Created] Endpoint active: ${depRes.endpoint_path}`,
        ]);
      }
    } catch (err: any) {
      const errMsg = err.message || 'Could not instantiate serving slot.';
      onShowToast?.('Deployment Failed', errMsg, 'error');
      setOutputLines((prev) => [...prev, `[Deployment Error] ${errMsg}`]);
    } finally {
      setIsDeploying(false);
    }
  };

  // 7. Interactive Prediction Test
  const handleTestPrediction = async () => {
    if (!deployment?.deployment_id) return;
    setIsPredicting(true);
    setPredictionResult(null);
    try {
      // Coerce inputs according to deployment schema types and expected features
      const formattedInputs: Record<string, any> = {};
      const depAny = deployment as any;
      const expectedKeys = depAny.feature_columns?.length
        ? depAny.feature_columns
        : Object.keys(deployment.input_schema || deployment.sample_inputs || testInputs);

      for (const k of expectedKeys) {
        const rawVal = testInputs[k] !== undefined && testInputs[k] !== '' ? testInputs[k] : deployment.sample_inputs?.[k];
        const schemaType = deployment.input_schema?.[k]?.type || 'numeric';
        if (schemaType === 'numeric') {
          if (typeof rawVal === 'number' && !isNaN(rawVal)) {
            formattedInputs[k] = rawVal;
          } else if (typeof rawVal === 'string' && rawVal.trim() !== '' && !isNaN(Number(rawVal))) {
            formattedInputs[k] = Number(rawVal);
          } else {
            formattedInputs[k] = deployment.sample_inputs?.[k] ?? 0;
          }
        } else {
          formattedInputs[k] = String(rawVal ?? deployment.sample_inputs?.[k] ?? '');
        }
      }

      // Also preserve any extra keys that the student typed
      for (const [k, v] of Object.entries(testInputs)) {
        if (!(k in formattedInputs) && v !== '' && v !== undefined) {
          formattedInputs[k] = typeof v === 'number' ? v : !isNaN(Number(v)) ? Number(v) : String(v);
        }
      }

      const res = await ClassroomService.predictModel(selectedExamId, deployment.deployment_id, formattedInputs);
      setPredictionResult(res);
    } catch (err: any) {
      onShowToast?.('Inference Error', err.message, 'error');
    } finally {
      setIsPredicting(false);
    }
  };

  // 8. Automated Rubric Benchmark Evaluation
  const handleEvaluateRubric = async () => {
    if (!deployment?.deployment_id || !selectedExamId) {
      onShowToast?.('Deploy Model First', 'You must deploy your model before running benchmark evaluation.', 'info');
      return;
    }
    setIsEvaluating(true);
    try {
      const res = await ClassroomService.evaluateModel(selectedExamId, deployment.deployment_id);
      setEvaluationResult(res);
      if (res.passed) {
        onShowToast?.('Benchmark Passed!', `Score: ${res.score}/${res.max_score} (${res.percentage}%)`, 'success');
      } else {
        onShowToast?.('Benchmark Incomplete', `Score: ${res.score}/${res.max_score}. Review criteria details.`, 'info');
      }
    } catch (err: any) {
      onShowToast?.('Evaluation Failed', err.message, 'error');
    } finally {
      setIsEvaluating(false);
    }
  };

  // 9. Final Exam Submission
  const handleSubmitExam = async () => {
    if (!selectedExamId) return;
    setIsSubmitting(true);
    try {
      const receipt = await ClassroomService.submitExam(
        selectedExamId,
        code,
        deployment?.deployment_id,
        seb.violations,
        sebFlagged,
      );
      setShowConfirmSubmit(false);
      setOutputLines((prev) => [
        ...prev,
        '─────────────────────────────────────────────────────────────',
        `[Submission Recorded] Final Grade: ${receipt.grade_score}/100 | Status: ${receipt.passed ? 'PASSED' : 'COMPLETED'}`,
        `[Immutable Verification] Exam submission cryptographically sealed and recorded.`,
        `[Status] ${receipt.status}`,
      ]);
      onShowToast?.('Lab Exam Submitted!', 'Confirm below to exit lockdown and return to normal mode.', 'success');
      // Store receipt and show the post-submit release confirm modal if in lockdown mode
      setSubmissionReceipt(receipt);
      setPendingReceipt(receipt);
      if (examLocked) {
        setShowSebReleaseModal(true);
      }
    } catch (err: any) {
      const errMsg = err.message || 'Submission failed.';
      onShowToast?.('Submission Error', errMsg, 'error');
      setOutputLines((prev) => [...prev, `[Submission Error] ${errMsg}`]);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset & Unlock Lab Exam Session (Practice/Instructor Mode)
  const handleResetSession = async () => {
    if (!selectedExamId) return;
    try {
      await ClassroomService.resetSession(selectedExamId);
      setSubmissionReceipt(null);
      setDeployment(null);
      setEvaluationResult(null);
      setPredictionResult(null);
      setCode('');
      setOutputLines((prev) => [
        ...prev,
        '─────────────────────────────────────────────────────────────',
        `[Session Reset] Lab exam unlocked. Ready for implementation.`,
      ]);
      onShowToast?.('Lab Exam Unlocked', 'Session reset to active. You can now edit code, run, deploy, and evaluate.', 'success');
    } catch (err: any) {
      onShowToast?.('Reset Failed', err.message, 'error');
    }
  };

  // 10. AI Copilot Chat Handler (Server-Enforced)
  const handleSendCopilotMessage = async (promptText?: string) => {
    const textToSend = (promptText || '').trim();
    if (!textToSend || !selectedExamId) return;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text: textToSend };
    setCopilotChat((prev) => [...prev, userMsg]);
    setIsCopilotThinking(true);

    try {
      const res = await ClassroomService.copilotAsk(selectedExamId, textToSend, code);
      const assistantMsg: ChatMessage = { id: `a-${Date.now()}`, role: 'assistant', text: res.reply };
      setCopilotChat((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errReply = err.message || 'Copilot query blocked by server policy.';
      setCopilotChat((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: 'assistant', text: `🛑 [Server Policy] ${errReply}` },
      ]);
      onShowToast?.('Copilot Request Blocked', errReply, 'error');
    } finally {
      setIsCopilotThinking(false);
    }
  };


  // 12. Instructor: Manual Grade Submit (B6)
  const handleSaveManualGrade = async () => {
    if (!gradingSubmission) return;
    setIsSavingGrade(true);
    try {
      await ClassroomService.gradeSubmission(gradingSubmission.submission_id, {
        score: manualScore,
        comments: gradingComments,
      });
      onShowToast?.('Grade & Feedback Recorded', `Updated score to ${manualScore}/100.`, 'success');
      setGradingSubmission(null);
      // Refresh submissions
      if (selectedClassroomId) {
        const asgns = await ClassroomService.listAssignments(selectedClassroomId);
        if (asgns.length > 0) {
          const updatedSubs = await ClassroomService.getSubmissions(asgns[0].id);
          setSubmissions(updatedSubs);
        }
      }
    } catch (err: any) {
      onShowToast?.('Grade Update Failed', err.message, 'error');
    } finally {
      setIsSavingGrade(false);
    }
  };

  // 13. Instructor: Create Assignment Submit
  const handleCreateAssignment = async () => {
    const targetClassroomId = selectedClassroomId || activeClassroom?.id || classrooms[0]?.id;
    if (!targetClassroomId || !newAssignmentTitle.trim()) {
      onShowToast?.('Missing Fields', 'Please select a classroom and enter an assignment title.', 'info');
      return;
    }
    try {
      await ClassroomService.createAssignment({
        classroom_id: targetClassroomId,
        title: newAssignmentTitle.trim(),
        description: newAssignmentDesc.trim() || 'Practical ML Lab Exam',
        dataset_id: newAssignmentDataset,
        start_date: newAssignmentStartDate ? new Date(newAssignmentStartDate).toISOString() : undefined,
        end_date: newAssignmentEndDate ? new Date(newAssignmentEndDate).toISOString() : undefined,
        rubric: {
          problem_type: newAssignmentType,
          evaluate_min_metric: evalMinMetric,
          min_accuracy: evalMinMetric ? (parseFloat(newAssignmentMinAcc) || 0.8) : 0.0,
          evaluate_max_latency: evalMaxLat,
          max_latency_ms: evalMaxLat ? (parseFloat(newAssignmentMaxLat) || 100.0) : 9999.0,
          evaluate_guardrails: evalGuardrails,
          duration_minutes: parseInt(newAssignmentDuration, 10) || 90,
          passing_score_percentage: parseFloat(newAssignmentPassingScore) || 60.0,
          start_date: newAssignmentStartDate ? new Date(newAssignmentStartDate).toISOString() : undefined,
          end_date: newAssignmentEndDate ? new Date(newAssignmentEndDate).toISOString() : undefined,
        },
        max_score: 100.0,
        learning_aids_enabled: false,
      });

      onShowToast?.('Assignment Published!', 'Students enrolled in this classroom can now access the lab exam.', 'success');
      setNewAssignmentTitle('');
      setNewAssignmentDesc('');
      setNewAssignmentStartDate('');
      setNewAssignmentEndDate('');
      setInstructorTab('curriculum');
      loadInstructorData();
      loadCurriculumProgress();
    } catch (err: any) {
      onShowToast?.('Failed to Create Assignment', err.message, 'error');
    }
  };

  if (viewMode === 'entry') {
    return (
      <div className="space-y-3 pt-0">
        <ClassroomEntryView
          onOpenClassroom={async (cls, role) => {
            setActiveClassroom(cls);
            setSelectedClassroomId(cls.id);
            if (role === 'owner') {
              setViewMode('instructor');
              setInstructorTab('roster');
            } else {
              // For students: check details, then show the classroom dashboard
              try {
                const details = await ClassroomService.getMyDetails(cls.id);
                if (!details.enrollment_number) {
                  setDetailsClassroomId(cls.id);
                  return;
                }
              } catch {
                // Ignore — allow entry even if details fetch fails
              }
              // Load assignments for this classroom
              setIsLoadingClassroomAssignments(true);
              setClassroomAssignments([]);
              setSelectedClassroomAssignment(null);
              setViewMode('classroom');
              try {
                const asgns = await ClassroomService.listAssignments(cls.id);
                setClassroomAssignments(asgns || []);
              } catch {
                setClassroomAssignments([]);
              } finally {
                setIsLoadingClassroomAssignments(false);
              }
            }
          }}
          onResumeExam={(resumeInfo) => {
            setSelectedClassroomId(resumeInfo.classroom_id);
            setViewMode('student');
          }}
          onShowToast={onShowToast}
        />
        {detailsClassroomId && (
          <StudentDetailsModal
            classroomId={detailsClassroomId}
            onClose={() => setDetailsClassroomId(null)}
            onSaved={async () => {
              const cid = detailsClassroomId;
              setDetailsClassroomId(null);
              // After saving details, go to the classroom dashboard
              setIsLoadingClassroomAssignments(true);
              setClassroomAssignments([]);
              setSelectedClassroomAssignment(null);
              setViewMode('classroom');
              try {
                const asgns = await ClassroomService.listAssignments(cid!);
                setClassroomAssignments(asgns || []);
              } catch {
                setClassroomAssignments([]);
              } finally {
                setIsLoadingClassroomAssignments(false);
              }
            }}
            onShowToast={onShowToast}
          />
        )}
      </div>
    );
  }

  if (viewMode === 'lobby') {
    return (
      <div className="space-y-3 pt-0">
        <div className="flex items-center justify-between border-b border-[rgba(107,92,166,0.2)] pb-2">
          <button
            onClick={() => setViewMode('entry')}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#1C1534] hover:bg-[#241B42] text-[#9E93B8] hover:text-white transition-colors border border-[rgba(107,92,166,0.3)]"
          >
            ← Back to All Classrooms
          </button>
        </div>
        <ExamLobbyView
          classroomId={activeClassroom?.id || selectedClassroomId || 'cls-default'}
          onEnterWorkspace={() => setViewMode('student')}
          onShowToast={onShowToast}
        />
      </div>
    );
  }

  // ── Safe Exam Browser — Pre-flight Confirmation Modal Helper ──
  const renderSebModal = () => {
    if (!showSebModal || !sebPendingExamInfo) return null;
    return (
      <SafeExamConfirmModal
        examTitle={sebPendingExamInfo.examTitle}
        durationMinutes={sebPendingExamInfo.durationMinutes}
        onConfirm={async () => {
          await seb.acquireFullscreen();
          await sebPendingExamInfo.applyExamState();
          if (sebPendingExamInfo.targetCid) {
            ClassroomService.enterExamWorkspace(sebPendingExamInfo.targetCid).catch(() => {});
          }
          setExamLocked(true);
          setSebFlagged(false);
          setViewMode('student');
          setShowSebModal(false);
          setSebPendingExamInfo(null);
        }}
        onCancel={() => {
          setShowSebModal(false);
          setSebPendingExamInfo(null);
        }}
      />
    );
  };

  // ── Classroom Dashboard: Student sees their assignments or assignment details ──
  if (viewMode === 'classroom') {
    return (
      <div className="space-y-4 pt-0">
        {/* Nav Bar */}
        <div className="flex items-center justify-between border-b border-[rgba(107,92,166,0.2)] pb-2 flex-wrap gap-2">
          <button
            onClick={() => {
              if (selectedClassroomAssignment) {
                setSelectedClassroomAssignment(null);
              } else {
                setViewMode('entry');
              }
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#1C1534] hover:bg-[#241B42] text-[#9E93B8] hover:text-white transition-colors border border-[rgba(107,92,166,0.3)] flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{selectedClassroomAssignment ? 'Back to Assignments' : 'Back to All Classrooms'}</span>
          </button>
          {activeClassroom && (
            <div className="text-xs font-mono text-[#00D4FF]">
              Classroom: <strong className="text-[#F5F1EC]">{activeClassroom.name}</strong>
            </div>
          )}
          {isFacultyRole && (
            <button
              onClick={() => { setViewMode('instructor'); setInstructorTab('submissions'); }}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#241B42] text-[#00D4FF] border border-[#00D4FF]/30 hover:bg-[#2E2254] transition-colors"
            >
              Instructor Hub
            </button>
          )}
        </div>

        {selectedClassroomAssignment ? (
          /* Assignment Details View */
          <div className="rounded-2xl p-6 border space-y-6" style={{ background: BB.surface, borderColor: BB.border }}>
            {/* Header with Title and badges */}
            <div className="flex items-start justify-between border-b border-[rgba(107,92,166,0.2)] pb-4 flex-wrap gap-4">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-[#00D4FF]/15 text-[#00D4FF] font-bold uppercase border border-[#00D4FF]/30">
                    {selectedClassroomAssignment.rubric?.problem_type || 'CLASSIFICATION'}
                  </span>
                  {selectedClassroomAssignment.rubric?.duration_minutes && (
                    <span className="text-xs text-[#9E93B8] font-mono flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1C1534] border border-[rgba(107,92,166,0.3)]">
                      <Clock className="w-3.5 h-3.5 text-[#00D4FF]" />
                      <span>{selectedClassroomAssignment.rubric.duration_minutes} min duration</span>
                    </span>
                  )}
                </div>
                <h1 className="text-xl md:text-2xl font-bold text-[#F5F1EC] tracking-tight">
                  {selectedClassroomAssignment.title}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-[#9E93B8] pt-1">
                  {(selectedClassroomAssignment.start_date || selectedClassroomAssignment.rubric?.start_date) && (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#0F0B1E] border border-[rgba(107,92,166,0.25)]">
                      <Calendar className="w-3.5 h-3.5 text-[#00F5A0]" />
                      <span>Start: <strong className="text-[#F5F1EC]">{formatExamDate(selectedClassroomAssignment.start_date || selectedClassroomAssignment.rubric?.start_date)}</strong></span>
                    </div>
                  )}
                  {(selectedClassroomAssignment.end_date || selectedClassroomAssignment.due_date || selectedClassroomAssignment.rubric?.end_date) && (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#0F0B1E] border border-[rgba(107,92,166,0.25)]">
                      <Clock className="w-3.5 h-3.5 text-[#F59E0B]" />
                      <span>End / Due: <strong className="text-[#F5F1EC]">{formatExamDate(selectedClassroomAssignment.end_date || selectedClassroomAssignment.due_date || selectedClassroomAssignment.rubric?.end_date)}</strong></span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#0F0B1E] border border-[rgba(107,92,166,0.25)]">
                    <Award className="w-3.5 h-3.5 text-[#00D4FF]" />
                    <span>Max Score: <strong className="text-[#00D4FF]">{selectedClassroomAssignment.max_score || 100} pts</strong></span>
                  </div>
                </div>
              </div>

              {/* Start Button at Top Right */}
              <button
                onClick={() => {
                  // Open SEB pre-flight modal instantly — async work deferred to onConfirm
                  const examId = `exam-${selectedClassroomAssignment.id}`;
                  const targetCid = selectedClassroomId || activeClassroom?.id || '';
                  setSebPendingExamInfo({
                    examTitle: selectedClassroomAssignment.title || 'Lab Exam',
                    durationMinutes: selectedClassroomAssignment.rubric?.duration_minutes,
                    targetCid,
                    applyExamState: async () => {
                      let latestExams = exams;
                      try {
                        latestExams = await ClassroomService.listExams();
                        setExams(latestExams);
                      } catch {}
                      let targetExam = latestExams.find((e) => e.id === examId || e.id.includes(selectedClassroomAssignment.id));
                      if (!targetExam) {
                        try {
                          const fetched = await ClassroomService.getExam(examId);
                          if (fetched) {
                            targetExam = fetched;
                            setExams([...latestExams, fetched]);
                          }
                        } catch {}
                      }
                      const finalExam = targetExam || (latestExams.length > 0 ? latestExams[0] : null);
                      if (finalExam) {
                        setActiveExam(finalExam);
                        setSelectedExamId(finalExam.id);
                        setCode('');
                        setServerPreview(null);
                        setLearningAidsAllowed(finalExam.learning_aids_enabled ?? true);
                        setDeployment(null);
                        setTestInputs({});
                        setRegisteredModelId(null);
                        setEvaluationResult(null);
                        setPredictionResult(null);
                        setSubmissionReceipt(null);
                        setOutputLines([`[System] Workspace opened for ${finalExam.title}.`]);
                        try {
                          const sess = await ClassroomService.getSession(finalExam.id);
                          if (sess?.code_draft) setCode(sess.code_draft);
                          if (sess?.status === 'SUBMITTED' && sess?.submission_receipt) {
                            setSubmissionReceipt({
                              submission_id: sess.submission_receipt.submission_id || 'sub-locked',
                              status: 'SUBMITTED',
                              grade_score: sess.grade_score || 85.0,
                              percentage: sess.grade_score || 85.0,
                              passed: (sess.grade_score || 0) >= 60.0,
                              submitted_at: sess.submitted_at || new Date().toISOString(),
                              code_sha256: sess.submission_receipt.code_sha256,
                              model_sha256: sess.submission_receipt.model_sha256,
                              rubric_snapshot: sess.submission_receipt.rubric_snapshot,
                              guardrail_flags: sess.submission_receipt.guardrail_flags || [],
                              message: 'Exam submission locked.',
                            });
                          }
                        } catch {}
                      }
                    },
                  });
                  setShowSebModal(true);
                }}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs text-[#0B0912] shadow transition-all hover:opacity-90 shrink-0"
                style={{ background: 'linear-gradient(135deg, #00D4FF 0%, #00F5A0 100%)' }}
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start Exam</span>
              </button>
            </div>

            {/* Grid Layout: Instructions & Benchmark Criteria */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Instructions and Details (2 Cols) */}
              <div className="lg:col-span-2 space-y-4">
                <div className="p-4 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.25)] space-y-2">
                  <div className="text-xs font-bold text-[#00D4FF] uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Problem Statement & Instructions</span>
                  </div>
                  <p className="text-xs text-[#F5F1EC] leading-relaxed whitespace-pre-wrap">
                    {selectedClassroomAssignment.description || 'No detailed instructions provided.'}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.25)] space-y-2">
                  <div className="text-xs font-bold text-[#00F5A0] uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Assigned Dataset</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-mono text-[#F5F1EC]">{formatFriendlyDatasetName(selectedClassroomAssignment.dataset_id || activeDatasetId)}</span>
                    <span className="text-[11px] text-[#9E93B8]">Uploaded in workspace</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#140E2A] border border-[rgba(107,92,166,0.3)] space-y-2">
                  <div className="text-xs font-bold text-[#F5F1EC] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#00D4FF]" />
                    <span>What to Expect in the Workspace</span>
                  </div>
                  <ul className="text-xs text-[#9E93B8] space-y-1 list-disc list-inside">
                    <li>Interactive cloud code editor with scikit-learn, pandas, and numpy support</li>
                    <li>Train, test, and tune your ML model against hidden test cases</li>
                    <li>In-place model deployment slot to verify live serving latency</li>
                    <li>Instant rubric evaluations and automated grading feedback</li>
                  </ul>
                </div>
              </div>

              {/* Rubric Criteria & CTA (1 Col) */}
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.25)] space-y-3">
                  <div className="text-xs font-bold text-[#F5F1EC] border-b border-[rgba(107,92,166,0.2)] pb-2 flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-[#00D4FF]" />
                    <span>Evaluation Benchmark</span>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#9E93B8]">Target Metric Cutoff:</span>
                      <strong className="text-[#00F5A0] font-mono">
                        {selectedClassroomAssignment.rubric?.min_accuracy
                          ? `${(selectedClassroomAssignment.rubric.min_accuracy * 100).toFixed(0)}% Acc/F1`
                          : 'Completed Pipeline'}
                      </strong>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[#9E93B8]">Serving Latency Ceiling:</span>
                      <strong className="text-[#F59E0B] font-mono">
                        {selectedClassroomAssignment.rubric?.max_latency_ms
                          ? `< ${selectedClassroomAssignment.rubric.max_latency_ms} ms`
                          : 'No Ceiling'}
                      </strong>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[#9E93B8]">Passing Grade Benchmark:</span>
                      <strong className="text-[#00D4FF] font-mono">
                        {selectedClassroomAssignment.rubric?.passing_score_percentage || 60}%
                      </strong>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[#9E93B8]">Data Leakage Guardrails:</span>
                      <strong className="text-[#F5F1EC] font-mono text-[11px]">
                        {selectedClassroomAssignment.rubric?.evaluate_guardrails !== false ? 'Strict Deductions' : 'Advisory Only'}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Monitored Exam Info Box (single Start Exam button in header above) */}
                <div className="p-4 rounded-xl bg-linear-to-b from-[#1C1534] to-[#140E2A] border border-[rgba(107,92,166,0.3)] space-y-2 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-[#00D4FF]">
                    <Shield className="w-4 h-4 text-red-400" />
                    <span>Safe Exam Browser Monitored</span>
                  </div>
                  <p className="text-[11px] text-[#9E93B8] leading-relaxed">
                    Review your constraints, then click <strong className="text-[#00F5A0]">Start Exam</strong> above to enter fullscreen lockdown.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Classroom assignments list */
          <div className="rounded-2xl p-6 border space-y-5" style={{ background: BB.surface, borderColor: BB.border }}>
            <div className="flex items-center gap-3 border-b border-[rgba(107,92,166,0.2)] pb-4">
              <div className="p-2.5 rounded-xl bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#F5F1EC]">
                  {activeClassroom?.name || 'Classroom'} — Your Assignments
                </h2>
                <p className="text-xs text-[#9E93B8]">
                  Select an assignment below to view detailed requirements and begin the exam.
                </p>
              </div>
            </div>

            {isLoadingClassroomAssignments ? (
              <div className="py-12 text-center text-xs font-mono text-[#00D4FF] animate-pulse">
                Fetching assignments from the instructor...
              </div>
            ) : classroomAssignments.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[#241B42] text-[#9E93B8] mx-auto flex items-center justify-center">
                  <FileCode className="w-6 h-6" />
                </div>
                <div className="text-sm font-semibold text-[#F5F1EC]">No Assignments Published Yet</div>
                <p className="text-xs text-[#9E93B8] max-w-sm mx-auto">
                  Your instructor hasn&apos;t published any lab exam assignments for this classroom yet.
                  Please check back later or contact your instructor.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {classroomAssignments.map((asgn: any) => {
                  const rubric = asgn.rubric || {};
                  return (
                    <div
                      key={asgn.id}
                      onClick={() => setSelectedClassroomAssignment(asgn)}
                      className="p-5 rounded-2xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.25)] hover:border-[#00D4FF]/40 transition-all space-y-3 group cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#00D4FF]/15 text-[#00D4FF] font-bold uppercase">
                              {rubric.problem_type || 'LAB EXAM'}
                            </span>
                            {rubric.duration_minutes && (
                              <span className="text-[10px] text-[#9E93B8] font-mono flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {rubric.duration_minutes} min
                              </span>
                            )}
                            {(asgn.start_date || rubric.start_date) && (
                              <span className="text-[10px] text-[#00F5A0] font-mono flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Starts: {formatExamDate(asgn.start_date || rubric.start_date)}
                              </span>
                            )}
                            {(asgn.end_date || asgn.due_date || rubric.end_date) && (
                              <span className="text-[10px] text-[#F59E0B] font-mono flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Due: {formatExamDate(asgn.end_date || asgn.due_date || rubric.end_date)}
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-bold text-[#F5F1EC] group-hover:text-[#00D4FF] transition-colors">
                            {asgn.title}
                          </h3>
                          {asgn.description && (
                            <p className="text-xs text-[#9E93B8] line-clamp-2">{asgn.description}</p>
                          )}
                          <div className="flex items-center gap-4 text-[11px] text-[#9E93B8] font-mono pt-1 flex-wrap">
                            {rubric.min_accuracy && (
                              <span>Min Accuracy: <strong className="text-[#00F5A0]">{(rubric.min_accuracy * 100).toFixed(0)}%</strong></span>
                            )}
                            {rubric.max_latency_ms && (
                              <span>Max Latency: <strong className="text-[#F59E0B]">{rubric.max_latency_ms}ms</strong></span>
                            )}
                            {rubric.passing_score_percentage && (
                              <span>Pass Mark: <strong className="text-[#00D4FF]">{rubric.passing_score_percentage}%</strong></span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedClassroomAssignment(asgn);
                          }}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs bg-[#241B42] hover:bg-[#2E2254] text-[#00D4FF] border border-[#00D4FF]/30 transition-all shrink-0"
                        >
                          <span>View Details</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {renderSebModal()}
      </div>
    );
  }

  if (viewMode === 'student' && isLoadingExams) {
    return (
      <div className="flex flex-col items-center justify-center min-h-125 text-center space-y-4">
        <Cpu className="w-10 h-10 text-[#00D4FF] animate-spin" />
        <div className="text-sm font-medium text-[#9E93B8]">Loading University Practical Lab Exam Environment...</div>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-0">
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* INSTRUCTOR EXPERIENCE (Parts B1 - B6)                                  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {viewMode === 'instructor' ? (
        <div className="space-y-4">
          {/* Instructor Tab Header */}
          <div className="flex items-center justify-between border-b border-[rgba(107,92,166,0.2)] pb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setViewMode('entry')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#1C1534] hover:bg-[#2E2254] text-[#9E93B8] hover:text-white transition-colors flex items-center gap-1.5 border border-[rgba(107,92,166,0.3)]"
              >
                ← All Classrooms
              </button>
            <button
              onClick={() => setInstructorTab('submissions')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                instructorTab === 'submissions'
                  ? 'bg-[#241B42] text-[#00D4FF] border border-[#00D4FF]/40'
                  : 'text-[#9E93B8] hover:text-white hover:bg-[#1C1534]'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>Submissions & Grading</span>
            </button>
            <button
              onClick={() => setInstructorTab('create-assignment')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                instructorTab === 'create-assignment'
                  ? 'bg-[#241B42] text-[#00D4FF] border border-[#00D4FF]/40'
                  : 'text-[#9E93B8] hover:text-white hover:bg-[#1C1534]'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Create Assignment & Rubric</span>
            </button>
            <button
              onClick={() => setInstructorTab('roster')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                instructorTab === 'roster'
                  ? 'bg-[#241B42] text-[#00D4FF] border border-[#00D4FF]/40'
                  : 'text-[#9E93B8] hover:text-white hover:bg-[#1C1534]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Classrooms & Roster</span>
            </button>
            <button
              onClick={() => {
                setInstructorTab('curriculum');
                loadCurriculumProgress();
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                instructorTab === 'curriculum'
                  ? 'bg-[#241B42] text-[#00F5A0] border border-[#00F5A0]/40'
                  : 'text-[#9E93B8] hover:text-white hover:bg-[#1C1534]'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Curriculum Progress</span>
            </button>
            {isLoadingInstructor && (
              <span className="text-[11px] text-[#00D4FF] font-mono animate-pulse ml-auto">
                Syncing Faculty Hub...
              </span>
            )}
            </div>

            {/* Back to student workspace */}
            {isFacultyRole && (
              <button
                onClick={() => setViewMode('student')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#00D4FF] text-[#0B0912] hover:bg-[#00F5A0] transition-colors flex items-center gap-1.5 shadow"
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Student Workspace</span>
              </button>
            )}
          </div>

          {/* TAB 1: Submissions & Grading Dashboard (B5, B6) */}
          {instructorTab === 'submissions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  {activeClassroom && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#9E93B8]">Classroom:</span>
                      <span className="text-xs font-bold text-[#F5F1EC] font-mono">{activeClassroom.name}</span>
                    </div>
                  )}
                  {selectedAssignment && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#9E93B8]">Assignment:</span>
                      <span className="text-xs font-bold text-[#00D4FF] font-mono">{selectedAssignment.title}</span>
                    </div>
                  )}
                  {classroomAssignments.length > 1 && (
                    <select
                      value={selectedAssignment?.id || ''}
                      onChange={async (e) => {
                        const target = classroomAssignments.find((a: any) => a.id === e.target.value);
                        if (target) {
                          setSelectedAssignment(target);
                          setIsLoadingInstructor(true);
                          try {
                            const subData = await ClassroomService.getSubmissions(target.id).catch(() => []);
                            setSubmissions(subData);
                          } finally {
                            setIsLoadingInstructor(false);
                          }
                        }
                      }}
                      className="px-2.5 py-1 rounded-xl bg-[#1C1534] border border-[rgba(107,92,166,0.3)] text-xs font-bold text-[#00D4FF] focus:outline-none cursor-pointer"
                    >
                      {classroomAssignments.map((a: any) => (
                        <option key={a.id} value={a.id} className="bg-[#151026] text-white">
                          {a.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={loadInstructorData}
                    disabled={isLoadingInstructor}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#1C1534] hover:bg-[#241B42] text-[#F5F1EC] border border-[rgba(107,92,166,0.3)] transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingInstructor ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* Live Proctor Tab-Switch Alerts Banner (Real-time student detection) */}
              {proctorAlerts.length > 0 && (
                <div
                  className="rounded-2xl border overflow-hidden p-4 space-y-3"
                  style={{
                    background: 'linear-gradient(135deg, rgba(28, 10, 15, 0.75) 0%, rgba(20, 12, 28, 0.75) 100%)',
                    borderColor: 'rgba(239, 68, 68, 0.35)',
                    boxShadow: '0 4px 20px rgba(239, 68, 68, 0.12)',
                  }}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-red-400" />
                      <span className="text-xs font-bold text-red-200">
                        Live Exam Proctor & Tab-Switch Security Alerts
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                        {proctorAlerts.length} alert{proctorAlerts.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setProctorAlerts([]);
                        localStorage.removeItem('ml_proctor_violations');
                      }}
                      className="text-[11px] text-[#9E93B8] hover:text-white transition-colors"
                    >
                      Clear Alerts
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto pr-1">
                    {proctorAlerts.map((alert, idx) => {
                      const isRed = alert.alert_type === 'RED_ALERT' || alert.flagged || alert.violation_count >= 3;
                      return (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl border flex items-start gap-2.5 text-xs transition-colors"
                          style={{
                            background: isRed ? 'rgba(127, 29, 29, 0.25)' : 'rgba(245, 158, 11, 0.15)',
                            borderColor: isRed ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.3)',
                          }}
                        >
                          <div className="mt-0.5 shrink-0">
                            {isRed ? (
                              <Shield className="w-3.5 h-3.5 text-red-400" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold text-white truncate" title={alert.student_name}>
                                {alert.student_name}
                              </span>
                              <span
                                className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                                  isRed
                                    ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                }`}
                              >
                                {isRed ? 'RED ALERT (3/3)' : `WARNING (${alert.violation_count}/3)`}
                              </span>
                            </div>
                            <div className="text-[10px] text-[#9E93B8] truncate">{alert.student_email || 'student@university.edu'}</div>
                            <div className="text-[10px] text-[#C084FC] mt-0.5">
                              {alert.reason || 'Tab switch / window blur'} • {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : 'Just now'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Submissions Table */}
              <div
                className="rounded-2xl border overflow-hidden"
                style={{ background: BB.surface, borderColor: BB.border }}
              >
                <div className="px-5 py-3 border-b border-[rgba(107,92,166,0.18)] flex items-center justify-between bg-[#110D20]">
                  <span className="text-xs font-bold text-[#F5F1EC]">Student Exam Submissions</span>
                  <span className="text-[11px] text-[#9E93B8]">{submissions.length} submission{submissions.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[rgba(107,92,166,0.2)] bg-[#17112B] text-[#9E93B8]">
                        <th className="p-3 font-semibold">Student Name / Email</th>
                        <th className="p-3 font-semibold">Status</th>
                        <th className="p-3 font-semibold">Automated Score</th>
                        <th className="p-3 font-semibold">Submission Date & Time (IST)</th>
                        <th className="p-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgba(107,92,166,0.15)] text-[#F5F1EC]">
                      {submissions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-xs text-[#9E93B8] italic">
                            No submissions yet. Students will appear here once they submit their lab exams.
                          </td>
                        </tr>
                      ) : (
                        submissions.map((sub, idx) => (
                          <tr key={sub.submission_id + idx} className="hover:bg-[#1A1432] transition-colors">
                            <td className="p-3 font-medium">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white">{sub.learner_name}</span>
                                {sub.flagged || (sub.violations_count && sub.violations_count >= 3) ? (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-red-500/20 text-red-400 border border-red-500/40">
                                    🚨 RED ALERT ({sub.violations_count || 3} Tab Switches)
                                  </span>
                                ) : sub.violations_count && sub.violations_count > 0 ? (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                                    ⚠️ Warning ({sub.violations_count} Tab Switch{sub.violations_count > 1 ? 'es' : ''})
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-[10px] text-[#9E93B8] font-mono">{sub.learner_email}</div>
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono border ${
                                sub.status === 'SUBMITTED' || sub.status === 'GRADED'
                                  ? 'bg-[#00F5A0]/10 text-[#00F5A0] border-[#00F5A0]/30'
                                  : sub.status === 'IN_PROGRESS'
                                  ? 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30'
                                  : 'bg-[#9E93B8]/10 text-[#9E93B8] border-[#9E93B8]/30'
                              }`}>
                                {sub.status}
                              </span>
                            </td>
                            <td className="p-3 font-mono font-bold">
                              <span className={sub.grade_score && sub.grade_score >= 60 ? 'text-[#00F5A0]' : sub.grade_score ? 'text-[#EF4444]' : 'text-[#9E93B8]'}>
                                {sub.grade_score?.toFixed(1) ?? '—'} / 100
                              </span>
                            </td>
                            <td className="p-3 font-mono text-xs text-[#00D4FF]">
                              {formatISTDateTime(sub.submitted_at)}
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setGradingSubmission(sub);
                                    setManualScore(sub.grade_score || 80);
                                    setGradingComments('');
                                  }}
                                  className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-[#C9A24B]/20 text-[#C9A24B] hover:bg-[#C9A24B]/30 transition-colors border border-[#C9A24B]/40"
                                >
                                  Grade
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Create Assignment & Rubric (B2, B4) */}
          {instructorTab === 'create-assignment' && (
            <div
              className="rounded-2xl p-6 border space-y-5"
              style={{ background: BB.surface, borderColor: BB.border }}
            >
              <div className="flex items-center justify-between border-b border-[rgba(107,92,166,0.2)] pb-3">
                <div className="flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-[#00D4FF]" />
                  <h3 className="text-sm font-bold text-[#F5F1EC]">Create Practical ML Lab Exam Assignment</h3>
                </div>
                <span className="text-xs text-[#9E93B8]">Scoped to University Organization</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="text-[11px] font-semibold text-[#9E93B8] block mb-1">Assignment Name *</label>
                  <input
                    type="text"
                    required
                    value={newAssignmentTitle}
                    onChange={(e) => setNewAssignmentTitle(e.target.value)}
                    placeholder="e.g. Lab Exam 3: Customer Churn Classification"
                    className="w-full px-3 py-2 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-[#9E93B8] block mb-1">Problem Type</label>
                  <select
                    value={newAssignmentType}
                    onChange={(e) => setNewAssignmentType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                  >
                    <option value="classification">Classification (Accuracy & Weighted F1)</option>
                    <option value="regression">Regression (R² Score & RMSE)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-[#9E93B8] mb-1 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#00D4FF]" />
                    <span>Start Date & Time (Optional)</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={newAssignmentStartDate}
                    onChange={(e) => setNewAssignmentStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-[#9E93B8] mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#F59E0B]" />
                    <span>End Date & Time / Deadline (Optional)</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={newAssignmentEndDate}
                    onChange={(e) => setNewAssignmentEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-[11px] font-semibold text-[#9E93B8] block mb-1">Uploaded Dataset</label>
                  {projectDataset?.fileName ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#0F0B1E] border border-[rgba(0,212,255,0.3)] text-[#F5F1EC] text-xs">
                      <Database className="w-4 h-4 text-[#00D4FF]" />
                      <span className="font-semibold text-[#00D4FF]">Active Uploaded File:</span>
                      <span className="font-mono text-white">{projectDataset.fileName}</span>
                    </div>
                  ) : (
                    <div className="px-3 py-2.5 rounded-xl bg-[#0F0B1E] border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>No dataset uploaded yet. Please upload a CSV file in Workspace first.</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[#9E93B8] block mb-1">Instructions & Problem Statement</label>
                <textarea
                  rows={3}
                  value={newAssignmentDesc}
                  onChange={(e) => setNewAssignmentDesc(e.target.value)}
                  placeholder="Outline the dataset requirements, model constraints, and evaluation details..."
                  className="w-full px-3 py-2 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] text-xs focus:outline-none focus:border-[#00D4FF]"
                />
              </div>

              {/* Advanced Evaluation & Rubric Options Accordion */}
              <div className="rounded-xl border border-[rgba(107,92,166,0.3)] bg-[#0C0819] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  className="w-full flex items-center justify-between p-3.5 hover:bg-[#151026] transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#00D4FF]" />
                    <span className="text-xs font-bold text-[#F5F1EC]">Advanced Evaluation & Rubric Settings</span>
                    <span className="text-[10px] text-[#9E93B8] font-mono">
                      ({evalMinMetric ? 'Min Metric: Active' : 'Min Metric: Off'} • {evalMaxLat ? 'Latency: Active' : 'Latency: Off'})
                    </span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-[#9E93B8] transition-transform duration-200 ${showAdvancedOptions ? 'rotate-180' : ''}`} />
                </button>

                {showAdvancedOptions && (
                  <div className="p-4 border-t border-[rgba(107,92,166,0.2)] bg-[#0F0B1E] space-y-4 text-xs">
                    {/* Option 1: Min Metric Benchmark */}
                    <div className="p-3 rounded-lg bg-[#140E2A] border border-[rgba(107,92,166,0.25)] space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={evalMinMetric}
                          onChange={(e) => setEvalMinMetric(e.target.checked)}
                          className="rounded bg-[#1C1534]"
                        />
                        <span className="font-semibold text-[#F5F1EC]">
                          Enable Minimum Metric Benchmark Scoring
                        </span>
                      </label>
                      <p className="text-[11px] text-[#9E93B8]">
                        {evalMinMetric
                          ? 'Active: Model accuracy/F1 must meet or exceed this cut-off on held-out benchmark test cases (worth 35 points in rubric).'
                          : 'Disabled: Accuracy threshold has no role in scoring (full points awarded for completing benchmark prediction generation).'}
                      </p>
                      {evalMinMetric && (
                        <div className="pt-1 flex items-center gap-3">
                          <label className="text-[11px] text-[#9E93B8] font-medium">Target Metric Cutoff (Acc/F1):</label>
                          <input
                            type="number"
                            step="0.05"
                            min="0.1"
                            max="1.0"
                            value={newAssignmentMinAcc}
                            onChange={(e) => setNewAssignmentMinAcc(e.target.value)}
                            className="w-28 px-2.5 py-1.5 rounded-lg bg-[#090614] border border-[rgba(107,92,166,0.4)] text-[#00F5A0] font-mono text-xs focus:outline-none focus:border-[#00D4FF]"
                          />
                        </div>
                      )}
                    </div>

                    {/* Option 2: Max Latency Benchmark */}
                    <div className="p-3 rounded-lg bg-[#140E2A] border border-[rgba(107,92,166,0.25)] space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={evalMaxLat}
                          onChange={(e) => setEvalMaxLat(e.target.checked)}
                          className="rounded bg-[#1C1534]"
                        />
                        <span className="font-semibold text-[#F5F1EC]">
                          Enable Serving Latency Benchmark Scoring
                        </span>
                      </label>
                      <p className="text-[11px] text-[#9E93B8]">
                        {evalMaxLat
                          ? 'Active: Median inference latency across live requests must be within this threshold to earn latency bonus.'
                          : 'Disabled: Latency ceiling has no role in scoring (full points awarded for verified live deployment serving).'}
                      </p>
                      {evalMaxLat && (
                        <div className="pt-1 flex items-center gap-3">
                          <label className="text-[11px] text-[#9E93B8] font-medium">Max Serving Latency (ms):</label>
                          <input
                            type="number"
                            step="5"
                            min="5"
                            value={newAssignmentMaxLat}
                            onChange={(e) => setNewAssignmentMaxLat(e.target.value)}
                            className="w-28 px-2.5 py-1.5 rounded-lg bg-[#090614] border border-[rgba(107,92,166,0.4)] text-[#00D4FF] font-mono text-xs focus:outline-none focus:border-[#00D4FF]"
                          />
                        </div>
                      )}
                    </div>

                    {/* Option 3: Data Quality & Leakage Guardrails */}
                    <div className="p-3 rounded-lg bg-[#140E2A] border border-[rgba(107,92,166,0.25)] space-y-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={evalGuardrails}
                          onChange={(e) => setEvalGuardrails(e.target.checked)}
                          className="rounded bg-[#1C1534]"
                        />
                        <span className="font-semibold text-[#F5F1EC]">
                          Enforce Data Leakage & Identifier Guardrail Deductions
                        </span>
                      </label>
                      <p className="text-[11px] text-[#9E93B8]">
                        {evalGuardrails
                          ? 'Active: Pipelines leaking target labels or using unique identifier columns will receive up to 15 points in deductions.'
                          : 'Disabled: Data quality warnings are flagged for learning without score deductions.'}
                      </p>
                    </div>

                    {/* Option 4: Exam Duration & Passing Score Target */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="text-[11px] font-semibold text-[#9E93B8] block mb-1">
                          Allotted Exam Duration (Minutes)
                        </label>
                        <input
                          type="number"
                          step="5"
                          min="15"
                          value={newAssignmentDuration}
                          onChange={(e) => setNewAssignmentDuration(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg bg-[#090614] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] font-mono text-xs focus:outline-none focus:border-[#00D4FF]"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[#9E93B8] block mb-1">
                          Passing Grade Benchmark (%)
                        </label>
                        <input
                          type="number"
                          step="5"
                          min="10"
                          max="100"
                          value={newAssignmentPassingScore}
                          onChange={(e) => setNewAssignmentPassingScore(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg bg-[#090614] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] font-mono text-xs focus:outline-none focus:border-[#00D4FF]"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end pt-3 border-t border-[rgba(107,92,166,0.2)]">
                <button
                  onClick={handleCreateAssignment}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-[#0B0912] shadow"
                  style={{ background: 'linear-gradient(135deg, #00D4FF 0%, #00F5A0 100%)' }}
                >
                  Publish Lab Assignment
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: Classrooms & Student Roster (B1, G1-G4) */}
          {instructorTab === 'roster' && (
            <ClassroomRosterTab
              classroom={
                activeClassroom || {
                  id: selectedClassroomId || (classrooms[0] as any)?.id || 'cls-default',
                  name: (activeClassroom as any)?.name || (classrooms[0] as any)?.name || 'University Lab Section',
                  course_id: (activeClassroom as any)?.course_id || (classrooms[0] as any)?.course_id,
                  join_code: (activeClassroom as any)?.join_code || (classrooms[0] as any)?.join_code || 'LABEX1',
                  join_code_active: (activeClassroom as any)?.join_code_active ?? true,
                }
              }
              onShowToast={onShowToast}
            />
          )}

          {/* TAB 4: Curriculum Progress */}
          {instructorTab === 'curriculum' && (
            <div
              className="rounded-2xl p-6 border space-y-6"
              style={{ background: BB.surface, borderColor: BB.border }}
            >
              <div className="flex items-center justify-between border-b border-[rgba(107,92,166,0.2)] pb-4 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-[#00D4FF]/10 border border-[#00D4FF]/30 text-[#00D4FF]">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#F5F1EC]">Curriculum Progress &amp; Assignments</h3>
                    <p className="text-xs text-[#9E93B8]">Classroom assignments, milestones, and student submission completion</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="px-3.5 py-1.5 rounded-xl bg-[#1C1534] border border-[rgba(107,92,166,0.3)] flex items-center gap-2">
                    <span className="text-xs text-[#9E93B8]">Total Assignments:</span>
                    <span className="text-xs font-bold text-[#00D4FF] font-mono">
                      {curriculumAssignments.length}
                    </span>
                  </div>
                  <button
                    onClick={() => setInstructorTab('create-assignment')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00D4FF] hover:bg-[#00F5A0] text-xs font-bold text-[#0B0912] transition-colors shadow cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Create Assignment</span>
                  </button>
                  <button
                    onClick={loadCurriculumProgress}
                    disabled={isLoadingCurriculum}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#1C1534] hover:bg-[#241B42] text-[#F5F1EC] border border-[rgba(107,92,166,0.3)] transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCurriculum ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {isLoadingCurriculum && curriculumAssignments.length === 0 ? (
                <div className="py-16 text-center text-xs text-[#00D4FF] font-mono animate-pulse">
                  Loading classroom curriculum assignments...
                </div>
              ) : curriculumAssignments.length === 0 ? (
                <div className="py-16 text-center space-y-4">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-[#241B42] border border-[rgba(107,92,166,0.3)] flex items-center justify-center text-[#00D4FF]">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-[#F5F1EC]">No Assignments Created Yet</h4>
                    <p className="text-xs text-[#9E93B8] max-w-md mx-auto">
                      Classroom curriculum progress tracks assignments created for this cohort. Once you create an assignment, it will appear here with student completion and score metrics.
                    </p>
                  </div>
                  <button
                    onClick={() => setInstructorTab('create-assignment')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-[#0B0912] shadow transition-all hover:opacity-90 active:scale-95 cursor-pointer"
                    style={{ background: 'linear-gradient(135deg, #00D4FF 0%, #00F5A0 100%)' }}
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Create First Assignment</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {curriculumAssignments.map((asgn: any, idx: number) => {
                    const stats = curriculumAssignmentsSummary[asgn.id] || { totalSubmissions: 0, avgScore: 0, passedCount: 0 };
                    const rubric = asgn.rubric || {};
                    const problemType = rubric.problem_type || 'Classification';
                    const minAcc = rubric.min_accuracy ? `${Math.round(rubric.min_accuracy * 100)}%` : '80%';
                    const maxLat = rubric.max_latency_ms ? `${rubric.max_latency_ms} ms` : '100 ms';
                    const passingScore = rubric.passing_score_percentage ?? 60.0;
                    const durationMins = rubric.duration_minutes ?? 90;

                    return (
                      <div
                        key={asgn.id || idx}
                        className="p-5 rounded-2xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.25)] flex flex-col justify-between space-y-4 hover:border-[rgba(107,92,166,0.45)] transition-all shadow-lg"
                      >
                        {/* Header & Badges */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-[#241B42] text-[#00D4FF] border border-[#00D4FF]/30 uppercase">
                              Assignment {idx + 1}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full font-mono bg-[#00F5A0]/15 text-[#00F5A0] border border-[#00F5A0]/40 capitalize">
                              {problemType}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-[#F5F1EC] line-clamp-1">{asgn.title}</h4>
                          <p className="text-[11px] text-[#9E93B8] line-clamp-2 leading-relaxed">
                            {asgn.description || 'Practical ML curriculum assignment & evaluation rubric.'}
                          </p>
                        </div>

                        {/* Rubric Milestones / Targets */}
                        <div className="p-3 rounded-xl bg-[#151026] border border-[rgba(107,92,166,0.18)] space-y-1.5 text-[11px]">
                          <div className="flex justify-between items-center text-[#9E93B8]">
                            <span>Target Accuracy:</span>
                            <span className="font-mono text-[#00F5A0] font-bold">{minAcc}</span>
                          </div>
                          <div className="flex justify-between items-center text-[#9E93B8]">
                            <span>Latency Limit:</span>
                            <span className="font-mono text-[#F5F1EC]">{maxLat}</span>
                          </div>
                          <div className="flex justify-between items-center text-[#9E93B8]">
                            <span>Passing Score:</span>
                            <span className="font-mono text-[#00D4FF]">{passingScore}%</span>
                          </div>
                          <div className="flex justify-between items-center text-[#9E93B8]">
                            <span>Exam Duration:</span>
                            <span className="font-mono text-[#F5F1EC]">{durationMins} mins</span>
                          </div>
                          {asgn.dataset_id && (
                            <div className="flex justify-between items-center text-[#9E93B8]">
                              <span>Dataset:</span>
                              <span className="font-mono text-[#F5F1EC] truncate max-w-35">{formatFriendlyDatasetName(asgn.dataset_id)}</span>
                            </div>
                          )}
                          {asgn.due_date && (
                            <div className="flex justify-between items-center text-[#9E93B8]">
                              <span>Due Date:</span>
                              <span className="font-mono text-[#00D4FF]">{formatExamDate(asgn.due_date)}</span>
                            </div>
                          )}
                        </div>

                        {/* Student Completion Progress Telemetry */}
                        <div className="pt-2 border-t border-[rgba(107,92,166,0.2)] space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#9E93B8]">Submissions:</span>
                            <span className="font-mono font-bold text-[#00D4FF]">
                              {stats.totalSubmissions} {stats.totalSubmissions === 1 ? 'submission' : 'submissions'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#9E93B8]">Avg Score / Pass:</span>
                            <span className="font-mono font-bold text-[#00F5A0]">
                              {stats.totalSubmissions > 0
                                ? `${stats.avgScore} / 100 (${stats.passedCount} passed)`
                                : 'No submissions yet'}
                            </span>
                          </div>

                          {/* Action Button */}
                          <button
                            onClick={async () => {
                              setSelectedAssignment(asgn);
                              setIsLoadingInstructor(true);
                              try {
                                const subData = await ClassroomService.getSubmissions(asgn.id).catch(() => []);
                                setSubmissions(subData);
                                setInstructorTab('submissions');
                              } finally {
                                setIsLoadingInstructor(false);
                              }
                            }}
                            className="w-full mt-2 py-2 px-3 rounded-xl text-xs font-bold bg-[#1C1534] hover:bg-[#241B42] text-[#00D4FF] hover:text-[#00F5A0] border border-[rgba(107,92,166,0.3)] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>View Submissions &amp; Grades</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Manual Grade Modal (B6) */}
          <AnimatePresence>
            {gradingSubmission && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="max-w-md w-full rounded-2xl p-6 border shadow-2xl space-y-4"
                  style={{ background: BB.surface, borderColor: BB.border }}
                >
                  <h3 className="text-sm font-bold text-[#F5F1EC]">
                    Grade & Written Feedback: {gradingSubmission.learner_name}
                  </h3>
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="text-[11px] font-semibold text-[#9E93B8] block mb-1">Adjusted Score (0 - 100)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={manualScore}
                        onChange={(e) => setManualScore(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] font-mono text-sm focus:outline-none focus:border-[#00D4FF]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-[#9E93B8] block mb-1">Written Instructor Feedback</label>
                      <textarea
                        rows={3}
                        value={gradingComments}
                        onChange={(e) => setGradingComments(e.target.value)}
                        placeholder="Detail performance on preprocessing, model choice, and any data-leakage observations..."
                        className="w-full px-3 py-2 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      onClick={() => setGradingSubmission(null)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-[#9E93B8] hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveManualGrade}
                      disabled={isSavingGrade}
                      className="px-5 py-2 rounded-xl text-xs font-bold text-[#0B0912] shadow"
                      style={{ background: 'linear-gradient(135deg, #00D4FF 0%, #00F5A0 100%)' }}
                    >
                      {isSavingGrade ? 'Saving...' : 'Save Grade & Feedback'}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════════════════ */
        /* STUDENT EXPERIENCE (Parts C1 - C5, D, E)                               */
        /* ══════════════════════════════════════════════════════════════════════ */
        <div className="space-y-4">
          {/* Navigation Bar for Student Workspace */}
          <div className="flex items-center justify-between border-b border-[rgba(107,92,166,0.2)] pb-2 flex-wrap gap-2">
            <button
              onClick={() => {
                if (examLocked) {
                  onShowToast?.('⚠️ Exam In Progress', 'Submit your exam before leaving the workspace.', 'error');
                  return;
                }
                if (activeClassroom) {
                  setSelectedClassroomAssignment(null);
                  setViewMode('classroom');
                } else {
                  setViewMode('entry');
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors border flex items-center gap-1.5 ${
                examLocked
                  ? 'bg-[#1C1534] text-[#3D3558] border-[rgba(107,92,166,0.15)] cursor-not-allowed opacity-50'
                  : 'bg-[#1C1534] hover:bg-[#241B42] text-[#9E93B8] hover:text-white border-[rgba(107,92,166,0.3)]'
              }`}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{activeClassroom ? 'Back to Classroom' : 'Back to All Classrooms'}</span>
            </button>

            {/* Exam Lock Status Banner */}
            {examLocked && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/40 text-[#EF4444] text-xs font-bold">
                <Lock className="w-3.5 h-3.5" />
                <span>EXAM IN PROGRESS — Navigation Locked</span>
              </div>
            )}

            {activeClassroom && !examLocked && (
              <div className="text-xs font-mono text-[#00D4FF]">
                Classroom: <strong className="text-[#F5F1EC]">{activeClassroom.name}</strong>
              </div>
            )}
            {isFacultyRole && (
              <button
                onClick={() => {
                  if (examLocked) {
                    onShowToast?.('⚠️ Exam In Progress', 'Submit your exam before switching views.', 'error');
                    return;
                  }
                  setViewMode('instructor');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                  examLocked
                    ? 'bg-[#241B42] text-[#3D3558] border-[#00D4FF]/10 cursor-not-allowed opacity-40'
                    : 'bg-[#241B42] text-[#00D4FF] border-[#00D4FF]/30 hover:bg-[#2E2254]'
                }`}
              >
                Instructor Hub
              </button>
            )}
          </div>
          {/* Student Learning Layer: Educational Guidance (when aids allowed) */}
          {activeExam && (activeExam.learning_aids_enabled ?? true) && (
            <PanelLearningCollapsible
              title="Lab Exam & Practical Assignment"
              steps={[
                {
                  title: '1. Select & Review Rubric',
                  action: 'Read the assignment requirements, target metrics, and latency constraints.',
                },
                {
                  title: '2. Code Your Pipeline',
                  action: 'Write clean preprocessing and estimator training code in the editor without data leakage.',
                },
                {
                  title: '3. Test In Terminal',
                  action: 'Run your Python script to verify model convergence and check diagnostic warnings.',
                },
                {
                  title: '4. Submit For Grading',
                  action: 'Click Submit Solution to trigger automated evaluation against teacher test sets.',
                },
              ]}
              quickTip="Fit all scalers and encoders on training data only to avoid data leakage penalties."
            />
          )}

          {!activeDatasetId && (
            <div className="mb-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span><strong>No dataset uploaded:</strong> This exam requires your uploaded CSV file. Please upload a dataset in Workspace first so your code and models run on your data.</span>
              </div>
            </div>
          )}

          {/* Main Lab Workspace: Left (Editor + Terminal) & Right (Deployment + Grading) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left 7 Columns: Manual Code Studio & Terminal Output */}
            <div className="lg:col-span-7 space-y-4">
              <div
                className="rounded-2xl border overflow-hidden flex flex-col"
                style={{
                  background: BB.surface,
                  borderColor: BB.border,
                }}
              >
                {/* Editor Action Toolbar */}
                <div className="px-4 py-2.5 border-b border-[rgba(107,92,166,0.2)] flex items-center justify-between flex-wrap gap-2 bg-[#100C1E]">
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Hidden accessible combobox for tests / accessibility */}
                    <select
                      value={selectedExamId}
                      onChange={(e) => handleSelectExam(e.target.value)}
                      disabled={Boolean(submissionReceipt) || examLocked}
                      aria-label="Exam selector"
                      className="sr-only"
                    >
                      {exams.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.title}
                        </option>
                      ))}
                    </select>

                    <span className="text-xs font-mono text-[#9E93B8] flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-[#00D4FF]" />
                      <strong className="text-[#F5F1EC]">lab_exam.py</strong>
                      <span className="text-[11px] text-[#6B5CA5]">&bull; Python 3.12 (Scikit-Learn)</span>
                    </span>

                    {/* Preview Data Button (identical in function & feel to Dataset & Profiler page) */}
                    <button
                      onClick={() => setShowDataPreview(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1C1534] hover:bg-[#281E48] text-[#00D4FF] hover:text-[#00F5A0] border border-[rgba(107,92,166,0.3)] hover:border-[#00D4FF]/50 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                      title="Preview Data — inspect dataset schema and sample rows"
                    >
                      <Table className="w-3.5 h-3.5" />
                      <span>Preview Data</span>
                    </button>

                    {/* Server Draft Autosave Indicator (E3) */}
                    {draftSavedAt && !submissionReceipt && (
                      <span className="text-[10px] text-[#00F5A0] font-mono flex items-center gap-1">
                        <Check className="w-3 h-3" /> Draft saved ({draftSavedAt})
                      </span>
                    )}

                    {/* Faculty Toggle to Instructor Portal */}
                    {isFacultyRole && (
                      <button
                        onClick={() => {
                          if (examLocked) {
                            onShowToast?.('⚠️ Exam In Progress', 'Submit your exam before switching to Instructor Portal.', 'error');
                            return;
                          }
                          setViewMode('instructor');
                        }}
                        className={`px-2 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1 shadow-sm transition-colors ${
                          examLocked
                            ? 'bg-[#C9A24B]/10 text-[#C9A24B]/30 border-[#C9A24B]/20 cursor-not-allowed opacity-40'
                            : 'bg-[#C9A24B]/20 text-[#C9A24B] hover:bg-[#C9A24B]/30 border-[#C9A24B]/40'
                        }`}
                        title={examLocked ? 'Submit exam first' : 'Switch to Instructor Portal'}
                      >
                        <Settings className="w-3.5 h-3.5" />
                        <span>Instructor Portal</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => {
                        setCode('');
                        onShowToast?.('Reset Code', 'Editor cleared.', 'info');
                      }}
                      disabled={Boolean(submissionReceipt)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#9E93B8] hover:text-white hover:bg-[#241B42] transition-colors flex items-center gap-1"
                      title="Clear code editor"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>

                    <button
                      onClick={handleRunCode}
                      disabled={isExecuting || Boolean(submissionReceipt)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow flex items-center gap-1.5"
                      style={{
                        background: isExecuting ? '#3D3558' : 'linear-gradient(135deg, #00F5A0 0%, #00C875 100%)',
                        color: '#0B0912',
                      }}
                    >
                      {isExecuting ? (
                        <>
                          <Cpu className="w-3.5 h-3.5 animate-spin" />
                          <span>Executing...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Run Code</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleDeploy}
                      disabled={isDeploying || Boolean(submissionReceipt)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow flex items-center gap-1.5"
                      style={{
                        background: isDeploying ? '#3D3558' : 'linear-gradient(135deg, #7C6BAE 0%, #4B3B7C 100%)',
                        color: '#F5F1EC',
                        border: '1px solid rgba(124, 107, 174, 0.4)',
                      }}
                      title={
                        deployment
                          ? 'Re-deploy updated model in-place (hot reload with zero duplicate deployments created)'
                          : 'Deploy newly trained model to active lab slot'
                      }
                    >
                      {isDeploying ? (
                        <>
                          <Cpu className="w-3.5 h-3.5 animate-spin" />
                          <span>Deploying Slot...</span>
                        </>
                      ) : (
                        <>
                          <Rocket className="w-3.5 h-3.5 text-[#00D4FF]" />
                          <span>{deployment ? 'Re-Deploy (In-Place)' : 'Deploy to Lab Slot'}</span>
                        </>
                      )}
                    </button>

                    {/* Final Submit Exam Button (A3, C2) */}
                    {!submissionReceipt ? (
                      <button
                        onClick={() => setShowConfirmSubmit(true)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                        style={{
                          background: 'linear-gradient(135deg, #00D4FF 0%, #0099FF 100%)',
                          color: '#0B0912',
                        }}
                        title="Lock and submit final exam"
                      >
                        <Award className="w-3.5 h-3.5" />
                        <span>Submit Exam</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#00F5A0]/20 text-[#00F5A0] border border-[#00F5A0]/40 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Locked: {submissionReceipt.grade_score}/100</span>
                        </div>
                        <button
                          onClick={handleResetSession}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#2A1E4A] hover:bg-[#3D2C6A] text-[#00D4FF] border border-[#00D4FF]/40 transition-colors flex items-center gap-1 shadow cursor-pointer"
                          title="Reset locked session to practice or re-test the full deployment workflow"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Unlock Lab</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Monaco Python Editor Component (B4 Protected Regions) */}
                <div className="h-170 xl:h-190 2xl:h-205 relative">
                  <MonacoCodeStudioEditor
                    code={code}
                    onChange={(newVal) => setCode(newVal)}
                    filename="lab_exam.py"
                    onRunCode={handleRunCode}
                    readOnly={Boolean(submissionReceipt)}
                    minimapEnabled={false}
                  />

                  {/* Submission Lock Overlay (C5) */}
                  {submissionReceipt && (
                    <div className="absolute top-3 right-3 z-10 px-3.5 py-2 rounded-xl bg-[#090614]/95 border border-[#00F5A0]/40 text-xs text-[#00F5A0] flex items-center gap-3 shadow-2xl backdrop-blur-md">
                      <div className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-[#00F5A0]" />
                        <span className="font-semibold">Exam Locked & Submitted ({submissionReceipt.grade_score}/100)</span>
                        <span className="sr-only">{submissionReceipt.submission_id}</span>
                      </div>
                      <button
                        onClick={handleResetSession}
                        className="px-2.5 py-1 rounded-lg bg-[#00D4FF] hover:bg-[#00F5A0] text-[#0B0912] text-[11px] font-bold transition-all shadow cursor-pointer flex items-center gap-1"
                        title="Unlock exam session to practice or re-test the workflow"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Unlock & Practice</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Terminal / Output Stream Card */}
              <div
                className="rounded-2xl border overflow-hidden flex flex-col"
                style={{
                  background: '#07050E',
                  borderColor: BB.border,
                }}
              >
                <div className="px-4 py-2.5 border-b border-[rgba(107,92,166,0.18)] flex items-center justify-between bg-[#0C0818]">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-[#00D4FF]" />
                    <span className="text-xs font-mono font-semibold text-[#F5F1EC]">Sandbox Terminal Output</span>
                  </div>
                  <button
                    onClick={() => setOutputLines([])}
                    className="text-[10px] text-[#9E93B8] hover:text-white font-mono"
                  >
                    Clear
                  </button>
                </div>

                <div className="p-4 font-mono text-xs text-slate-300 h-44 overflow-y-auto space-y-1 bg-[#05030A]">
                  {outputLines.length === 0 ? (
                    <div className="text-[#475569] italic">
                      Press "Run Code" to execute Python script in sandbox. Output stdout/stderr will stream here...
                    </div>
                  ) : (
                    outputLines.map((line, idx) => (
                      <div
                        key={idx}
                        className={`leading-relaxed ${
                          line.includes('[Error]') || line.includes('[stderr]') || line.includes('violation')
                            ? 'text-[#EF4444]'
                            : line.includes('[Lab Result]') || line.includes('[Artifact]') || line.includes('[Deployment')
                            ? 'text-[#00F5A0] font-semibold'
                            : line.includes('[Lab Metrics]') || line.includes('[Submission')
                            ? 'text-[#00D4FF] font-semibold'
                            : 'text-slate-300'
                        }`}
                      >
                        {line}
                      </div>
                    ))
                  )}
                  <div ref={terminalEndRef} />
                </div>
              </div>
            </div>

            {/* Right 5 Columns: In-Place Deployment Slot & Grading Evaluation */}
            <div className="lg:col-span-5 space-y-5">
              {/* Submission Receipt Card (if submitted) (C2) */}
              {submissionReceipt && (
                <div
                  className="rounded-2xl p-5 border space-y-3 shadow-xl"
                  style={{
                    background: 'linear-gradient(135deg, #110D24 0%, #171030 100%)',
                    borderColor: '#00F5A0',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCheck className="w-5 h-5 text-[#00F5A0]" />
                      <h3 className="text-sm font-bold text-[#F5F1EC]">Official Submission Receipt</h3>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#00F5A0]/20 text-[#00F5A0]">
                      LOCKED
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[#0B0817] text-xs font-mono space-y-1.5 text-[#9E93B8] border border-[rgba(107,92,166,0.3)]">
                    <div className="flex justify-between">
                      <span>Final Score:</span>
                      <strong className="text-[#00F5A0]">{submissionReceipt.grade_score} / 100</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <strong className="text-[#00D4FF]">{submissionReceipt.passed ? 'PASSED' : 'RECORDED'}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Submitted At:</span>
                      <span className="text-[#F5F1EC]">
                        {new Date(submissionReceipt.submitted_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-[#9E93B8] leading-relaxed">
                    ✨ Your code and model weights are cryptographically sealed. Any direct API updates or redeployments are server-rejected.
                  </p>
                </div>
              )}

              {/* Deployment Slot Status Card (D4) */}
              <div
                className="rounded-2xl p-5 border space-y-4"
                style={{
                  background: BB.surface,
                  borderColor: BB.border,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-[#00D4FF]" />
                    <h3 className="text-sm font-bold text-[#F5F1EC]">Active Lab Serving Slot</h3>
                  </div>
                  {deployment ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#00F5A0]/10 text-[#00F5A0] border border-[#00F5A0]/30 font-mono">
                      {deployment.status}
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#3D3558] text-[#9E93B8] font-mono">
                      NOT DEPLOYED
                    </span>
                  )}
                </div>

                {deployment ? (
                  <div className="space-y-4">
                    {/* Singleton Banner Guarantee */}
                    <div className="p-3 rounded-xl bg-[#1C1534] border border-[#00D4FF]/30 text-xs text-[#F5F1EC] space-y-1">
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="text-[#00D4FF] font-semibold flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5" /> Slot: Lab-{selectedExamId.slice(-2)}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-[#4B3B7C]/40 text-[#F5F1EC] font-bold">
                          Version: v{deployment.version_count || 1}.0
                        </span>
                      </div>
                      <p className="text-[10px] text-[#9E93B8] leading-tight">
                        ✨ <strong>Singleton Active:</strong> Any subsequent code changes deployed will update this existing
                        endpoint in-place. 0 duplicate deployment records are formed.
                      </p>
                    </div>

                    {/* Interactive Prediction Playground */}
                    <div className="space-y-3 pt-2 border-t border-[rgba(107,92,166,0.18)]">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-[#00D4FF]" />
                          <span className="text-xs font-bold text-[#F5F1EC]">Test Live Prediction</span>
                        </div>
                        <span className="text-[10px] text-[#00D4FF] bg-[rgba(0,212,255,0.1)] px-2 py-0.5 rounded-full border border-[rgba(0,212,255,0.2)] font-mono">
                          Interactive Test Inputs
                        </span>
                      </div>

                      {/* Informative Guidance Banner */}
                      <div className="p-2.5 rounded-lg bg-[rgba(0,212,255,0.04)] border border-[rgba(0,212,255,0.15)] flex items-start justify-between gap-2">
                        <p className="text-[11px] text-[#C4BCE3] leading-relaxed">
                          💡 <strong>Pre-filled with Dataset Row #1:</strong> These are sample input features from your dataset. You can edit any value below and execute live inference to verify your deployed model.
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          {deployment?.sample_inputs && Object.keys(deployment.sample_inputs).length > 0 && (
                            <button
                              type="button"
                              onClick={() => setTestInputs(deployment.sample_inputs || {})}
                              className="text-[10px] font-mono text-[#00D4FF] hover:underline px-1.5 py-0.5 rounded bg-[rgba(0,212,255,0.1)] transition-colors"
                              title="Reset inputs to original dataset sample"
                            >
                              Reset Row
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setTestInputs(Object.fromEntries(Object.keys(testInputs).map((k) => [k, ''])))}
                            className="text-[10px] font-mono text-[#9E93B8] hover:text-[#F5F1EC] px-1.5 py-0.5 rounded bg-[rgba(107,92,166,0.2)] transition-colors"
                            title="Clear input fields"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs max-h-56 overflow-y-auto pr-1">
                        {Object.keys(testInputs).map((key) => {
                          const schemaType = deployment?.input_schema?.[key]?.type || 'numeric';
                          return (
                            <div key={key} className="space-y-0.5">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] text-[#A599C2] font-mono block truncate" title={key}>
                                  {key}
                                </label>
                                <span className={`text-[9px] font-mono px-1 rounded ${schemaType === 'numeric' ? 'text-[#00D4FF] bg-[#00D4FF]/10' : 'text-[#F59E0B] bg-[#F59E0B]/10'}`}>
                                  {schemaType}
                                </span>
                              </div>
                              <input
                                type={schemaType === 'numeric' ? 'number' : 'text'}
                                step="any"
                                value={testInputs[key] ?? ''}
                                placeholder={schemaType === 'numeric' ? 'e.g. 0.0' : 'text...'}
                                onChange={(e) =>
                                  setTestInputs((prev) => ({
                                    ...prev,
                                    [key]: schemaType === 'numeric' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value,
                                  }))
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-xs text-[#F5F1EC] font-mono focus:outline-none focus:border-[#00D4FF] focus:ring-1 focus:ring-[#00D4FF]/30 transition-all placeholder:text-[#524675]"
                              />
                            </div>
                          );
                        })}
                      </div>

                      <button
                        onClick={handleTestPrediction}
                        disabled={isPredicting}
                        className="w-full py-2 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1.5"
                        style={{
                          background: 'rgba(0, 212, 255, 0.1)',
                          borderColor: 'rgba(0, 212, 255, 0.3)',
                          color: '#00D4FF',
                        }}
                      >
                        {isPredicting ? (
                          <>
                            <Cpu className="w-3.5 h-3.5 animate-spin" />
                            <span>Predicting...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Run Test Prediction</span>
                          </>
                        )}
                      </button>

                      {/* Prediction Output Card */}
                      {predictionResult && (
                        <div className="p-3 rounded-xl bg-[#090614] border border-[#00F5A0]/30 space-y-2 shadow-lg shadow-[#00F5A0]/5">
                          <div className="flex items-center justify-between text-xs border-b border-[rgba(107,92,166,0.2)] pb-1.5">
                            <span className="text-[#9E93B8] flex items-center gap-1 font-medium">
                              <Sparkles className="w-3 h-3 text-[#00F5A0]" />
                              Model Output:
                            </span>
                            <span className="font-bold font-mono text-[#00F5A0] text-sm px-2 py-0.5 rounded bg-[rgba(0,245,160,0.1)] border border-[#00F5A0]/30">
                              {String(predictionResult.prediction)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-[#9E93B8]">
                            <span>Inference Latency:</span>
                            <span className="font-mono text-[#00D4FF]">
                              {predictionResult.latency_ms?.toFixed(2)} ms
                            </span>
                          </div>
                          {predictionResult.probabilities && (
                            <div className="text-[10px] text-slate-400 font-mono pt-1 border-t border-[rgba(107,92,166,0.15)] flex justify-between">
                              <span>Probabilities:</span>
                              <span>
                                {Object.entries(predictionResult.probabilities)
                                  .map(([k, v]: [string, any]) => `${k}: ${(v * 100).toFixed(1)}%`)
                                  .join(' | ')}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-8 rounded-xl border border-dashed border-[rgba(107,92,166,0.3)] text-center text-xs text-[#9E93B8] space-y-2">
                    <Rocket className="w-8 h-8 text-[#4B3B7C] mx-auto" />
                    <p>Run your Python training script and click <strong>"Deploy to Lab Slot"</strong> to activate live model inference.</p>
                  </div>
                )}
              </div>

              {/* Automated Rubric Benchmark Grading Card (C3, D1, D2) */}
              <div
                className="rounded-2xl p-5 border space-y-4"
                style={{
                  background: BB.surface,
                  borderColor: BB.border,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-[#C9A24B]" />
                    <h3 className="text-sm font-bold text-[#F5F1EC]">Automated Rubric Evaluation</h3>
                  </div>
                  {evaluationResult && (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
                        evaluationResult.passed
                          ? 'bg-[#00F5A0]/15 text-[#00F5A0] border border-[#00F5A0]/30'
                          : 'bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/30'
                      }`}
                    >
                      Score: {evaluationResult.score}/{evaluationResult.max_score}
                    </span>
                  )}
                </div>

                <p className="text-xs text-[#9E93B8] leading-relaxed">
                  Verify your pipeline against hidden test criteria. Evaluates serving availability, input dimensions,
                  latency thresholds, and performance metrics on held-out test data.
                </p>

                {/* Guardrail Warnings Banner (C4) */}
                {evaluationResult?.guardrail_warnings && evaluationResult.guardrail_warnings.length > 0 && (
                  <div className="p-3 rounded-xl bg-[#EF4444]/15 border border-[#EF4444]/40 text-xs text-[#EF4444] space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Data-Quality Guardrail Flags</span>
                    </div>
                    {evaluationResult.guardrail_warnings.map((w, idx) => (
                      <p key={idx} className="text-[11px] text-red-200">
                        • {w}
                      </p>
                    ))}
                  </div>
                )}

                <button
                  onClick={handleEvaluateRubric}
                  disabled={isEvaluating || !deployment || Boolean(submissionReceipt)}
                  className="w-full py-2.5 rounded-xl text-xs font-bold transition-all shadow flex items-center justify-center gap-2"
                  style={{
                    background: !deployment || Boolean(submissionReceipt)
                      ? '#241B42'
                      : 'linear-gradient(135deg, #C9A24B 0%, #A27B2A 100%)',
                    color: !deployment || Boolean(submissionReceipt) ? '#645B80' : '#0B0912',
                  }}
                >
                  {isEvaluating ? (
                    <>
                      <Cpu className="w-4 h-4 animate-spin" />
                      <span>Evaluating Against Test Cases...</span>
                    </>
                  ) : (
                    <>
                      <Award className="w-4 h-4" />
                      <span>Run Automated Rubric Tests</span>
                    </>
                  )}
                </button>

                {/* Criteria Breakdown with Plain-Language Hints (C3) */}
                {evaluationResult && (
                  <div className="space-y-2 pt-2 border-t border-[rgba(107,92,166,0.18)]">
                    {evaluationResult.criteria_results.map((c, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl bg-[#140E24] border border-[rgba(107,92,166,0.2)] text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-[#F5F1EC] flex items-center gap-1.5">
                            {c.passed ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#00F5A0] shrink-0" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-[#EF4444] shrink-0" />
                            )}
                            <span>{c.criterion}</span>
                          </div>
                          <span className="font-mono font-bold text-[11px] text-[#F5F1EC]">
                            {c.points_awarded}/{c.max_points}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#9E93B8]">{c.description}</div>
                        <div className="text-[10px] text-[#00D4FF] font-mono">Actual: {c.actual}</div>
                        {c.hint && !c.passed && (
                          <div className="p-2 rounded-lg bg-[#241B42]/50 text-[10px] text-[#E2BD68] flex items-start gap-1.5 border border-[#C9A24B]/20">
                            <HelpCircle className="w-3 h-3 text-[#C9A24B] shrink-0 mt-0.5" />
                            <span>{c.hint}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Final Submission Confirmation Modal ── */}
          <AnimatePresence>
            {showConfirmSubmit && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="max-w-md w-full rounded-2xl p-6 border shadow-2xl space-y-4"
                  style={{
                    background: BB.surface,
                    borderColor: BB.border,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-[#00D4FF]/20 text-[#00D4FF]">
                      <Award className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[#F5F1EC]">Finalize & Submit Lab Exam</h3>
                      <p className="text-xs text-[#9E93B8]">Once submitted, your code and model will be locked immutably.</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#1C1534] text-xs space-y-2 text-[#9E93B8]">
                    <div className="flex justify-between">
                      <span>Lab Exam:</span>
                      <strong className="text-[#F5F1EC]">{activeExam?.title}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Active Deployment Slot:</span>
                      <strong className="text-[#00D4FF] font-mono">
                        {deployment ? `v${deployment.version_count}.0` : 'None'}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Current Benchmark Score:</span>
                      <strong className="text-[#00F5A0] font-mono">
                        {evaluationResult ? `${evaluationResult.score}/100` : 'Not Evaluated'}
                      </strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      onClick={() => setShowConfirmSubmit(false)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-[#9E93B8] hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSubmitExam}
                      disabled={isSubmitting}
                      className="px-5 py-2 rounded-xl text-xs font-bold text-[#0B0912] shadow"
                      style={{
                        background: 'linear-gradient(135deg, #00D4FF 0%, #00F5A0 100%)',
                      }}
                    >
                      {isSubmitting ? 'Submitting...' : 'Confirm Final Submission'}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* ── Dataset Preview Modal (matching Dataset & Profiler page) ── */}
          <AnimatePresence>
            {showDataPreview && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className="w-full max-w-5xl max-h-[85vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl"
                  style={{
                    background: BB.surface,
                    borderColor: BB.border,
                  }}
                >
                  {/* Header */}
                  <div
                    className="px-6 py-4 border-b flex items-center justify-between flex-wrap gap-3"
                    style={{
                      background: '#0F0B1E',
                      borderColor: BB.border,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30">
                        <Table className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-[#F5F1EC]">Dataset Preview</h3>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#1C1534] text-[#00D4FF] border border-[rgba(107,92,166,0.3)]">
                            {activePreviewData?.fileName || activeDatasetId || 'Active Dataset'}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#9E93B8]">
                          {activePreviewData?.rowCount || 0} total rows · {activePreviewData?.columns.length || 0} features
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Search Bar */}
                      <div className="relative flex items-center">
                        <Search className="w-3.5 h-3.5 text-[#9E93B8] absolute left-3 pointer-events-none" />
                        <input
                          type="text"
                          value={previewSearch}
                          onChange={(e) => {
                            setPreviewSearch(e.target.value);
                            setPreviewPage(1);
                          }}
                          placeholder="Search row values..."
                          className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-[#151026] text-[#F5F1EC] border border-[rgba(107,92,166,0.3)] focus:outline-none focus:border-[#00D4FF] w-48 font-sans"
                        />
                      </div>

                      <button
                        onClick={() => setShowDataPreview(false)}
                        className="p-1.5 rounded-lg text-[#9E93B8] hover:text-[#F5F1EC] hover:bg-[#241B42] transition-colors cursor-pointer"
                        title="Close preview"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Table Body & Controls */}
                  {isLoadingPreview ? (
                    <div className="p-16 flex flex-col items-center justify-center gap-3 text-slate-400">
                      <Cpu className="w-6 h-6 animate-spin text-[#00D4FF]" />
                      <span className="text-xs">Loading dataset rows from server...</span>
                    </div>
                  ) : !activePreviewData || activePreviewData.rows.length === 0 ? (
                    <div className="p-16 text-center text-xs text-[#9E93B8]">
                      No dataset preview rows available.
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 overflow-auto border-b border-[rgba(107,92,166,0.15)] max-h-[60vh]">
                        <table className="w-full border-collapse text-left text-xs">
                          <thead className="sticky top-0 z-10 bg-[#0C0818] border-b border-[rgba(107,92,166,0.3)]">
                            <tr>
                              <th className="py-2.5 px-3 text-[10px] font-bold text-[#9E93B8] font-mono border-r border-[rgba(107,92,166,0.15)] bg-[#0C0818] w-12 text-center">
                                #
                              </th>
                              {activePreviewData.columns.map((col) => (
                                <th
                                  key={col}
                                  className="py-2.5 px-3 text-[10px] font-bold text-[#F5F1EC] font-mono tracking-wider whitespace-nowrap border-r border-[rgba(107,92,166,0.15)] bg-[#0C0818]"
                                >
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedPreviewRows.map((row, idx) => {
                              const rowNum = (previewPage - 1) * previewPageSize + idx + 1;
                              return (
                                <tr
                                  key={idx}
                                  className={`border-b border-[rgba(107,92,166,0.08)] hover:bg-[#241B42]/40 transition-colors ${
                                    idx % 2 === 0 ? 'bg-[#151026]' : 'bg-[#120D22]'
                                  }`}
                                >
                                  <td className="py-2 px-3 text-[10px] font-mono text-[#6E6488] border-r border-[rgba(107,92,166,0.15)] text-center">
                                    {rowNum}
                                  </td>
                                  {activePreviewData.columns.map((col) => {
                                    const val = row[col];
                                    const isNum = typeof val === 'number';
                                    return (
                                      <td
                                        key={col}
                                        className={`py-2 px-3 text-xs border-r border-[rgba(107,92,166,0.08)] whitespace-nowrap ${
                                          isNum ? 'font-mono text-[#00F5A0]' : 'text-[#F5F1EC]'
                                        }`}
                                      >
                                        {val !== null && val !== undefined && val !== '' ? String(val) : <span className="text-[#6E6488] italic">null</span>}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination Footer */}
                      <div className="px-6 py-3 bg-[#0F0B1E] flex items-center justify-between text-xs text-[#9E93B8] flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <span>
                            Showing {Math.min(filteredPreviewRows.length, (previewPage - 1) * previewPageSize + 1)} - {Math.min(filteredPreviewRows.length, previewPage * previewPageSize)} of {filteredPreviewRows.length} rows
                          </span>
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <span>Rows per page:</span>
                            <select
                              value={previewPageSize}
                              onChange={(e) => {
                                setPreviewPageSize(Number(e.target.value));
                                setPreviewPage(1);
                              }}
                              className="bg-[#1C1534] text-[#F5F1EC] rounded px-2 py-0.5 border border-[rgba(107,92,166,0.3)] focus:outline-none"
                            >
                              <option value={15}>15</option>
                              <option value={30}>30</option>
                              <option value={50}>50</option>
                              <option value={100}>100</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px]">
                            Page {previewPage} of {totalPreviewPages}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                              disabled={previewPage <= 1}
                              className="p-1 rounded bg-[#1C1534] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#281E48] text-[#F5F1EC] border border-[rgba(107,92,166,0.3)] cursor-pointer"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
                              disabled={previewPage >= totalPreviewPages}
                              className="p-1 rounded bg-[#1C1534] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#281E48] text-[#F5F1EC] border border-[rgba(107,92,166,0.3)] cursor-pointer"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Right Docked AI Copilot Drawer ── */}
      <AICopilotDrawer
        isOpen={isCopilotOpen}
        onToggle={() => setIsCopilotOpen(!isCopilotOpen)}
        chatMessages={copilotChat}
        onSendMessage={handleSendCopilotMessage}
        badge={isCopilotThinking ? 'Thinking...' : activeExam?.copilot_policy}
        title={activeExam?.copilot_policy === 'off' ? 'AI Copilot (Disabled)' : `AI Copilot (${activeExam?.copilot_policy || 'full'})`}
        placeholder={
          activeExam?.copilot_policy === 'off'
            ? 'Copilot is disabled for this exam...'
            : activeExam?.copilot_policy === 'explain-only'
            ? 'Ask conceptual questions (code generation blocked)...'
            : 'Ask AI Copilot for pipeline assistance...'
        }
      />

      {/* ── Safe Exam Browser — Pre-flight Confirmation Modal ── */}
      {renderSebModal()}

      {/* ── Safe Exam Browser — Post-Submit Release Confirm ── */}
      {showSebReleaseModal && pendingReceipt && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-9999 flex items-center justify-center p-4"
            style={{ background: 'rgba(11,9,18,0.92)', backdropFilter: 'blur(14px)' }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
              style={{
                background: 'linear-gradient(145deg, #151026 0%, #1C1534 100%)',
                border: `1.5px solid ${pendingReceipt.passed ? 'rgba(0,245,160,0.5)' : 'rgba(107,92,166,0.4)'}`,
                boxShadow: pendingReceipt.passed
                  ? '0 0 60px rgba(0,245,160,0.15), 0 30px 80px rgba(0,0,0,0.6)'
                  : '0 0 60px rgba(107,92,166,0.15), 0 30px 80px rgba(0,0,0,0.6)',
              }}
            >
              <div className="px-7 py-6 text-center space-y-4">
                <div
                  className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-2xl"
                  style={{
                    background: pendingReceipt.passed ? 'rgba(0,245,160,0.15)' : 'rgba(107,92,166,0.15)',
                    border: `1px solid ${pendingReceipt.passed ? 'rgba(0,245,160,0.4)' : 'rgba(107,92,166,0.4)'}`,
                  }}
                >
                  {pendingReceipt.passed ? '🏆' : '📝'}
                </div>
                <div>
                  <p className="text-[10px] font-bold tracking-widest uppercase mb-1"
                    style={{ color: pendingReceipt.passed ? '#00F5A0' : '#9E93B8' }}>
                    Exam Submitted Successfully
                  </p>
                  <h2 className="text-lg font-bold text-[#F5F1EC]">
                    {pendingReceipt.passed ? 'Congratulations!' : 'Submission Complete'}
                  </h2>
                  <p className="text-sm text-[#9E93B8] mt-1">
                    Final Grade: <strong className="text-[#F5F1EC]">{pendingReceipt.grade_score?.toFixed(1) || '—'} / 100</strong>
                    &nbsp;&bull;&nbsp;
                    <span style={{ color: pendingReceipt.passed ? '#00F5A0' : '#F59E0B' }}>
                      {pendingReceipt.passed ? 'PASSED' : 'COMPLETED'}
                    </span>
                  </p>
                </div>
                <div className="p-3 rounded-xl text-left space-y-1" style={{ background: 'rgba(11,9,18,0.6)', border: '1px solid rgba(107,92,166,0.2)' }}>
                  <p className="text-[11px] text-[#00F5A0] font-semibold">✓ Submission Verified & Cryptographically Sealed</p>
                  <p className="text-[11px] text-[#9E93B8]">Timestamp: <span className="font-mono text-[#F5F1EC]">{new Date().toLocaleTimeString()}</span></p>
                </div>
                <p className="text-xs text-[#6B5CA5]">
                  Lockdown is still active. Click below to exit fullscreen and return to normal mode.
                </p>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    // Release lockdown only after explicit student confirmation
                    setSubmissionReceipt(pendingReceipt);
                    setPendingReceipt(null);
                    setShowSebReleaseModal(false);
                    setExamLocked(false);
                    seb.release();
                    setSebFlagged(false);
                    onShowToast?.('Lockdown Released', 'You have exited safe exam mode.', 'success');
                  }}
                  className="w-full py-3 px-6 rounded-2xl font-bold text-sm text-[#0B0912]"
                  style={{
                    background: 'linear-gradient(135deg, #00D4FF 0%, #00F5A0 100%)',
                    boxShadow: '0 4px 24px rgba(0,212,255,0.3)',
                  }}
                >
                  Exit Lockdown & Return to Normal Mode
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* ── Safe Exam Browser — Violation Overlay ── */}
      {examLocked && (
        <SafeExamViolationOverlay
          violations={seb.violations}
          flagged={sebFlagged}
          studentName={studentDisplayName}
        />
      )}
    </div>
  );
};
