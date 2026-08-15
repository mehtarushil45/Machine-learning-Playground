/**
 * ProjectContext — shared lifecycle state across all six workspace pages.
 *
 * Carries the "current project" (active dataset, selection, trained model)
 * so navigating between pages doesn't lose context. Backed purely by
 * React state for V1 — no network round-trip on every page switch.
 */
import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { Dataset } from '../types/dataset';
import type { JobEntity } from '../types/job';

/* ── Shape ────────────────────────────────────────────────────────────── */
export interface ProjectState {
  /** Active dataset loaded in Dataset & Profiler */
  dataset:          Dataset | null;
  /** Columns checked as features */
  selectedFeatures: string[];
  /** Column chosen as target */
  selectedTarget:   string | null;
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
  setActiveJob:          (j: JobEntity | null) => void;
  setLifecycleStage:     (s: LifecycleStage)   => void;
  /** Convenience: load a new dataset and reset selection */
  loadDataset:           (d: Dataset)          => void;
  /** Convenience: reset everything (new project) */
  resetProject:          ()                    => void;
}

/* ── Context ──────────────────────────────────────────────────────────── */
const ProjectContext = createContext<ProjectContextValue | null>(null);

/* ── Provider ─────────────────────────────────────────────────────────── */
export function ProjectProvider({ children }: { children: ReactNode }) {
  const [dataset,          setDataset]          = useState<Dataset | null>(null);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [selectedTarget,   setSelectedTarget]   = useState<string | null>(null);
  const [activeJob,        setActiveJob]        = useState<JobEntity | null>(null);
  const [lifecycleStage,   setLifecycleStage]   = useState<LifecycleStage>('dataset');

  const loadDataset = useCallback((d: Dataset) => {
    setDataset(d);
    setSelectedFeatures([]);
    setSelectedTarget(null);
    setActiveJob(null);
    // Stay on 'dataset' stage — user must explicitly move forward
  }, []);

  const resetProject = useCallback(() => {
    setDataset(null);
    setSelectedFeatures([]);
    setSelectedTarget(null);
    setActiveJob(null);
    setLifecycleStage('dataset');
  }, []);

  return (
    <ProjectContext.Provider
      value={{
        dataset,
        selectedFeatures,
        selectedTarget,
        activeJob,
        lifecycleStage,
        setDataset,
        setSelectedFeatures,
        setSelectedTarget,
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
export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProject must be used within <ProjectProvider>');
  }
  return ctx;
}
