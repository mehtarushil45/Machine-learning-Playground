/**
 * ProjectContext — shared lifecycle state across all six workspace pages.
 *
 * Carries the "current project" (active dataset, selection, trained model)
 * so navigating between pages or refreshing the browser doesn't lose context.
 * Persisted to localStorage with automatic hydration.
 *
 * Gatekeeper rule:
 * - `isProjectInitialized` is true only when BOTH a dataset is loaded AND
 *   an experiment file has been explicitly named by the user.
 * - App.tsx uses this flag to decide whether to show the ProjectGatekeeper
 *   or the studio pages.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Dataset } from '../types/dataset';
import type { JobEntity } from '../types/job';
import { apiClient, ApiError } from '../services/apiClient';

const STORAGE_KEY = 'ml_playground_project_state_v3';

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
  /**
   * Set of filenames where the user has made manual edits after generation.
   * Serialised as an array in localStorage.
   */
  modifiedFiles:    string[];
  /**
   * Set of filenames that contain purely generated code (no user edits).
   * Serialised as an array in localStorage.
   */
  generatedFiles:   string[];
}

export type LifecycleStage =
  | 'dataset'
  | 'pipeline'
  | 'evaluate'
  | 'verify'
  | 'deploy'
  | 'certify';

interface ProjectContextValue extends ProjectState {
  /** True when both dataset and experiment file are set — gatekeeper check */
  isProjectInitialized:  boolean;
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
  /** Mark a file as user-modified (blocks silent regeneration) */
  markFileModified:      (fileName: string) => void;
  /** Mark a file as purely generated (safe to regenerate without warning) */
  markFileGenerated:     (fileName: string) => void;
  /** Clear modified status for a file (called after deliberate save/regenerate) */
  clearFileModified:     (fileName: string) => void;
  /** True if the given file has user modifications not yet regenerated over */
  isFileModified:        (fileName: string) => boolean;
  /** True if the given file is purely generated code with no user edits */
  isFileGenerated:       (fileName: string) => boolean;
  /**
   * 2-step gatekeeper initializer — called when user completes Step 2.
   * Atomically sets the dataset, creates the first experiment file,
   * and unlocks the studio pages.
   */
  initializeProject:     (dataset: Dataset, fileName: string) => void;
  /** Convenience: load a new dataset and reset selection */
  loadDataset:           (d: Dataset)          => void;
  /** Convenience: reset everything and return to gatekeeper */
  resetProject:          ()                    => void;
  /** Warning message when a persisted dataset was found to be stale/missing on backend */
  staleDatasetWarning:   string | null;
  /** Clear stale dataset warning */
  clearStaleDatasetWarning: () => void;
  /** True while verifying a persisted dataset on startup */
  isValidatingDataset:   boolean;
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

  // Only restore files if dataset was also persisted — prevents phantom state
  // where files exist but no dataset was loaded (gatekeeper should show).
  const hasPersistedDataset = Boolean(initial.dataset);
  const hasPersistedFile    = Boolean(
    initial.activeExperimentFile &&
    initial.experimentFiles &&
    initial.experimentFiles[initial.activeExperimentFile] !== undefined
  );

  const initialFiles: Record<string, string> =
    hasPersistedDataset && initial.experimentFiles && Object.keys(initial.experimentFiles).length > 0
      ? initial.experimentFiles
      : { 'pipeline_generated.py': '' };

  const initialActiveFile: string =
    hasPersistedDataset && hasPersistedFile
      ? initial.activeExperimentFile!
      : 'pipeline_generated.py';

  const initialTabs: string[] =
    hasPersistedDataset && Array.isArray(initial.openTabs) && initial.openTabs.length > 0
      ? initial.openTabs.filter((t) => initialFiles[t] !== undefined)
      : ['pipeline_generated.py'];

  const [dataset,           setDataset]           = useState<Dataset | null>(initial.dataset ?? null);
  const [selectedFeatures,  setSelectedFeatures]  = useState<string[]>(initial.selectedFeatures ?? []);
  const [selectedTarget,    setSelectedTargetState] = useState<string | null>(initial.selectedTarget ?? null);
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
  // Tracks which files have user edits (blocks silent regeneration)
  const [modifiedFiles, setModifiedFiles]         = useState<string[]>(
    Array.isArray((initial as any).modifiedFiles) ? (initial as any).modifiedFiles : [],
  );
  // Tracks which files are purely generated (safe to regenerate without warning)
  const [generatedFiles, setGeneratedFiles]       = useState<string[]>(
    Array.isArray((initial as any).generatedFiles) ? (initial as any).generatedFiles : [],
  );

  const [staleDatasetWarning, setStaleDatasetWarning] = useState<string | null>(null);
  const clearStaleDatasetWarning = useCallback(() => setStaleDatasetWarning(null), []);

  const needsInitialValidation = Boolean(
    initial.dataset?.datasetId &&
    initial.dataset.datasetId.includes('-') &&
    !initial.dataset.datasetId.startsWith('client-') &&
    !initial.dataset.datasetId.startsWith('ds-')
  );
  const [isValidatingDataset, setIsValidatingDataset] = useState<boolean>(needsInitialValidation);

  // Auto-heal: verify persisted dataset still exists on backend; if server 404s, clear ghost state
  useEffect(() => {
    if (initial.dataset?.datasetId) {
      const dsId = initial.dataset.datasetId;
      if (dsId.includes('-') && !dsId.startsWith('client-') && !dsId.startsWith('ds-')) {
        apiClient.get(`/datasets/${dsId}`)
          .then(() => {
            setIsValidatingDataset(false);
          })
          .catch((err: any) => {
            const isNotFound =
              err?.status === 404 ||
              (err instanceof ApiError && err.status === 404) ||
              (err?.message && (err.message.includes('404') || err.message.toLowerCase().includes('not found')));
            if (isNotFound) {
              console.warn(`Persisted dataset ${dsId} no longer exists on backend server. Auto-clearing stale state.`);
              setDataset(null);
              setTrainingConfig(null);
              setSelectedFeatures([]);
              setSelectedTargetState(null);
              setActiveJobState(null);
              setFileJobs({});
              setExperimentFiles({});
              setActiveExperimentFile('');
              setStaleDatasetWarning(
                'Your previous dataset is no longer available on the server. Please re-upload your dataset to continue.'
              );
              try {
                localStorage.removeItem(STORAGE_KEY);
              } catch {}
            }
            setIsValidatingDataset(false);
          });
      } else {
        setIsValidatingDataset(false);
      }
    } else {
      setIsValidatingDataset(false);
    }
  }, []);

  const setSelectedTarget = useCallback((t: string | null) => {
    setSelectedTargetState(t);
    if (t) {
      setTrainingConfig((prev) => (prev ? { ...prev, target_column: t } : null));
    }
  }, []);

  const setActiveJob = useCallback((j: JobEntity | null) => {
    setActiveJobState(j);
    if (j) {
      if (j.target_column) {
        setSelectedTargetState(j.target_column);
        setTrainingConfig((prev) => (prev ? { ...prev, target_column: j.target_column } : null));
      }
      if (activeExperimentFile) {
        setFileJobs((prev) => ({ ...prev, [activeExperimentFile]: j }));
      }
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

  const markFileModified = useCallback((fileName: string) => {
    setModifiedFiles((prev) => prev.includes(fileName) ? prev : [...prev, fileName]);
    setGeneratedFiles((prev) => prev.filter((f) => f !== fileName));
  }, []);

  const markFileGenerated = useCallback((fileName: string) => {
    setGeneratedFiles((prev) => prev.includes(fileName) ? prev : [...prev, fileName]);
    setModifiedFiles((prev) => prev.filter((f) => f !== fileName));
  }, []);

  const clearFileModified = useCallback((fileName: string) => {
    setModifiedFiles((prev) => prev.filter((f) => f !== fileName));
  }, []);

  const isFileModified = useCallback((fileName: string) => {
    return modifiedFiles.includes(fileName);
  }, [modifiedFiles]);

  const isFileGenerated = useCallback((fileName: string) => {
    return generatedFiles.includes(fileName);
  }, [generatedFiles]);

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
          modifiedFiles,
          generatedFiles,
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
    modifiedFiles,
    generatedFiles,
  ]);

  /**
   * initializeProject — 2-step gatekeeper completion handler.
   * Called when user confirms their dataset upload AND experiment filename.
   * Atomically sets dataset, creates the experiment file entry, and unlocks
   * the studio pages by setting activeExperimentFile.
   */
  const initializeProject = useCallback((d: Dataset, fileName: string) => {
    const safeName = fileName.trim().endsWith('.py') ? fileName.trim() : `${fileName.trim()}.py`;
    setStaleDatasetWarning(null);
    setDataset(d);
    setSelectedFeatures([]);
    setSelectedTarget(null);
    setTrainingConfig(null);
    setInferredTaskType(null);
    setActiveJobState(null);
    setFileJobs({});
    setLifecycleStage('dataset');
    setExperimentFiles({ [safeName]: '' });
    setOpenTabs([safeName]);
    setActiveExperimentFile(safeName);
    setModifiedFiles([]);
    setGeneratedFiles([]);
  }, []);

  const loadDataset = useCallback((d: Dataset) => {
    setStaleDatasetWarning(null);
    const dsId = d.datasetId;
    const isBackend = Boolean(dsId && dsId.includes('-') && !dsId.startsWith('client-') && !dsId.startsWith('ds-'));
    if (isBackend) {
      setIsValidatingDataset(true);
      apiClient.get(`/datasets/${dsId}`)
        .then(() => {
          setDataset(d);
          setSelectedFeatures([]);
          setSelectedTarget(null);
          setTrainingConfig(null);
          setInferredTaskType(null);
          setActiveJob(null);
          setLifecycleStage('dataset');
        })
        .catch((err: any) => {
          const isNotFound =
            err?.status === 404 ||
            (err instanceof ApiError && err.status === 404) ||
            (err?.message && (err.message.includes('404') || err.message.toLowerCase().includes('not found')));
          if (isNotFound) {
            setDataset(null);
            setSelectedFeatures([]);
            setSelectedTarget(null);
            setTrainingConfig(null);
            setInferredTaskType(null);
            setActiveJob(null);
            setLifecycleStage('dataset');
            setStaleDatasetWarning('Selected dataset is not available on the server. Please re-upload.');
          } else {
            setDataset(d);
            setSelectedFeatures([]);
            setSelectedTarget(null);
            setTrainingConfig(null);
            setInferredTaskType(null);
            setActiveJob(null);
            setLifecycleStage('dataset');
          }
        })
        .finally(() => {
          setIsValidatingDataset(false);
        });
    } else {
      setDataset(d);
      setSelectedFeatures([]);
      setSelectedTarget(null);
      setTrainingConfig(null);
      setInferredTaskType(null);
      setActiveJob(null);
      setLifecycleStage('dataset');
    }
  }, [setActiveJob, setSelectedTarget]);

  const resetProject = useCallback(() => {
    setStaleDatasetWarning(null);
    setDataset(null);
    setSelectedFeatures([]);
    setSelectedTarget(null);
    setTrainingConfig(null);
    setInferredTaskType(null);
    setActiveJobState(null);
    setFileJobs({});
    setLifecycleStage('dataset');
    // Clear all experiment state so gatekeeper re-appears
    setExperimentFiles({});
    setOpenTabs([]);
    setActiveExperimentFile('');
    setModifiedFiles([]);
    setGeneratedFiles([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // Derived flag: true only when not validating AND both dataset AND a named experiment file are present.
  const isProjectInitialized = Boolean(
    !isValidatingDataset && dataset && activeExperimentFile && activeExperimentFile.length > 0
  );

  return (
    <ProjectContext.Provider
      value={{
        isProjectInitialized,
        isValidatingDataset,
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
        modifiedFiles,
        generatedFiles,
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
        markFileModified,
        markFileGenerated,
        clearFileModified,
        isFileModified,
        isFileGenerated,
        initializeProject,
        loadDataset,
        resetProject,
        staleDatasetWarning,
        clearStaleDatasetWarning,
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
