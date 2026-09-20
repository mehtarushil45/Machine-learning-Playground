/**
 * ProjectContext — shared lifecycle state across all six workspace pages.
 *
 * Carries the "current project" (active dataset, selection, trained model)
 * so navigating between pages or refreshing the browser doesn't lose context.
 * Persisted to localStorage with automatic hydration.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Dataset } from '../types/dataset';
import type { JobEntity } from '../types/job';

const STORAGE_KEY = 'ml_playground_project_state_v2';

export interface ActiveTrainingConfiguration {
  dataset_id: string;
  dataset_name: string;
  target_column: string;
  feature_columns: string[];
  algorithm: string;
  scaler: string;
  imputer: string;
  train_test_split: number;
  cv_folds: number;
  random_seed: number;
  recommendation_job_id?: string | null;
  selection_source: 'recommended' | 'manual' | 'default';
}

/* ── Shape ────────────────────────────────────────────────────────────── */
export interface ProjectState {
  /** Active dataset loaded in Dataset & Profiler */
  dataset:          Dataset | null;
  /** Columns checked as features */
  selectedFeatures: string[];
  /** Column chosen as target */
  selectedTarget:   string | null;
  /** Active / persisted training configuration (single source of truth for pipeline config) */
  trainingConfig:   ActiveTrainingConfiguration | null;
  /** Task type inferred from backend dataset analysis — drives algorithm filtering in Page 2 */
  inferredTaskType: 'classification' | 'regression' | null;
  /** Most recently completed / active training job */
  activeJob:        JobEntity | null;
  /** Which lifecycle stage is "current" for the rail */
  lifecycleStage:   LifecycleStage;
  /** Which experiment file is currently active in Pipeline Code Studio */
  activeExperimentFile: string;
  /** Map of filename -> generated/written python code */
  experimentFiles:  Record<string, string>;
  /** Ordered list of open tab file names */
  openTabs:         string[];
  /** Map of filename -> JobEntity for multi-file experiment result tracking */
  fileJobs:         Record<string, JobEntity>;
}

export type LifecycleStage =
  | 'dataset'
  | 'pipeline'
  | 'evaluate'
  | 'verify'
  | 'deploy'
  | 'certify';

interface ProjectContextValue extends ProjectState {
  setDataset:            (d: Dataset | null)  => void;
  setSelectedFeatures:   (f: string[])         => void;
  setSelectedTarget:     (t: string | null)    => void;
  setTrainingConfig:     (c: ActiveTrainingConfiguration | null) => void;
  setInferredTaskType:   (t: 'classification' | 'regression' | null) => void;
  setActiveJob:          (j: JobEntity | null) => void;
  setLifecycleStage:     (s: LifecycleStage)   => void;
  setActiveExperimentFile: (f: string)         => void;
  setExperimentFiles:    React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setOpenTabs:           React.Dispatch<React.SetStateAction<string[]>>;
  updateExperimentFileCode: (fileName: string, code: string) => void;
  createExperimentFile:  (fileName: string, initialCode?: string) => void;
  deleteExperimentFile:  (fileName: string) => void;
  setFileJob:            (fileName: string, job: JobEntity) => void;
  /** Convenience: load a new dataset and reset selection */
  loadDataset:           (d: Dataset)          => void;
  /** Convenience: reset everything (new project) */
  resetProject:          ()                    => void;
}

/* ── Context ──────────────────────────────────────────────────────────── */
const ProjectContext = createContext<ProjectContextValue | null>(null);

/* ── Initial Storage Reader ───────────────────────────────────────────── */
function loadPersistedState(): Partial<ProjectState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to load project state from localStorage:', err);
    return {};
  }
}

/* ── Provider ─────────────────────────────────────────────────────────── */
export function ProjectProvider({ children }: { children: ReactNode }) {
  const initial = loadPersistedState();

  const initialFiles: Record<string, string> =
    initial.experimentFiles && Object.keys(initial.experimentFiles).length > 0
      ? initial.experimentFiles
      : { 'pipeline_generated.py': '' };

  const initialActiveFile: string =
    initial.activeExperimentFile && initialFiles[initial.activeExperimentFile] !== undefined
      ? initial.activeExperimentFile
      : Object.keys(initialFiles)[0] || 'pipeline_generated.py';

  const initialTabs: string[] =
    Array.isArray(initial.openTabs) && initial.openTabs.length > 0
      ? initial.openTabs.filter((t) => initialFiles[t] !== undefined)
      : [initialActiveFile];

  const [dataset,           setDataset]           = useState<Dataset | null>(initial.dataset ?? null);
  const [selectedFeatures,  setSelectedFeatures]  = useState<string[]>(initial.selectedFeatures ?? []);
  const [selectedTarget,    setSelectedTarget]    = useState<string | null>(initial.selectedTarget ?? null);
  const [trainingConfig,    setTrainingConfig]    = useState<ActiveTrainingConfiguration | null>(initial.trainingConfig ?? null);
  const [inferredTaskType,  setInferredTaskType]  = useState<'classification' | 'regression' | null>(
    (initial as any).inferredTaskType ?? null,
  );
  const [activeJob,         setActiveJobState]    = useState<JobEntity | null>(initial.activeJob ?? null);
  const [fileJobs,          setFileJobs]          = useState<Record<string, JobEntity>>(initial.fileJobs ?? {});
  const [lifecycleStage,    setLifecycleStage]    = useState<LifecycleStage>(initial.lifecycleStage ?? 'dataset');
  const [activeExperimentFile, setActiveExperimentFile] = useState<string>(initialActiveFile);
  const [experimentFiles, setExperimentFiles]     = useState<Record<string, string>>(initialFiles);
  const [openTabs, setOpenTabs]                   = useState<string[]>(initialTabs);

  const setActiveJob = useCallback((j: JobEntity | null) => {
    setActiveJobState(j);
    if (j && activeExperimentFile) {
      setFileJobs((prev) => ({ ...prev, [activeExperimentFile]: j }));
    }
  }, [activeExperimentFile]);

  const setFileJob = useCallback((fileName: string, job: JobEntity) => {
    setFileJobs((prev) => ({
      ...prev,
      [fileName]: job,
    }));
  }, []);

  const updateExperimentFileCode = useCallback((fileName: string, code: string) => {
    setExperimentFiles((prev) => ({
      ...prev,
      [fileName]: code,
    }));
  }, []);

  const createExperimentFile = useCallback((fileName: string, initialCode: string = '') => {
    setExperimentFiles((prev) => ({
      ...prev,
      [fileName]: initialCode,
    }));
    setOpenTabs((prev) => (prev.includes(fileName) ? prev : [...prev, fileName]));
    setActiveExperimentFile(fileName);
  }, []);

  const deleteExperimentFile = useCallback((fileName: string) => {
    setExperimentFiles((prev) => {
      const next = { ...prev };
      delete next[fileName];
      return next;
    });
    setOpenTabs((prev) => {
      const nextTabs = prev.filter((t) => t !== fileName);
      if (activeExperimentFile === fileName && nextTabs.length > 0) {
        const idx = prev.indexOf(fileName);
        const fallback = nextTabs[Math.min(idx, nextTabs.length - 1)];
        if (fallback) setActiveExperimentFile(fallback);
      }
      return nextTabs;
    });
  }, [activeExperimentFile]);

  // Persist state updates to localStorage (debounced to avoid blocking UI during fast slider changes)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const stateToPersist = {
          dataset,
          selectedFeatures,
          selectedTarget,
          trainingConfig,
          inferredTaskType,
          activeJob,
          fileJobs,
          lifecycleStage,
          activeExperimentFile,
          experimentFiles,
          openTabs,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToPersist));
      } catch (err) {
        console.warn('Failed to save project state to localStorage:', err);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [
    dataset,
    selectedFeatures,
    selectedTarget,
    trainingConfig,
    inferredTaskType,
    activeJob,
    fileJobs,
    lifecycleStage,
    activeExperimentFile,
    experimentFiles,
    openTabs,
  ]);

  const loadDataset = useCallback((d: Dataset) => {
    setDataset(d);
    setSelectedFeatures([]);
    setSelectedTarget(null);
    setTrainingConfig(null);
    setInferredTaskType(null);
    setActiveJob(null);
    setLifecycleStage('dataset');
  }, [setActiveJob]);

  const resetProject = useCallback(() => {
    setDataset(null);
    setSelectedFeatures([]);
    setSelectedTarget(null);
    setTrainingConfig(null);
    setInferredTaskType(null);
    setActiveJob(null);
    setLifecycleStage('dataset');
    setExperimentFiles({ 'pipeline_generated.py': '' });
    setOpenTabs(['pipeline_generated.py']);
    setActiveExperimentFile('pipeline_generated.py');
    setFileJobs({});
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [setActiveJob]);

  return (
    <ProjectContext.Provider
      value={{
        dataset,
        selectedFeatures,
        selectedTarget,
        trainingConfig,
        inferredTaskType,
        activeJob,
        fileJobs,
        lifecycleStage,
        activeExperimentFile,
        experimentFiles,
        openTabs,
        setDataset,
        setSelectedFeatures,
        setSelectedTarget,
        setTrainingConfig,
        setInferredTaskType,
        setActiveJob,
        setFileJob,
        setLifecycleStage,
        setActiveExperimentFile,
        setExperimentFiles,
        setOpenTabs,
        updateExperimentFileCode,
        createExperimentFile,
        deleteExperimentFile,
        loadDataset,
        resetProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

/* ── Hook ─────────────────────────────────────────────────────────────── */
// eslint-disable-next-line react-refresh/only-export-components
export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProject must be used within <ProjectProvider>');
  }
  return ctx;
}
