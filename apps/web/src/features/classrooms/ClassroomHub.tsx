import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GraduationCap,
  Play,
  Rocket,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Terminal,
  FileCode,
  RotateCcw,
  Sparkles,
  Award,
  Layers,
  ChevronDown,
  Info,
  Cpu,
  Zap,
} from 'lucide-react';
import {
  ClassroomService,
  type LabExamInfo,
  type LabDeployResponse,
  type LabEvaluateResponse,
  type LabSubmitResponse,
  CodeExecutionService,
} from '../../services/api';
import { LocalDeploymentService } from '../../services/localDeploymentService';
import { MonacoCodeStudioEditor } from '../pipelines/MonacoCodeStudioEditor';

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
  // Exam selection & catalog state
  const [exams, setExams] = useState<LabExamInfo[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('lab-exam-01');
  const [activeExam, setActiveExam] = useState<LabExamInfo | null>(null);
  const [isLoadingExams, setIsLoadingExams] = useState(true);

  // Student manual coding state
  const [code, setCode] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [registeredModelId, setRegisteredModelId] = useState<string | null>(null);
  const [outputLines, setOutputLines] = useState<string[]>([]);

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

  // Exam Submission & Timer
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionReceipt, setSubmissionReceipt] = useState<LabSubmitResponse | null>(null);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(90 * 60); // 90 min timer

  const eventSourceRef = useRef<EventSource | null>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // 1. Load Lab Exams on Mount
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
            setSecondsRemaining((initial.duration_minutes || 90) * 60);
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

  // 2. Exam Switch Handler
  const handleSelectExam = (examId: string) => {
    const target = exams.find((e) => e.id === examId);
    if (!target) return;
    setSelectedExamId(examId);
    setActiveExam(target);
    setCode(target.starter_code);
    setDeployment(null);
    setEvaluationResult(null);
    setPredictionResult(null);
    setSubmissionReceipt(null);
    setOutputLines([`[System] Switched to ${target.title}. Starter code loaded.`]);
    setSecondsRemaining((target.duration_minutes || 90) * 60);
  };

  // 3. Countdown Timer
  useEffect(() => {
    if (submissionReceipt) return; // Freeze timer once submitted
    if (typeof window !== 'undefined' && ((window as any).VITEST || process.env.NODE_ENV === 'test')) {
      return;
    }
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [submissionReceipt]);

  const formatTimer = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 4. Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [outputLines]);

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
        dataset_id: activeExam?.dataset_id || 'dataset.csv',
        timeout: 90,
      });

      // Connect to SSE stream
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
        // Poll final status
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
            } else if (result.artifacts && result.artifacts.length > 0) {
              setOutputLines((prev) => [
                ...prev,
                `[Artifacts Found] ${result.artifacts.join(', ')}`,
              ]);
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

      // Initialize test inputs from sample_inputs
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
      setOutputLines((prev) => [
        ...prev,
        `[Deployment Error] ${errMsg}`,
      ]);
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
        `[Status] ${receipt.status} (${receipt.passed ? 'PASSED' : 'COMPLETED'})`,
      ]);
      onShowToast?.('Lab Exam Submitted!', 'Your code and final model have been officially recorded.', 'success');
    } catch (err: any) {
      const errMsg = err.message || 'Submission failed.';
      onShowToast?.('Submission Error', errMsg, 'error');
      setOutputLines((prev) => [
        ...prev,
        `[Submission Error] ${errMsg}`,
      ]);
    } finally {
      setIsSubmitting(false);
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
    <div className="space-y-6">
      {/* ── 1. Top Lab Exam Header & Timer Bar ────────────────────────────── */}
      <div
        className="rounded-2xl p-5 border relative overflow-hidden backdrop-blur-xl"
        style={{
          background: 'linear-gradient(135deg, rgba(21, 16, 38, 0.95) 0%, rgba(36, 27, 66, 0.95) 100%)',
          borderColor: BB.border,
        }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div
              className="p-3 rounded-xl border flex items-center justify-center"
              style={{
                background: 'rgba(75, 59, 124, 0.25)',
                borderColor: 'rgba(124, 107, 174, 0.4)',
                boxShadow: '0 0 20px rgba(0, 212, 255, 0.15)',
              }}
            >
              <GraduationCap className="w-7 h-7 text-[#00D4FF]" />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-[#4B3B7C]/40 text-[#00D4FF] border border-[#7C6BAE]/30">
                  {activeExam?.course_code || 'CS401'}
                </span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-[#00F5A0]/10 text-[#00F5A0] border border-[#00F5A0]/20">
                  {submissionReceipt ? 'EXAM SUBMITTED (LOCKED)' : 'LIVE LAB EXAM IN PROGRESS'}
                </span>
              </div>
              <h1 className="text-xl font-bold text-[#F5F1EC] mt-1 flex items-center gap-2">
                {activeExam?.title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Exam Selector */}
            <div className="relative">
              <select
                value={selectedExamId}
                onChange={(e) => handleSelectExam(e.target.value)}
                disabled={Boolean(submissionReceipt)}
                className="px-3 py-2 pr-8 rounded-xl text-xs font-semibold bg-[#1C1534] text-[#F5F1EC] border border-[rgba(107,92,166,0.3)] focus:outline-none appearance-none cursor-pointer"
              >
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id} className="bg-[#151026]">
                    {ex.title}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-[#9E93B8] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Countdown Clock */}
            <div
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-mono font-bold"
              style={{
                background: secondsRemaining < 600 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(0, 212, 255, 0.08)',
                borderColor: secondsRemaining < 600 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(0, 212, 255, 0.25)',
                color: secondsRemaining < 600 ? '#EF4444' : '#00D4FF',
              }}
            >
              <Clock className="w-4 h-4 animate-pulse" />
              <span>{formatTimer(secondsRemaining)}</span>
            </div>

            {/* Instructions toggle */}
            <button
              onClick={() => setShowInstructions(!showInstructions)}
              className="px-3 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors"
              style={{
                background: showInstructions ? 'rgba(124, 107, 174, 0.3)' : 'rgba(27, 21, 48, 0.6)',
                borderColor: BB.border,
                color: BB.text,
              }}
            >
              <Info className="w-4 h-4 text-[#00D4FF]" />
              <span>Rubric & Specs</span>
            </button>

            {/* Final Submit Button */}
            {!submissionReceipt ? (
              <button
                onClick={() => setShowConfirmSubmit(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-1.5"
                style={{
                  background: 'linear-gradient(135deg, #00D4FF 0%, #0099FF 100%)',
                  color: '#0B0912',
                }}
              >
                <Award className="w-4 h-4" />
                <span>Submit Final Exam</span>
              </button>
            ) : (
              <div className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#00F5A0]/20 text-[#00F5A0] border border-[#00F5A0]/40 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Score: {submissionReceipt.grade_score}/100</span>
              </div>
            )}
          </div>
        </div>

        {/* Problem Specifications Dropdown / Banner */}
        <AnimatePresence>
          {showInstructions && activeExam && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-4 pt-4 border-t border-[rgba(107,92,166,0.2)] text-xs text-[#9E93B8] space-y-3"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3 rounded-xl bg-[#1C1534] border border-[rgba(107,92,166,0.2)]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#00D4FF] block mb-1">
                    Problem Objective
                  </span>
                  <p className="text-[#F5F1EC] text-[11px] leading-relaxed">{activeExam.description}</p>
                </div>
                <div className="p-3 rounded-xl bg-[#1C1534] border border-[rgba(107,92,166,0.2)]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#00F5A0] block mb-1">
                    Target & Features
                  </span>
                  <div className="text-[11px] text-[#F5F1EC]">
                    <div><strong>Target Column:</strong> <span className="font-mono text-[#00D4FF]">{activeExam.target_column}</span></div>
                    <div><strong>Lab Dataset:</strong> <span className="font-mono text-slate-300">{activeExam.dataset_name}</span></div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {activeExam.feature_columns.map((fc) => (
                        <span key={fc} className="px-1.5 py-0.5 rounded bg-[#2A2247] text-[10px] text-slate-300 font-mono">
                          {fc}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#1C1534] border border-[rgba(107,92,166,0.2)]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#C9A24B] block mb-1">
                    Grading Rubric
                  </span>
                  <ul className="text-[11px] text-[#F5F1EC] space-y-1">
                    <li>• Serving Endpoint Health: <strong>15 pts</strong></li>
                    <li>• Feature Preprocessing & Schema: <strong>20 pts</strong></li>
                    <li>• Latency Benchmark (&lt; {activeExam.rubric.max_latency_ms || 100}ms): <strong>30 pts</strong></li>
                    <li>• Performance Metric Threshold: <strong>35 pts</strong></li>
                  </ul>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── 2. Main Lab Workspace: Left (Editor + Terminal) & Right (Deployment + Grading) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
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
            <div className="px-4 py-3 border-b border-[rgba(107,92,166,0.2)] flex items-center justify-between flex-wrap gap-2 bg-[#100C1E]">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-[#00D4FF]" />
                <span className="text-xs font-mono font-bold text-[#F5F1EC]">lab_exam.py</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#4B3B7C]/30 text-[#9E93B8] font-mono">
                  Python 3.14 (Scikit-Learn)
                </span>
              </div>

              <div className="flex items-center gap-2">
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
                      ? 'Re-deploy updated model in-place (hot reload with no new deployment created)'
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
              </div>
            </div>

            {/* Monaco Python Editor Component */}
            <div className="h-[460px] relative">
              <MonacoCodeStudioEditor
                code={code}
                onChange={(newVal) => setCode(newVal)}
                filename="lab_exam.py"
                onRunCode={handleRunCode}
                readOnly={Boolean(submissionReceipt)}
                minimapEnabled={false}
              />
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
                      line.includes('[Error]') || line.includes('[stderr]')
                        ? 'text-[#EF4444]'
                        : line.includes('[Lab Result]') || line.includes('[Artifact]') || line.includes('[Deployment')
                        ? 'text-[#00F5A0] font-semibold'
                        : line.includes('[Lab Metrics]')
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
          {/* Deployment Slot Status Card */}
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

          {/* Automated Rubric Benchmark Grading Card */}
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
              latency thresholds, and performance metrics.
            </p>

            <button
              onClick={handleEvaluateRubric}
              disabled={isEvaluating || !deployment}
              className="w-full py-2.5 rounded-xl text-xs font-bold transition-all shadow flex items-center justify-center gap-2"
              style={{
                background: !deployment
                  ? '#241B42'
                  : 'linear-gradient(135deg, #C9A24B 0%, #A27B2A 100%)',
                color: !deployment ? '#645B80' : '#0B0912',
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

            {/* Criteria Breakdown */}
            {evaluationResult && (
              <div className="space-y-2 pt-2 border-t border-[rgba(107,92,166,0.18)]">
                {evaluationResult.criteria_results.map((c, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-xl bg-[#140E24] border border-[rgba(107,92,166,0.2)] text-xs flex items-center justify-between"
                  >
                    <div className="space-y-0.5 pr-2">
                      <div className="font-semibold text-[#F5F1EC] flex items-center gap-1.5">
                        {c.passed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#00F5A0] shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-[#EF4444] shrink-0" />
                        )}
                        <span>{c.criterion}</span>
                      </div>
                      <div className="text-[10px] text-[#9E93B8]">{c.description}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-[11px] text-[#F5F1EC]">
                        {c.points_awarded}/{c.max_points}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. Final Submission Confirmation Modal ───────────────────────── */}
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
                  <p className="text-xs text-[#9E93B8]">Once submitted, your code and model will be locked.</p>
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
                    {deployment ? `v${deployment.version_count}.0` : 'None (No active model)'}
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
  );
};
