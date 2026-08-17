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
  /** Active / persisted training configuration */
  trainingConfig:   ActiveTrainingConfiguration | null;
  /** Most recently completed / active training job */
  activeJob:        JobEntity | null;
  /** Which lifecycle stage is "current" for the rail */
  lifecycleStage:   LifecycleStage;
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
  setActiveJob:          (j: JobEntity | null) => void;
  setLifecycleStage:     (s: LifecycleStage)   => void;
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

  const [dataset,          setDataset]          = useState<Dataset | null>(initial.dataset ?? null);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(initial.selectedFeatures ?? []);
  const [selectedTarget,   setSelectedTarget]   = useState<string | null>(initial.selectedTarget ?? null);
  const [trainingConfig,   setTrainingConfig]   = useState<ActiveTrainingConfiguration | null>(initial.trainingConfig ?? null);
  const [activeJob,        setActiveJob]        = useState<JobEntity | null>(initial.activeJob ?? null);
  const [lifecycleStage,   setLifecycleStage]   = useState<LifecycleStage>(initial.lifecycleStage ?? 'dataset');

  // Persist state updates to localStorage
  useEffect(() => {
    try {
      const stateToPersist: ProjectState = {
        dataset,
        selectedFeatures,
        selectedTarget,
        trainingConfig,
        activeJob,
        lifecycleStage,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToPersist));
    } catch (err) {
      console.warn('Failed to save project state to localStorage:', err);
    }
  }, [dataset, selectedFeatures, selectedTarget, trainingConfig, activeJob, lifecycleStage]);

  const loadDataset = useCallback((d: Dataset) => {
    setDataset(d);
    setSelectedFeatures([]);
    setSelectedTarget(null);
    setTrainingConfig(null);
    setActiveJob(null);
    setLifecycleStage('dataset');
  }, []);

  const resetProject = useCallback(() => {
    setDataset(null);
    setSelectedFeatures([]);
    setSelectedTarget(null);
    setTrainingConfig(null);
    setActiveJob(null);
    setLifecycleStage('dataset');
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <ProjectContext.Provider
      value={{
        dataset,
        selectedFeatures,
        selectedTarget,
        trainingConfig,
        activeJob,
        lifecycleStage,
        setDataset,
        setSelectedFeatures,
        setSelectedTarget,
        setTrainingConfig,
        setActiveJob,
        setLifecycleStage,
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
