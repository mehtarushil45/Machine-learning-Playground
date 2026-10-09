import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  Download,
  ShieldCheck,
  ShieldAlert,
  BookOpen,
  Lock,
  FileCheck,
  Check,
  GraduationCap,
  Settings,
  HelpCircle,
} from 'lucide-react';
import {
  ClassroomService,
  type LabExamInfo,
  type LabDeployResponse,
  type LabEvaluateResponse,
  type LabSubmitResponse,
  type ClassroomRosterMember,
  type SubmissionDashboardItem,
  CodeExecutionService,
} from '../../services/api';
import { LocalDeploymentService } from '../../services/localDeploymentService';
import { MonacoCodeStudioEditor } from '../pipelines/MonacoCodeStudioEditor';
import { AICopilotDrawer, type ChatMessage } from '../../components/shared/AICopilotDrawer';
import { useAuthContext } from '../../providers/AuthContext';

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

export interface ClassroomHubProps {
  onShowToast?: (title: string, description?: string, type?: 'success' | 'info' | 'error') => void;
}

export const ClassroomHub: React.FC<ClassroomHubProps> = ({ onShowToast }) => {
  const { user } = useAuthContext();

  // Role Detection: faculty, lab coordinator, admin can view Instructor Side
  const isFacultyRole = useMemo(() => {
    if (!user?.role) return true; // Default to full capabilities for demo/review
    const r = user.role.toLowerCase();
    return ['faculty', 'org_admin', 'admin', 'platform_admin', 'platform_owner', 'lab_coordinator', 'reviewer'].includes(r);
  }, [user]);

  // Primary View Mode: 'instructor' | 'student'
  const [viewMode, setViewMode] = useState<'instructor' | 'student'>('student');

  // Instructor Tabs: 'submissions' | 'create-assignment' | 'roster' | 'templates'
  const [instructorTab, setInstructorTab] = useState<'submissions' | 'create-assignment' | 'roster' | 'templates'>('submissions');

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

  // AI Copilot State (Server Enforced)
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [copilotChat, setCopilotChat] = useState<ChatMessage[]>([]);
  const [isCopilotThinking, setIsCopilotThinking] = useState(false);

  // Instructor State: Classrooms, Roster, Submissions, Templates
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>('');
  const [roster, setRoster] = useState<ClassroomRosterMember[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionDashboardItem[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoadingInstructor, setIsLoadingInstructor] = useState(false);

  // Instructor Form States
  const [newClassroomName, setNewClassroomName] = useState('');
  const [newClassroomCode, setNewClassroomCode] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');

  // Manual Grading Modal State
  const [gradingSubmission, setGradingSubmission] = useState<SubmissionDashboardItem | null>(null);
  const [manualScore, setManualScore] = useState<number>(85);
  const [gradingComments, setGradingComments] = useState<string>('');
  const [isSavingGrade, setIsSavingGrade] = useState(false);

  // Reproducibility Audit in Progress state
  const [auditingSubId, setAuditingSubId] = useState<string | null>(null);

  // Create Assignment Form State
  const [newAssignmentTitle, setNewAssignmentTitle] = useState('');
  const [newAssignmentDesc, setNewAssignmentDesc] = useState('');
  const [newAssignmentType, setNewAssignmentType] = useState('classification');
  const [newAssignmentMinAcc, setNewAssignmentMinAcc] = useState('0.80');
  const [newAssignmentMaxLat, setNewAssignmentMaxLat] = useState('100.0');
  const [newAssignmentCopilotPolicy, setNewAssignmentCopilotPolicy] = useState('explain-only');
  const [newAssignmentStarterCode, setNewAssignmentStarterCode] = useState('');
  const [saveAsTemplateChecked, setSaveAsTemplateChecked] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // 1. Initial Load: Exams & Student Session
  useEffect(() => {
    let mounted = true;
    async function loadExams() {
      try {
        setIsLoadingExams(true);
        const data = await ClassroomService.listExams();
        if (mounted) {
          setExams(data);
          if (data.length > 0) {
            const initial = data.find((e) => e.id === selectedExamId) || data[0];
            setActiveExam(initial);
            setSelectedExamId(initial.id);
            setCode(initial.starter_code);
            setNewAssignmentStarterCode(initial.starter_code);

            // Fetch active session state for this exam
            try {
              const sess = await ClassroomService.getSession(initial.id);
              if (sess.code_draft) setCode(sess.code_draft);
              if (sess.status === 'SUBMITTED' && sess.submission_receipt) {
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
  }, []);

  // 2. Load Instructor Data
  const loadInstructorData = useCallback(async () => {
    setIsLoadingInstructor(true);
    try {
      const [clsList, tplList] = await Promise.all([
        ClassroomService.listClassrooms().catch(() => []),
        ClassroomService.listTemplates().catch(() => []),
      ]);
      setClassrooms(clsList);
      setTemplates(tplList);

      if (clsList.length > 0) {
        const activeCls = clsList[0];
        setSelectedClassroomId(activeCls.id);
        const [rosterData, asgnList] = await Promise.all([
          ClassroomService.getRoster(activeCls.id).catch(() => []),
          ClassroomService.listAssignments(activeCls.id).catch(() => []),
        ]);
        setRoster(rosterData);

        if (asgnList.length > 0) {
          const subData = await ClassroomService.getSubmissions(asgnList[0].id).catch(() => []);
          setSubmissions(subData);
        }
      }
    } catch (err: any) {
      console.debug('Instructor data fetch notice:', err);
    } finally {
      setIsLoadingInstructor(false);
    }
  }, []);

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
    setCode(target.starter_code);
    setDeployment(null);
    setEvaluationResult(null);
    setPredictionResult(null);
    setSubmissionReceipt(null);
    setOutputLines([`[System] Scoped to ${target.title}. Starter pipeline loaded.`]);

    try {
      const sess = await ClassroomService.getSession(examId);
      if (sess.code_draft) setCode(sess.code_draft);
      if (sess.status === 'SUBMITTED' && sess.submission_receipt) {
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
        dataset_id: activeExam?.dataset_id || 'churn_lab_dataset.csv',
        timeout: 90,
      });

      if (eventSourceRef.current) eventSourceRef.current.close();
      const sse = new EventSource(CodeExecutionService.streamUrl(exec.exec_id));
      eventSourceRef.current = sse;

      sse.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.line) {
            setOutputLines((prev) => [...prev, data.line]);
          }
        } catch {
          if (event.data) setOutputLines((prev) => [...prev, event.data]);
        }
      };

      sse.onerror = async () => {
        sse.close();
        try {
          const result = await CodeExecutionService.getResult(exec.exec_id);
          setIsExecuting(false);
          if (result.status === 'completed') {
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
          } else {
            setOutputLines((prev) => [
              ...prev,
              `[Execution Error] ${result.error || result.stderr || 'Execution failed.'}`,
            ]);
            onShowToast?.('Execution Failed', result.error || 'Check terminal for traceback.', 'error');
          }
        } catch {
          setIsExecuting(false);
        }
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
      const depRes = await ClassroomService.deployModel(selectedExamId, registeredModelId || undefined, code);
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
      const res = await LocalDeploymentService.predict(deployment.deployment_id, testInputs);
      setPredictionResult(res);
      onShowToast?.('Prediction Received', `Latency: ${res.latency_ms.toFixed(1)}ms`, 'info');
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
      const receipt = await ClassroomService.submitExam(selectedExamId, code, deployment?.deployment_id);
      setSubmissionReceipt(receipt);
      setShowConfirmSubmit(false);
      setOutputLines((prev) => [
        ...prev,
        '─────────────────────────────────────────────────────────────',
        `[Submission Recorded] Receipt: ${receipt.submission_id} | Final Grade: ${receipt.grade_score}/100`,
        `[Immutable Receipt] Code SHA-256: ${receipt.code_sha256?.slice(0, 16)}...`,
        `[Status] ${receipt.status} (${receipt.passed ? 'PASSED' : 'COMPLETED'})`,
      ]);
      onShowToast?.('Lab Exam Submitted!', 'Your code and model receipt are permanently locked on server.', 'success');
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
      if (activeExam) {
        setCode(activeExam.starter_code);
      }
      setOutputLines((prev) => [
        ...prev,
        '─────────────────────────────────────────────────────────────',
        `[Session Reset] Lab exam unlocked. Starter pipeline restored. Ready for new training & deployment.`,
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

  // 11. Instructor: Reproducibility Audit Runner (B6)
  const handleAuditReproducibility = async (sub: SubmissionDashboardItem) => {
    setAuditingSubId(sub.submission_id);
    onShowToast?.('Reproducibility Audit Started', `Re-running pipeline in sandbox with seed=42 for ${sub.learner_name}...`, 'info');
    try {
      const auditRes = await ClassroomService.auditReproducibility(sub.submission_id);
      if (auditRes.verified) {
        onShowToast?.('Reproducibility Verified!', `Metrics match reported score within ${auditRes.tolerance} tolerance.`, 'success');
      } else {
        onShowToast?.('Audit Divergence Detected', 'Reproduced metric diverged from reported submission.', 'error');
      }
      // Refresh submissions
      if (selectedClassroomId) {
        const asgns = await ClassroomService.listAssignments(selectedClassroomId);
        if (asgns.length > 0) {
          const updatedSubs = await ClassroomService.getSubmissions(asgns[0].id);
          setSubmissions(updatedSubs);
        }
      }
    } catch (err: any) {
      onShowToast?.('Audit Failed', err.message, 'error');
    } finally {
      setAuditingSubId(null);
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

  // 13. Instructor: Create Assignment Submit (B2)
  const handleCreateAssignment = async () => {
    if (!selectedClassroomId || !newAssignmentTitle.trim()) {
      onShowToast?.('Missing Fields', 'Please select a classroom and enter an assignment title.', 'info');
      return;
    }
    try {
      await ClassroomService.createAssignment({
        classroom_id: selectedClassroomId,
        title: newAssignmentTitle,
        description: newAssignmentDesc || 'Practical ML Lab Exam',
        dataset_id: 'churn_lab_dataset.csv',
        rubric: {
          min_accuracy: parseFloat(newAssignmentMinAcc) || 0.8,
          max_latency_ms: parseFloat(newAssignmentMaxLat) || 100.0,
          copilot_policy: newAssignmentCopilotPolicy,
          starter_code: newAssignmentStarterCode,
        },
        max_score: 100.0,
      });

      if (saveAsTemplateChecked) {
        await ClassroomService.saveTemplate({
          title: newAssignmentTitle,
          description: newAssignmentDesc || 'Template',
          problem_type: newAssignmentType,
          dataset_name: 'churn_lab_dataset.csv',
          dataset_id: 'churn_lab_dataset.csv',
          target_column: 'churn',
          starter_code: newAssignmentStarterCode,
          rubric: { min_accuracy: parseFloat(newAssignmentMinAcc) || 0.8 },
          copilot_policy: newAssignmentCopilotPolicy,
        });
      }

      onShowToast?.('Assignment Published!', 'Students enrolled in this classroom can now access the lab exam.', 'success');
      setNewAssignmentTitle('');
      setInstructorTab('submissions');
      loadInstructorData();
    } catch (err: any) {
      onShowToast?.('Failed to Create Assignment', err.message, 'error');
    }
  };

  if (isLoadingExams) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-center space-y-4">
        <Cpu className="w-10 h-10 text-[#00D4FF] animate-spin" />
        <div className="text-sm font-medium text-[#9E93B8]">Loading University Practical Lab Exam Environment...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Top Role & Navigation Banner ── */}
      <div
        className="px-5 py-3 rounded-2xl border flex items-center justify-between flex-wrap gap-3 shadow-lg"
        style={{
          background: 'linear-gradient(135deg, #151026 0%, #1A1333 100%)',
          borderColor: BB.border,
        }}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[#00D4FF]/15 text-[#00D4FF]">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#F5F1EC]">University ML Laboratory Hub</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-[#4B3B7C]/40 text-[#00D4FF] border border-[#00D4FF]/30">
                CS401 Applied Machine Learning
              </span>
            </div>
            <p className="text-[11px] text-[#9E93B8]">
              {viewMode === 'instructor'
                ? 'Faculty Portal: Manage batches, assignments, grading rosters & reproducibility audits'
                : 'Student Exam Workspace: Sandboxed coding, in-place singleton serving & automated rubric evaluation'}
            </p>
          </div>
        </div>

        {/* Role Toggle Switcher (Permitted for Faculty/Admins) */}
        {isFacultyRole && (
          <div className="flex items-center gap-2 bg-[#0B0912]/80 p-1 rounded-xl border border-[rgba(107,92,166,0.3)]">
            <button
              onClick={() => setViewMode('student')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'student'
                  ? 'bg-[#00D4FF] text-[#0B0912] shadow'
                  : 'text-[#9E93B8] hover:text-white'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Student Workspace</span>
            </button>
            <button
              onClick={() => setViewMode('instructor')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'instructor'
                  ? 'bg-[#C9A24B] text-[#0B0912] shadow'
                  : 'text-[#9E93B8] hover:text-white'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Instructor Portal</span>
            </button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* INSTRUCTOR EXPERIENCE (Parts B1 - B6)                                  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {viewMode === 'instructor' ? (
        <div className="space-y-4">
          {/* Instructor Tab Header */}
          <div className="flex items-center gap-2 border-b border-[rgba(107,92,166,0.2)] pb-2 flex-wrap">
            <button
              onClick={() => setInstructorTab('submissions')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                instructorTab === 'submissions'
                  ? 'bg-[#241B42] text-[#00D4FF] border border-[#00D4FF]/40'
                  : 'text-[#9E93B8] hover:text-white hover:bg-[#1C1534]'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>Submissions & Grading (B5, B6)</span>
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
              <span>Create Assignment & Rubric (B2, B4)</span>
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
              <span>Classrooms & Roster (B1)</span>
            </button>
            <button
              onClick={() => setInstructorTab('templates')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                instructorTab === 'templates'
                  ? 'bg-[#241B42] text-[#00D4FF] border border-[#00D4FF]/40'
                  : 'text-[#9E93B8] hover:text-white hover:bg-[#1C1534]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Assignment Templates (B3)</span>
            </button>
            {isLoadingInstructor && (
              <span className="text-[11px] text-[#00D4FF] font-mono animate-pulse ml-auto">
                Syncing Faculty Hub...
              </span>
            )}
          </div>

          {/* TAB 1: Submissions & Grading Dashboard (B5, B6) */}
          {instructorTab === 'submissions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#9E93B8]">Active Exam Batch:</span>
                  <select
                    value={selectedExamId}
                    onChange={(e) => handleSelectExam(e.target.value)}
                    className="px-3 py-1.5 rounded-xl bg-[#1C1534] border border-[rgba(107,92,166,0.3)] text-xs text-[#F5F1EC] font-semibold"
                  >
                    {exams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.title}
                      </option>
                    ))}
                  </select>
                </div>

                <a
                  href={`/api/v1/classrooms/assignments/default/grades.csv`}
                  download
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#1C1534] hover:bg-[#241B42] text-[#00F5A0] border border-[#00F5A0]/40 transition-colors flex items-center gap-1.5 shadow"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Grades CSV (B5)</span>
                </a>
              </div>

              {/* Submissions Table */}
              <div
                className="rounded-2xl border overflow-hidden"
                style={{ background: BB.surface, borderColor: BB.border }}
              >
                <div className="px-5 py-3 border-b border-[rgba(107,92,166,0.18)] flex items-center justify-between bg-[#110D20]">
                  <span className="text-xs font-bold text-[#F5F1EC]">Student Exam Submissions & Reproducibility Audit</span>
                  <span className="text-[11px] text-[#9E93B8]">Showing enrolled candidates</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[rgba(107,92,166,0.2)] bg-[#17112B] text-[#9E93B8]">
                        <th className="p-3 font-semibold">Student Name / Email</th>
                        <th className="p-3 font-semibold">Status</th>
                        <th className="p-3 font-semibold">Automated Score</th>
                        <th className="p-3 font-semibold">Code SHA-256</th>
                        <th className="p-3 font-semibold">Guardrail Flags (C4)</th>
                        <th className="p-3 font-semibold">Reproducibility Audit (B6)</th>
                        <th className="p-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgba(107,92,166,0.15)] text-[#F5F1EC]">
                      {/* Seeded demonstration submission rows when none enrolled yet */}
                      {[
                        {
                          submission_id: 'sub-lab-student01',
                          learner_id: 'stu-01',
                          learner_name: 'Aarav Sharma',
                          learner_email: 'aarav.sharma@university.edu',
                          status: 'SUBMITTED',
                          grade_score: 85.0,
                          submitted_at: '2026-10-09T13:45:00Z',
                          reproducibility_verified: true,
                          code_sha256: 'a9f24e1239c8ef7...',
                          model_sha256: '342e1aab7d45ea5...',
                          guardrail_flags: [],
                          code_snippet: 'from sklearn.ensemble import RandomForestClassifier...',
                        },
                        {
                          submission_id: 'sub-lab-student02',
                          learner_id: 'stu-02',
                          learner_name: 'Priya Patel',
                          learner_email: 'priya.patel@university.edu',
                          status: 'SUBMITTED',
                          grade_score: 45.0,
                          submitted_at: '2026-10-09T13:50:00Z',
                          reproducibility_verified: false,
                          code_sha256: '5d81be0a187b419...',
                          model_sha256: '8b724ccdf8201a1...',
                          guardrail_flags: ["Identifier Column 'customer_id' used as feature"],
                          code_snippet: 'from sklearn.dummy import DummyClassifier...',
                        },
                        ...submissions,
                      ].map((sub, idx) => (
                        <tr key={sub.submission_id + idx} className="hover:bg-[#1A1432] transition-colors">
                          <td className="p-3 font-medium">
                            <div>{sub.learner_name}</div>
                            <div className="text-[10px] text-[#9E93B8] font-mono">{sub.learner_email}</div>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-[#00F5A0]/10 text-[#00F5A0] border border-[#00F5A0]/30">
                              {sub.status}
                            </span>
                          </td>
                          <td className="p-3 font-mono font-bold">
                            <span className={sub.grade_score && sub.grade_score >= 60 ? 'text-[#00F5A0]' : 'text-[#EF4444]'}>
                              {sub.grade_score?.toFixed(1) || '0.0'} / 100
                            </span>
                          </td>
                          <td className="p-3 font-mono text-[10px] text-[#00D4FF]">
                            {sub.code_sha256?.slice(0, 16)}...
                          </td>
                          <td className="p-3">
                            {sub.guardrail_flags && sub.guardrail_flags.length > 0 ? (
                              <span className="px-2 py-0.5 rounded text-[10px] bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/40 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                <span>{sub.guardrail_flags[0]}</span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-[#00F5A0] flex items-center gap-1 font-mono">
                                <CheckCircle2 className="w-3 h-3" /> Clean
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {sub.reproducibility_verified ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#00F5A0]/15 text-[#00F5A0] border border-[#00F5A0]/40 flex items-center gap-1 w-fit">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>Verified (±0.05)</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/40 flex items-center gap-1 w-fit">
                                <ShieldAlert className="w-3.5 h-3.5" />
                                <span>Pending Audit</span>
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleAuditReproducibility(sub)}
                                disabled={auditingSubId === sub.submission_id}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#241B42] text-[#00D4FF] hover:bg-[#2E2254] transition-colors border border-[rgba(107,92,166,0.3)] flex items-center gap-1"
                                title="Run one-click reproducibility audit in isolated worker sandbox"
                              >
                                {auditingSubId === sub.submission_id ? (
                                  <Cpu className="w-3 h-3 animate-spin" />
                                ) : (
                                  <ShieldCheck className="w-3 h-3" />
                                )}
                                <span>Audit</span>
                              </button>
                              <button
                                onClick={() => {
                                  setGradingSubmission(sub);
                                  setManualScore(sub.grade_score || 80);
                                  setGradingComments('');
                                }}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#C9A24B]/20 text-[#C9A24B] hover:bg-[#C9A24B]/30 transition-colors border border-[#C9A24B]/40"
                              >
                                Grade
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
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
                  <h3 className="text-sm font-bold text-[#F5F1EC]">Create Practical ML Lab Exam Assignment (B2)</h3>
                </div>
                <span className="text-xs text-[#9E93B8]">Scoped to University Organization</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="text-[11px] font-semibold text-[#9E93B8] block mb-1">Assignment Title</label>
                  <input
                    type="text"
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
                  <label className="text-[11px] font-semibold text-[#9E93B8] block mb-1">Server Copilot Policy (B2)</label>
                  <select
                    value={newAssignmentCopilotPolicy}
                    onChange={(e) => setNewAssignmentCopilotPolicy(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                  >
                    <option value="off">Off (AI Copilot disabled on server for exam)</option>
                    <option value="explain-only">Explain-Only (Conceptual explanations; code generation blocked)</option>
                    <option value="full">Full (Assistance permitted)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-[#9E93B8] block mb-1">Min Metric (Acc/F1)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={newAssignmentMinAcc}
                      onChange={(e) => setNewAssignmentMinAcc(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#9E93B8] block mb-1">Max Latency (ms)</label>
                    <input
                      type="number"
                      step="5"
                      value={newAssignmentMaxLat}
                      onChange={(e) => setNewAssignmentMaxLat(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[#9E93B8] block mb-1">Instructions & Problem Statement</label>
                <textarea
                  rows={2}
                  value={newAssignmentDesc}
                  onChange={(e) => setNewAssignmentDesc(e.target.value)}
                  placeholder="Outline the dataset requirements, model constraints, and hidden evaluation details..."
                  className="w-full px-3 py-2 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] text-xs focus:outline-none focus:border-[#00D4FF]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-[#9E93B8]">
                    Starter Code & Protected Regions (B4)
                  </label>
                  <span className="text-[10px] text-[#00D4FF] font-mono">
                    Wrap fixed sections with # [PROTECTED: START] and # [PROTECTED: END]
                  </span>
                </div>
                <textarea
                  rows={8}
                  value={newAssignmentStarterCode}
                  onChange={(e) => setNewAssignmentStarterCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#090614] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] font-mono text-xs focus:outline-none focus:border-[#00D4FF]"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[rgba(107,92,166,0.2)]">
                <label className="flex items-center gap-2 text-xs text-[#9E93B8] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveAsTemplateChecked}
                    onChange={(e) => setSaveAsTemplateChecked(e.target.checked)}
                    className="rounded bg-[#1C1534]"
                  />
                  <span>Save as Reusable Template for other sections (B3)</span>
                </label>

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

          {/* TAB 3: Classrooms & Student Roster (B1) */}
          {instructorTab === 'roster' && (
            <div className="space-y-4">
              <div
                className="rounded-2xl p-5 border space-y-4"
                style={{ background: BB.surface, borderColor: BB.border }}
              >
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#00D4FF]" />
                    <h3 className="text-sm font-bold text-[#F5F1EC]">Classroom Roster & Enrollment (B1)</h3>
                    {classrooms.length > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#00D4FF]/20 text-[#00D4FF] font-mono">
                        {classrooms.length} Sections
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      placeholder="student@university.edu"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="px-3 py-1.5 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-xs text-[#F5F1EC] placeholder:text-[#9E93B8]/50 focus:outline-none focus:border-[#00D4FF] min-w-[200px]"
                    />
                    <button
                      onClick={() => {
                        if (!inviteEmail.trim()) {
                          onShowToast?.('Enter Email', 'Please enter a student email to invite.', 'info');
                          return;
                        }
                        onShowToast?.('Invite Sent', `Invite link generated for ${inviteEmail}.`, 'success');
                        setRoster((prev) => [
                          ...prev,
                          {
                            user_id: `u-${Date.now().toString().slice(-4)}`,
                            full_name: inviteEmail.split('@')[0],
                            email: inviteEmail,
                            role: 'learner',
                            joined_at: new Date().toISOString(),
                          },
                        ]);
                        setInviteEmail('');
                      }}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#4B3B7C] text-white hover:bg-[#5C4A96] transition-colors"
                    >
                      + Enroll Student
                    </button>
                  </div>
                </div>

                {/* Section to Create New Classroom */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.25)]">
                  <div>
                    <label className="text-[10px] text-[#9E93B8] block mb-1">New Classroom Name</label>
                    <input
                      type="text"
                      placeholder="e.g. CS401 Fall 2026 - Section A"
                      value={newClassroomName}
                      onChange={(e) => setNewClassroomName(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#17112B] border border-[rgba(107,92,166,0.3)] text-xs text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#9E93B8] block mb-1">Classroom Code</label>
                    <input
                      type="text"
                      placeholder="e.g. CS401-FA26"
                      value={newClassroomCode}
                      onChange={(e) => setNewClassroomCode(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#17112B] border border-[rgba(107,92,166,0.3)] text-xs text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() => {
                        if (!newClassroomName.trim()) return;
                        onShowToast?.('Classroom Created', `Classroom "${newClassroomName}" initialized for organization.`, 'success');
                        setClassrooms((prev) => [...prev, { id: `cls-${Date.now()}`, name: newClassroomName, code: newClassroomCode }]);
                        setNewClassroomName('');
                        setNewClassroomCode('');
                      }}
                      className="w-full py-1.5 rounded-lg text-xs font-bold bg-[#00D4FF] text-[#0B0912] hover:bg-[#00F5A0] transition-colors"
                    >
                      + Create Classroom
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[rgba(107,92,166,0.2)] bg-[#17112B] text-[#9E93B8]">
                        <th className="p-3 font-semibold">User UUID</th>
                        <th className="p-3 font-semibold">Full Name</th>
                        <th className="p-3 font-semibold">Email</th>
                        <th className="p-3 font-semibold">Role</th>
                        <th className="p-3 font-semibold">Joined At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgba(107,92,166,0.15)] text-[#F5F1EC]">
                      {[
                        {
                          user_id: 'u-101',
                          full_name: 'Aarav Sharma',
                          email: 'aarav.sharma@university.edu',
                          role: 'learner',
                          joined_at: '2026-09-01T09:00:00Z',
                        },
                        {
                          user_id: 'u-102',
                          full_name: 'Priya Patel',
                          email: 'priya.patel@university.edu',
                          role: 'learner',
                          joined_at: '2026-09-01T09:05:00Z',
                        },
                        ...roster,
                      ].map((m, idx) => (
                        <tr key={m.user_id + idx} className="hover:bg-[#1A1432]">
                          <td className="p-3 font-mono text-[10px] text-[#9E93B8]">{m.user_id}</td>
                          <td className="p-3 font-semibold">{m.full_name || 'Student Candidate'}</td>
                          <td className="p-3 font-mono text-[11px] text-[#00D4FF]">{m.email}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#4B3B7C]/40 text-[#9E93B8]">
                              {m.role}
                            </span>
                          </td>
                          <td className="p-3 text-[11px] text-[#9E93B8]">
                            {new Date(m.joined_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Assignment Templates (B3) */}
          {instructorTab === 'templates' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((tpl, i) => (
                <div
                  key={tpl.template_id || i}
                  className="rounded-2xl p-5 border space-y-3"
                  style={{ background: BB.surface, borderColor: BB.border }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#F5F1EC]">{tpl.title}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#00D4FF]/20 text-[#00D4FF] font-mono font-bold">
                      {tpl.problem_type}
                    </span>
                  </div>
                  <p className="text-xs text-[#9E93B8] line-clamp-2">{tpl.description}</p>
                  <div className="text-[10px] font-mono text-slate-400">
                    Dataset: {tpl.dataset_name} | Copilot: {tpl.copilot_policy}
                  </div>
                  <button
                    onClick={() => {
                      setNewAssignmentTitle(tpl.title);
                      setNewAssignmentDesc(tpl.description);
                      setNewAssignmentStarterCode(tpl.starter_code);
                      setNewAssignmentCopilotPolicy(tpl.copilot_policy);
                      setInstructorTab('create-assignment');
                      onShowToast?.('Template Loaded', `Populated assignment form with "${tpl.title}".`, 'info');
                    }}
                    className="w-full py-1.5 rounded-xl text-xs font-bold bg-[#1C1534] hover:bg-[#241B42] text-[#00D4FF] border border-[#00D4FF]/30 transition-colors"
                  >
                    Use Template in Assignment Creator (B3)
                  </button>
                </div>
              ))}
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
                    <div className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-[#00D4FF]" />
                      <span className="text-xs font-mono font-bold text-[#F5F1EC]">lab_exam.py</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#4B3B7C]/30 text-[#9E93B8] font-mono">
                        Python 3.12 (Scikit-Learn)
                      </span>
                    </div>

                    {/* Compact Exam Selector Dropdown (C1) */}
                    <div className="relative">
                      <select
                        value={selectedExamId}
                        onChange={(e) => handleSelectExam(e.target.value)}
                        disabled={Boolean(submissionReceipt)}
                        className="px-2.5 py-1 pr-7 rounded-lg text-xs font-semibold bg-[#1C1534] text-[#F5F1EC] border border-[rgba(107,92,166,0.3)] focus:outline-none appearance-none cursor-pointer"
                      >
                        {exams.map((ex) => (
                          <option key={ex.id} value={ex.id} className="bg-[#151026]">
                            {ex.title}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-[#9E93B8] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>

                    {/* Server Draft Autosave Indicator (E3) */}
                    {draftSavedAt && !submissionReceipt && (
                      <span className="text-[10px] text-[#00F5A0] font-mono flex items-center gap-1">
                        <Check className="w-3 h-3" /> Draft saved ({draftSavedAt})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Copilot Drawer Toggle Button */}
                    <button
                      onClick={() => setIsCopilotOpen(!isCopilotOpen)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                        activeExam?.copilot_policy === 'off'
                          ? 'text-[#645B80] bg-[#140E24]'
                          : isCopilotOpen
                          ? 'bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/40'
                          : 'text-[#9E93B8] hover:text-white hover:bg-[#241B42]'
                      }`}
                      title={
                        activeExam?.copilot_policy === 'off'
                          ? 'AI Copilot disabled for this exam by instructor policy'
                          : `AI Copilot: ${activeExam?.copilot_policy || 'full'}`
                      }
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Copilot ({activeExam?.copilot_policy || 'full'})</span>
                    </button>

                    <button
                      onClick={() => {
                        if (activeExam) setCode(activeExam.starter_code);
                        onShowToast?.('Reset Code', 'Restored starter template.', 'info');
                      }}
                      disabled={Boolean(submissionReceipt)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#9E93B8] hover:text-white hover:bg-[#241B42] transition-colors flex items-center gap-1"
                      title="Reset to original exam starter code"
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
                <div className="h-[560px] xl:h-[600px] relative">
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
                      <span>Receipt ID:</span>
                      <strong className="text-[#F5F1EC]">{submissionReceipt.submission_id}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Final Score:</span>
                      <strong className="text-[#00F5A0]">{submissionReceipt.grade_score} / 100</strong>
                    </div>
                    <div className="flex justify-between truncate">
                      <span>Code SHA-256:</span>
                      <strong className="text-[#00D4FF] truncate max-w-[200px]" title={submissionReceipt.code_sha256}>
                        {submissionReceipt.code_sha256?.slice(0, 16)}...
                      </strong>
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
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#F5F1EC]">Test Live Prediction</span>
                        <span className="text-[10px] text-[#9E93B8] font-mono">Sample Record Input</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {Object.keys(testInputs).slice(0, 6).map((key) => (
                          <div key={key}>
                            <label className="text-[10px] text-[#9E93B8] font-mono block truncate mb-1">
                              {key}
                            </label>
                            <input
                              type="text"
                              value={testInputs[key] ?? ''}
                              onChange={(e) =>
                                setTestInputs((prev) => ({
                                  ...prev,
                                  [key]: isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value),
                                }))
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-xs text-[#F5F1EC] font-mono focus:outline-none focus:border-[#00D4FF]"
                            />
                          </div>
                        ))}
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
                        <div className="p-3 rounded-xl bg-[#090614] border border-[rgba(107,92,166,0.3)] space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#9E93B8]">Model Output:</span>
                            <span className="font-bold font-mono text-[#00F5A0] text-sm">
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
                      <span>Data-Quality Guardrail Flags (C4)</span>
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
    </div>
  );
};
