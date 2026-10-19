/**
 * UserGuidePage — Comprehensive Machine Learning & Enterprise MLOps Knowledge Hub
 *
 * Provides complete, plain-English educational and operational references for:
 * 1. Machine Learning Foundations (Supervised learning, classification vs regression, bias-variance, leakage)
 * 2. Data Preparation & Feature Engineering (Scalers, imputation, encoding, cardinality)
 * 3. Machine Learning Algorithms Encyclopedia (All 10 classifiers & 10 regressors explained simply)
 * 4. Hyperparameter Tuning Guide (Every knob, slider, and setting demystified)
 * 5. Diagnostic Evaluation Metrics (Classification & regression formulas, confusion matrix, ROC/PR curves)
 * 6. The 4 Core Enterprise Architecture Pillars (Dataset Engine, Monaco Code Studio, Experiment Registry, Model Serving)
 * 7. Complete ML Playground Glossary (80+ terms covering every concept in the project with zero obscure jargon)
 * 8. Keyboard Shortcuts, FAQs, and Anti-Patterns
 */
import { useState, useMemo } from 'react';
import {
  BookOpen,
  Database,
  Code2,
  BarChart2,
  Rocket,
  Search,
  AlertTriangle,
  ExternalLink,
  ArrowRight,
  ShieldCheck,
  Layers,
  Activity,
  Zap,
  Sliders,
  Keyboard,
  HelpCircle,
  Copy,
  Check,
  Sparkles,
  Cpu,
  Target,
  TrendingUp,
  Split,
  CheckCircle2,
  Info,
} from 'lucide-react';

// Enterprise Palette Design Tokens
const TOKENS = {
  bgBase: '#050B14',
  bgSurface: '#0A1424',
  bgElevated: '#101F38',
  border: 'rgba(0, 212, 255, 0.14)',
  borderActive: 'rgba(0, 212, 255, 0.4)',
  primary: '#00D4FF',
  primaryGlow: 'rgba(0, 212, 255, 0.25)',
  accentEmerald: '#00F5A0',
  accentAmber: '#F59E0B',
  accentRose: '#F43F5E',
  accentViolet: '#818CF8',
  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  codeBg: '#030712',
} as const;

interface UserGuidePageProps {
  onNavigate?: (tab: string) => void;
}

export function UserGuidePage({ onNavigate }: UserGuidePageProps) {
  const [activeSection, setActiveSection] = useState<string>('intro');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedArchNode, setSelectedArchNode] = useState<string>('pillars');
  const [copiedShortcut, setCopiedShortcut] = useState<string | null>(null);
  const [glossaryCategory, setGlossaryCategory] = useState<string>('All');
  const [algoTab, setAlgoTab] = useState<'classification' | 'regression'>('classification');

  const sections = useMemo(
    () => [
      { id: 'intro', label: 'Platform Architecture & Topology', icon: <Layers className="w-4 h-4" /> },
      { id: 'fundamentals', label: 'ML Foundations & Core Concepts', icon: <Sparkles className="w-4 h-4" /> },
      { id: 'pillar1', label: '1. Dataset Engine & Governance', icon: <Database className="w-4 h-4" /> },
      { id: 'preprocessing', label: 'Data Preprocessing & Scalers', icon: <Sliders className="w-4 h-4" /> },
      { id: 'pillar2', label: '2. Monaco Code Studio & Guardian', icon: <Code2 className="w-4 h-4" /> },
      { id: 'algorithms', label: 'ML Algorithms Encyclopedia', icon: <Cpu className="w-4 h-4" /> },
      { id: 'hyperparameters', label: 'Hyperparameter Tuning Guide', icon: <Target className="w-4 h-4" /> },
      { id: 'pillar3', label: '3. Experiment Tracking & Registry', icon: <BarChart2 className="w-4 h-4" /> },
      { id: 'pillar4', label: '4. Model Serving & Batch Scoring', icon: <Rocket className="w-4 h-4" /> },
      { id: 'metrics', label: 'Diagnostic Metrics & Formulas', icon: <Activity className="w-4 h-4" /> },
      { id: 'glossary', label: 'MLOps & ML Glossary', icon: <BookOpen className="w-4 h-4" /> },
      { id: 'shortcuts', label: 'Keyboard Shortcuts Cheatsheet', icon: <Keyboard className="w-4 h-4" /> },
      { id: 'faqs', label: 'Frequently Asked Questions', icon: <HelpCircle className="w-4 h-4" /> },
      { id: 'pitfalls', label: 'Enterprise Pitfalls to Avoid', icon: <AlertTriangle className="w-4 h-4" /> },
    ],
    []
  );

  const handleReturnToPlatform = () => {
    if (window.opener) {
      window.close();
    } else if (onNavigate) {
      onNavigate('workspace');
    } else {
      window.location.hash = '';
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedShortcut(text);
    setTimeout(() => setCopiedShortcut(null), 2000);
  };

  // Comprehensive Glossary with all terms mentioned in our project
  const glossaryTerms = useMemo(
    () => [
      // Foundations
      {
        term: 'Supervised Learning',
        category: 'Foundations',
        definition:
          'A machine learning paradigm where the algorithm learns by studying pairs of input features (X) and known correct answers/targets (y), so it can predict answers for future unseen data.',
      },
      {
        term: 'Dataset',
        category: 'Foundations',
        definition:
          'A structured table of information consisting of rows (individual samples, customers, or observations) and columns (attributes, properties, or measurements).',
      },
      {
        term: 'Features (Independent Variables)',
        category: 'Foundations',
        definition:
          'The input columns provided to the model to learn patterns from (for example: tenure, monthly charges, contract type, credit score). Denoted mathematically as X.',
      },
      {
        term: 'Target Column (Dependent Variable)',
        category: 'Foundations',
        definition:
          'The specific column you want the machine learning model to learn how to predict (for example: churn, final exam score, or real estate price). Denoted mathematically as y.',
      },
      {
        term: 'Classification',
        category: 'Foundations',
        definition:
          'A machine learning task where the target column consists of discrete categories or labels (e.g., predicting whether a customer will churn or stay, or whether an email is spam or legit).',
      },
      {
        term: 'Binary Classification',
        category: 'Foundations',
        definition:
          'A classification problem with exactly two possible outcomes (e.g. 0 vs 1, True vs False, Passed vs Failed, Churn vs No Churn).',
      },
      {
        term: 'Multi-Class Classification',
        category: 'Foundations',
        definition:
          'A classification problem with three or more distinct classes (e.g., classifying support tickets as Low, Medium, High, or Urgent).',
      },
      {
        term: 'Regression',
        category: 'Foundations',
        definition:
          'A machine learning task where the target column is a continuous numerical quantity (e.g., predicting house price, annual salary, temperature, or exam score).',
      },
      {
        term: 'Train / Test Split',
        category: 'Foundations',
        definition:
          'The fundamental practice of dividing your dataset into a training portion (typically 70-80%) to teach the model and an independent test portion (20-30%) to evaluate how well it performs on data it has never seen.',
      },
      {
        term: 'Overfitting',
        category: 'Foundations',
        definition:
          'When a model memorizes the training data and noise so specifically (like a student memorizing practice exam answers) that it gets near-perfect training scores but fails completely on new, real-world test data.',
      },
      {
        term: 'Underfitting',
        category: 'Foundations',
        definition:
          'When a model is too simplistic to capture the real relationship between features and the target (like drawing a straight line through an S-curve), scoring poorly on both training and test data.',
      },
      {
        term: 'Bias-Variance Tradeoff',
        category: 'Foundations',
        definition:
          'The core balancing act of machine learning: high bias leads to underfitting (model is too rigid), while high variance leads to overfitting (model is too sensitive to noise). Optimal tuning finds the sweet spot.',
      },
      {
        term: 'Random Seed / Random State',
        category: 'Foundations',
        definition:
          'A fixed number (e.g., 42) that initializes the pseudo-random generator, guaranteeing that data splits and stochastic algorithms produce 100% reproducible, identical results every time.',
      },
      {
        term: 'Stratified Splitting',
        category: 'Foundations',
        definition:
          'Partitioning data such that both the train split and test split preserve the exact same percentage of target classes as the original dataset, critical for rare-event detection.',
      },
      {
        term: 'Cross-Validation (CV)',
        category: 'Foundations',
        definition:
          'Splitting data into k distinct folds, training on k-1 folds and validating on the remaining fold in a round-robin fashion, ensuring the model is reliable across different data subsets.',
      },
      {
        term: 'Class Imbalance',
        category: 'Foundations',
        definition:
          'A severe skew in class distribution (such as 99% non-fraudulent vs 1% fraudulent transactions) where raw accuracy is misleading and precision, recall, and PR-AUC must be used instead.',
      },

      // Data & Preprocessing
      {
        term: 'Target Leakage',
        category: 'Data & Preprocessing',
        definition:
          'When an input feature contains information that will only exist after the target event has already occurred (e.g. cancellation_date when predicting churn). ML Playground flags features with >0.98 correlation.',
      },
      {
        term: 'Train-Test Leakage',
        category: 'Data & Preprocessing',
        definition:
          'Fitting scalers, imputers, or encoders on the entire dataset instead of strictly on the training partition, which inadvertently leaks future test data statistics into the model.',
      },
      {
        term: 'Missing Values (NaN)',
        category: 'Data & Preprocessing',
        definition:
          'Blank or unrecorded cells in a dataset. Most machine learning algorithms cannot compute mathematical operations with missing values and require imputation first.',
      },
      {
        term: 'Imputation',
        category: 'Data & Preprocessing',
        definition:
          'The process of replacing missing values with statistically sound estimates (mean, median, mode, constant, or iterative estimates) rather than deleting entire rows of data.',
      },
      {
        term: 'Mean Imputation',
        category: 'Data & Preprocessing',
        definition:
          'Filling missing numeric values with the column average. Simple and fast, but can be skewed if the column contains extreme outliers.',
      },
      {
        term: 'Median Imputation',
        category: 'Data & Preprocessing',
        definition:
          'Filling missing numeric values with the middle value of the sorted column. Highly recommended when data contains outliers or skewed distributions (e.g. salary, price).',
      },
      {
        term: 'Mode / Most Frequent Imputation',
        category: 'Data & Preprocessing',
        definition:
          'Filling missing values with the most frequently occurring value in the column. The standard approach for categorical text features.',
      },
      {
        term: 'Constant Imputation',
        category: 'Data & Preprocessing',
        definition:
          'Filling missing values with a designated constant (e.g., 0 for numbers, or "Missing" / "Unknown" for categories), preserving the fact that the data was missing.',
      },
      {
        term: 'KNN Imputer',
        category: 'Data & Preprocessing',
        definition:
          'Fills missing values by finding the k most similar rows based on other non-missing features and averaging their values.',
      },
      {
        term: 'Iterative Imputer (MICE)',
        category: 'Data & Preprocessing',
        definition:
          'Models each feature with missing values as a function of all other features in a round-robin estimation process, producing highly accurate imputations.',
      },
      {
        term: 'Feature Scaling',
        category: 'Data & Preprocessing',
        definition:
          'Transforming numeric columns to a consistent numerical scale so columns with large numbers (e.g., Salary \$120,000) do not dominate columns with small numbers (e.g., Age 32).',
      },
      {
        term: 'StandardScaler (Z-Score)',
        category: 'Data & Preprocessing',
        definition:
          'Standardizes features by subtracting the mean and dividing by the standard deviation, producing a distribution with mean = 0 and variance = 1.',
      },
      {
        term: 'MinMaxScaler',
        category: 'Data & Preprocessing',
        definition:
          'Scales all numeric values strictly into a bounded range between 0.0 and 1.0, preserving exact relative distances between points.',
      },
      {
        term: 'RobustScaler',
        category: 'Data & Preprocessing',
        definition:
          'Scales features using the median and Interquartile Range (IQR between 25th and 75th percentiles), making it immune to extreme outliers.',
      },
      {
        term: 'MaxAbsScaler',
        category: 'Data & Preprocessing',
        definition:
          'Scales each feature by its maximum absolute value into the range [-1, 1], specifically preserving zero entries in sparse matrices.',
      },
      {
        term: 'One-Hot Encoding',
        category: 'Data & Preprocessing',
        definition:
          'Transforming categorical text strings (e.g., Red, Blue) into separate binary indicator columns (Color_Red = 0 or 1, Color_Blue = 0 or 1) suitable for math computations.',
      },
      {
        term: 'Label Encoding',
        category: 'Data & Preprocessing',
        definition:
          'Assigning each unique category a sequential integer ID (e.g., Small = 0, Medium = 1, Large = 2). Best for target variables or ordered categories.',
      },
      {
        term: 'High Cardinality',
        category: 'Data & Preprocessing',
        definition:
          'When a categorical column contains an excessively large number of unique values (e.g., 5,000 unique postal codes), which can explode memory if one-hot encoded.',
      },
      {
        term: 'Constant / Zero-Variance Column',
        category: 'Data & Preprocessing',
        definition:
          'A column that contains the exact same value across every single row. It provides zero predictive value and should be dropped.',
      },
      {
        term: 'Multicollinearity',
        category: 'Data & Preprocessing',
        definition:
          'When two or more input features are almost perfectly correlated with each other, providing redundant information and destabilizing linear models.',
      },
      {
        term: 'DuckDB Out-of-Core Engine',
        category: 'Data & Preprocessing',
        definition:
          'An ultra-fast columnar analytical SQL engine that queries and profiles multi-gigabyte datasets directly from disk in streaming chunks with zero RAM crashes.',
      },
      {
        term: 'SHA-256 Dataset Fingerprint',
        category: 'Data & Preprocessing',
        definition:
          'An immutable cryptographic hash generated from dataset content that guarantees audit lineage and ensures models are linked to an unchangeable data snapshot.',
      },

      // Algorithms
      {
        term: 'Logistic Regression',
        category: 'Algorithms',
        definition:
          'A fast, highly interpretable linear classification algorithm that maps feature combinations into a probability between 0 and 1 using a sigmoid S-curve.',
      },
      {
        term: 'Linear Regression (OLS)',
        category: 'Algorithms',
        definition:
          'The foundational regression algorithm that fits a straight line or hyperplane through data points to minimize the sum of squared differences (residuals).',
      },
      {
        term: 'Decision Tree (Classifier & Regressor)',
        category: 'Algorithms',
        definition:
          'A model that makes predictions by breaking data down into a flowchart of simple yes/no questions based on feature thresholds.',
      },
      {
        term: 'Random Forest (Classifier & Regressor)',
        category: 'Algorithms',
        definition:
          'An ensemble of dozens or hundreds of decision trees trained on random subsets of data and features. The trees vote (classification) or average their predictions (regression) to reduce overfitting.',
      },
      {
        term: 'Gradient Boosting (Classifier & Regressor)',
        category: 'Algorithms',
        definition:
          'A sequential ensemble algorithm where each new decision tree is specifically built to correct the residual errors made by the previous trees.',
      },
      {
        term: 'XGBoost (Extreme Gradient Boosting)',
        category: 'Algorithms',
        definition:
          'An industry-standard, high-performance gradient boosting library with built-in regularization that frequently wins competitive machine learning tournaments.',
      },
      {
        term: 'LightGBM (Light Gradient Boosting)',
        category: 'Algorithms',
        definition:
          'A fast, memory-efficient gradient boosting framework created by Microsoft that uses histogram-based binning and leaf-wise tree growth, ideal for large datasets.',
      },
      {
        term: 'Support Vector Machine (SVC & SVR)',
        category: 'Algorithms',
        definition:
          'Finds the optimal decision boundary (hyperplane) that maximizes the margin of separation between classes, or fits predictions inside an error margin tube (SVR).',
      },
      {
        term: 'K-Nearest Neighbors (KNN)',
        category: 'Algorithms',
        definition:
          'An intuitive instance-based algorithm that makes predictions by finding the k most similar training data points in feature space and taking their majority vote or average.',
      },
      {
        term: 'Gaussian Naive Bayes (GaussianNB)',
        category: 'Algorithms',
        definition:
          'A lightweight probabilistic classifier based on Bayes’ Theorem that assumes all features are independent and follow a normal bell curve.',
      },
      {
        term: 'Ridge (L2 Regularization)',
        category: 'Algorithms',
        definition:
          'A linear model that adds an L2 squared penalty on coefficient weights, preventing weights from blowing up and solving multicollinearity issues.',
      },
      {
        term: 'Lasso (L1 Regularization)',
        category: 'Algorithms',
        definition:
          'A linear regression model that adds an L1 absolute penalty on weights, forcing uninformative feature weights to become exactly zero (automatic feature selection).',
      },

      // Hyperparameters
      {
        term: 'Hyperparameter',
        category: 'Hyperparameters',
        definition:
          'A configuration setting chosen before training starts (such as learning rate, number of trees, or tree depth) that directs how the learning algorithm behaves.',
      },
      {
        term: 'Parameter (Model Weights)',
        category: 'Hyperparameters',
        definition:
          'The internal mathematical weights, coefficients, and split points that the model automatically calculates and learns from data during training.',
      },
      {
        term: 'n_estimators',
        category: 'Hyperparameters',
        definition:
          'The number of individual trees built in an ensemble model (Random Forest, Gradient Boosting). Increasing this generally improves stability until gains plateau.',
      },
      {
        term: 'max_depth',
        category: 'Hyperparameters',
        definition:
          'The maximum number of levels a decision tree is permitted to grow. Lower depth prevents overfitting; higher depth allows capturing intricate nonlinear patterns.',
      },
      {
        term: 'learning_rate (Eta)',
        category: 'Hyperparameters',
        definition:
          'The scaling factor applied to each tree’s contribution in gradient boosting. A lower rate (e.g. 0.05) slows learning but prevents overfitting and yields superior results.',
      },
      {
        term: 'min_samples_split',
        category: 'Hyperparameters',
        definition:
          'The minimum number of data samples required in an internal node before the tree is allowed to split it further.',
      },
      {
        term: 'min_samples_leaf',
        category: 'Hyperparameters',
        definition:
          'The minimum number of data samples that must be present in a terminal leaf node. Higher values smooth the model and stop it from isolating single noisy rows.',
      },
      {
        term: 'C (Inverse Regularization)',
        category: 'Hyperparameters',
        definition:
          'Controls penalty strength in Logistic Regression and Support Vector Machines. Smaller C values impose stronger regularization (simpler model); larger C values fit data closer.',
      },
      {
        term: 'alpha (Regularization Strength)',
        category: 'Hyperparameters',
        definition:
          'The regularization penalty multiplier in Ridge and Lasso models. Increasing alpha shrinks model coefficients closer to zero to combat overfitting.',
      },
      {
        term: 'n_neighbors (k)',
        category: 'Hyperparameters',
        definition:
          'The number of closest neighboring data points examined by the KNN algorithm to determine a prediction.',
      },
      {
        term: 'kernel (SVM)',
        category: 'Hyperparameters',
        definition:
          'The mathematical function (Linear, RBF, Polynomial) used by SVM to project data into higher-dimensional space where complex nonlinear boundaries become cleanly separable.',
      },
      {
        term: 'criterion',
        category: 'Hyperparameters',
        definition:
          'The mathematical formula used to score the purity of decision tree splits: Gini or Entropy for classification; Squared Error for regression.',
      },

      // Evaluation Metrics
      {
        term: 'Accuracy',
        category: 'Evaluation Metrics',
        definition:
          'The percentage of all predictions that were correct: (True Positives + True Negatives) / Total Samples. Reliable only when classes are roughly balanced.',
      },
      {
        term: 'Precision',
        category: 'Evaluation Metrics',
        definition:
          'Out of all instances predicted as positive, what fraction was actually positive? TP / (TP + FP). Critical when false alarms are costly (e.g. spam filtering).',
      },
      {
        term: 'Recall (Sensitivity)',
        category: 'Evaluation Metrics',
        definition:
          'Out of all real positive instances that existed, what fraction did the model find? TP / (TP + FN). Critical when missing a positive is disastrous (e.g. cancer detection, fraud).',
      },
      {
        term: 'F1-Score',
        category: 'Evaluation Metrics',
        definition:
          'The harmonic mean of Precision and Recall: 2 * (Precision * Recall) / (Precision + Recall). The single best balanced metric for imbalanced classification tasks.',
      },
      {
        term: 'Confusion Matrix',
        category: 'Evaluation Metrics',
        definition:
          'A 2x2 grid breaking down predictions into True Positives (TP), True Negatives (TN), False Positives (FP), and False Negatives (FN).',
      },
      {
        term: 'ROC Curve & ROC-AUC',
        category: 'Evaluation Metrics',
        definition:
          'Receiver Operating Characteristic curve plotting True Positive Rate vs False Positive Rate across all classification thresholds. AUC = 0.5 is random guessing; 1.0 is perfection.',
      },
      {
        term: 'Precision-Recall (PR) Curve & PR-AUC',
        category: 'Evaluation Metrics',
        definition:
          'A curve showing the trade-off between Precision and Recall across decision thresholds. Indispensable for severely imbalanced datasets where True Negatives overwhelm ROC.',
      },
      {
        term: 'Decision Threshold',
        category: 'Evaluation Metrics',
        definition:
          'The probability cutoff (default 0.50) above which a prediction is declared positive. Lowering the threshold catches more positives (higher recall); raising it reduces false alarms (higher precision).',
      },
      {
        term: 'Log-Loss (Cross-Entropy)',
        category: 'Evaluation Metrics',
        definition:
          'A performance metric that assesses how close predicted probabilities are to the true labels, severely penalizing overconfident wrong guesses.',
      },
      {
        term: 'Mean Absolute Error (MAE)',
        category: 'Evaluation Metrics',
        definition:
          'The average magnitude of absolute prediction errors in regression, expressed directly in the exact original units of the target column (e.g. off by \$15 on average).',
      },
      {
        term: 'Mean Squared Error (MSE)',
        category: 'Evaluation Metrics',
        definition:
          'The average of squared differences between predictions and actual values. Heavily amplifies and penalizes large outlying errors.',
      },
      {
        term: 'Root Mean Squared Error (RMSE)',
        category: 'Evaluation Metrics',
        definition:
          'The square root of MSE. It penalizes large errors more severely than MAE while retaining the same units as the target variable.',
      },
      {
        term: 'R² Score (Coefficient of Determination)',
        category: 'Evaluation Metrics',
        definition:
          'The proportion of variance in the target variable explained by the model. 1.0 = perfect prediction; 0.0 = no better than predicting the average; < 0 = worse than the baseline average.',
      },
      {
        term: 'Residuals',
        category: 'Evaluation Metrics',
        definition:
          'The difference between the actual observed value and the model’s predicted value for any given row (Actual - Predicted).',
      },
      {
        term: 'Feature Importance',
        category: 'Evaluation Metrics',
        definition:
          'A percentage ranking showing how much each input feature contributed to the model’s predictions across the dataset.',
      },
      {
        term: 'Permutation Importance',
        category: 'Evaluation Metrics',
        definition:
          'Measures feature importance by randomly shuffling the values of a single feature on the test set and measuring the drop in model score; immune to cardinality bias.',
      },
      {
        term: 'SHAP (SHapley Additive exPlanations)',
        category: 'Evaluation Metrics',
        definition:
          'A game-theoretic framework that explains individual predictions by calculating the exact directional contribution (positive or negative) of each feature.',
      },

      // MLOps & Serving
      {
        term: 'Model Registry Staging',
        category: 'MLOps & Serving',
        definition:
          'The formal lifecycle promotion state machine: Experiment -> Candidate (Staging) -> Champion (Production) -> Archived, tracking version audit lineage.',
      },
      {
        term: 'Candidate (Staging) Model',
        category: 'MLOps & Serving',
        definition:
          'A newly trained, high-performing model that has been promoted to staging for integration testing and verification before replacing the live production model.',
      },
      {
        term: 'Champion (Production) Model',
        category: 'MLOps & Serving',
        definition:
          'The active, verified model designated to serve live production REST API invocations and bulk batch CSV scoring workloads.',
      },
      {
        term: 'REST API Invocations',
        category: 'MLOps & Serving',
        definition:
          'A high-speed HTTPS endpoint (POST /api/v1/deployments/{id}/invocations) allowing web apps, mobile apps, or backend services to send single JSON records and receive sub-50ms predictions.',
      },
      {
        term: 'Batch CSV Scoring',
        category: 'MLOps & Serving',
        definition:
          'High-throughput offline inference where a user uploads an unlabeled CSV file (thousands of rows) and worker processes compute predictions in parallel, returning an enriched CSV.',
      },
      {
        term: 'Inference Latency (P50, P95, P99)',
        category: 'MLOps & Serving',
        definition:
          'The time in milliseconds taken to compute a prediction. P50 is the median latency; P99 represents the 99th percentile (only 1% of requests were slower than this).',
      },
      {
        term: 'Throughput (RPS)',
        category: 'MLOps & Serving',
        definition:
          'Requests Per Second: the volume of incoming inference requests that the deployment endpoint can successfully evaluate concurrently.',
      },
      {
        term: 'Data Drift',
        category: 'MLOps & Serving',
        definition:
          'When the statistical distribution of real-world production inputs shifts over time away from the data used during training, leading to silent performance degradation.',
      },
      {
        term: 'Population Stability Index (PSI)',
        category: 'MLOps & Serving',
        definition:
          'Statistical metric measuring the magnitude of shift between production inference feature distributions and the training baseline. PSI < 0.1 indicates stability; PSI > 0.25 flags severe drift requiring retraining.',
      },
      {
        term: 'Kolmogorov-Smirnov (KS) Test',
        category: 'MLOps & Serving',
        definition:
          'Non-parametric statistical hypothesis test evaluating if continuous production feature distributions match the baseline dataset with p-value significance.',
      },
      {
        term: 'Pipeline Guardian',
        category: 'MLOps & Serving',
        definition:
          'The real-time static code analysis and AST linting system that validates Python syntax on every keystroke and displays Cause & Effect diffs before execution.',
      },
    ],
    []
  );

  // Keyboard Shortcuts
  const shortcuts = useMemo(
    () => [
      { key: 'Ctrl + Enter', description: 'Run Pipeline in Code Studio' },
      { key: 'Ctrl + S', description: 'Save Pipeline Code & AST State' },
      { key: 'Ctrl + F', description: 'Find & Replace in Monaco Editor' },
      { key: 'Ctrl + K', description: 'Focus Global Command & Guide Search' },
      { key: 'Alt + Up / Down', description: 'Move Line Up / Down in Monaco' },
      { key: 'Ctrl + /', description: 'Toggle Line Comment in Monaco' },
    ],
    []
  );

  // FAQs
  const faqs = useMemo(
    () => [
      {
        q: 'How does DuckDB prevent Out-Of-Memory (OOM) crashes on large datasets?',
        a: 'DuckDB uses vectorized, memory-mapped streaming execution. Rather than loading entire 10GB+ CSV or Parquet files into RAM like pandas, it streams data in small vector chunks directly from disk or S3.',
      },
      {
        q: 'How does the Pipeline Guardian prevent broken execution?',
        a: 'The Pipeline Guardian parses the Python abstract syntax tree (AST) on every keystroke. If you introduce a fatal syntax error, missing import, or invalid hyperparameter, the execution runner is safely guarded with clear diagnostic warnings.',
      },
      {
        q: 'What is the Champion vs Candidate Model Registry workflow?',
        a: 'Trained models start as Experiments. High-performing runs can be promoted to Candidate (Staging) for integration testing. Once verified, a Candidate is promoted to Champion (Production), instantly receiving live REST traffic.',
      },
      {
        q: 'How does Bulk Batch CSV Scoring handle missing columns?',
        a: 'The Batch Scoring Engine validates incoming CSV headers against the Champion model’s serialized feature schema. Missing non-critical columns receive automatic baseline imputation; missing mandatory features raise an explicit error payload.',
      },
      {
        q: 'What triggers automated data drift warnings?',
        a: 'Every 5 minutes, the Telemetry daemon computes Population Stability Index (PSI) and Kolmogorov-Smirnov (KS) statistics between live production inference logs and baseline training data. If PSI > 0.25, a drift alert is dispatched.',
      },
      {
        q: 'Why do algorithms like Random Forest exist in both Classification and Regression?',
        a: 'Ensemble and tree structures are mathematical architectures. When predicting discrete classes (e.g., Churn), the trees vote on the most frequent class. When predicting continuous numbers (e.g., Price), the trees average their numerical outputs.',
      },
      {
        q: 'How does the interactive Decision Threshold slider affect model performance?',
        a: 'By default, models classify anything above 50% probability (0.50) as positive. Lowering the threshold to 0.30 makes the model aggressive—catching more true positives (higher Recall) but generating more false alarms. Raising it to 0.70 makes it conservative—only predicting positive when very certain (higher Precision).',
      },
    ],
    []
  );

  // Search and Category filtering logic
  const filteredGlossary = useMemo(() => {
    let list = glossaryTerms;
    if (glossaryCategory !== 'All') {
      list = list.filter((item) => item.category === glossaryCategory);
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (item) => item.term.toLowerCase().includes(q) || item.definition.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
    );
  }, [glossaryTerms, glossaryCategory, searchQuery]);

  const filteredFaqs = useMemo(() => {
    if (!searchQuery.trim()) return faqs;
    const q = searchQuery.toLowerCase();
    return faqs.filter(
      (item) => item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)
    );
  }, [faqs, searchQuery]);

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        background: TOKENS.bgBase,
        color: TOKENS.textPrimary,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Top Navigation Bar ────────────────────────────────────────── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(10, 20, 36, 0.95)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid ' + TOKENS.border,
          padding: '12px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: 'linear-gradient(135deg, #00D4FF, #00F5A0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#050B14',
              fontWeight: 900,
              fontSize: 14,
              boxShadow: '0 0 16px rgba(0, 212, 255, 0.35)',
            }}
          >
            ML
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: TOKENS.textPrimary }}>
              ML Playground — Enterprise MLOps Guide
            </div>
            <div style={{ fontSize: 11, color: TOKENS.textMuted }}>
              Production Architecture, Core Pillars, and Operational Reference
            </div>
          </div>
        </div>

        {/* Global Search Input */}
        <div style={{ position: 'relative', width: 380, display: 'flex', alignItems: 'center' }}>
          <Search style={{ position: 'absolute', left: 12, width: 14, height: 14, color: TOKENS.textMuted }} />
          <input
            type="text"
            data-testid="guide-search-input"
            placeholder="Search any ML term, algorithm, metric, or slider..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              borderRadius: 8,
              border: '1px solid ' + TOKENS.border,
              background: 'rgba(16, 31, 56, 0.7)',
              color: TOKENS.textPrimary,
              fontSize: 12.5,
              outline: 'none',
              transition: 'border-color 150ms ease',
            }}
          />
        </div>

        {/* Open Workspace Action */}
        <button
          onClick={handleReturnToPlatform}
          data-testid="guide-open-workspace"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid ' + TOKENS.borderActive,
            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15), rgba(0, 245, 160, 0.15))',
            color: TOKENS.primary,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 150ms ease',
          }}
        >
          <span>Open Workspace</span>
          <ExternalLink style={{ width: 13, height: 13 }} />
        </button>
      </header>

      {/* ── Main Layout (Sidebar + Content) ───────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, maxWidth: 1440, width: '100%', margin: '0 auto' }}>
        {/* Left Sticky Navigation Sidebar */}
        <aside
          style={{
            width: 300,
            flexShrink: 0,
            borderRight: '1px solid ' + TOKENS.border,
            padding: '24px 16px',
            position: 'sticky',
            top: 59,
            height: 'calc(100vh - 59px)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: TOKENS.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 8,
              paddingLeft: 8,
            }}
          >
            Guide & Reference Sections
          </div>

          {sections.map((sec) => (
            <button
              key={sec.id}
              onClick={() => {
                setActiveSection(sec.id);
                const el = document.getElementById(sec.id);
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 8,
                border: 'none',
                background: activeSection === sec.id ? 'rgba(0, 212, 255, 0.14)' : 'transparent',
                color: activeSection === sec.id ? TOKENS.primary : TOKENS.textSecondary,
                fontWeight: activeSection === sec.id ? 700 : 500,
                fontSize: 12,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 120ms ease',
              }}
            >
              <span style={{ color: activeSection === sec.id ? TOKENS.primary : TOKENS.textMuted }}>
                {sec.icon}
              </span>
              <span>{sec.label}</span>
            </button>
          ))}

          {/* Quick Stats Footnote */}
          <div style={{ marginTop: 'auto', paddingTop: 20 }}>
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: 'rgba(0, 212, 255, 0.05)',
                border: '1px solid ' + TOKENS.border,
                fontSize: 11,
                color: TOKENS.textSecondary,
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 700, color: TOKENS.primary, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Zero Jargon Guarantee</span>
              </div>
              <div>Every metric, algorithm, and knob in the platform explained in intuitive, plain language.</div>
            </div>
          </div>
        </aside>

        {/* ── Main Content Area ────────────────────────────────────────── */}
        <main style={{ flex: 1, padding: '36px 48px', overflowY: 'auto', lineHeight: 1.6 }}>

          {/* ── SECTION: ARCHITECTURE & TOPOLOGY ───────────────────────── */}
          <section id="intro" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.primary, marginBottom: 8 }}>
              <Layers className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Distributed Systems Architecture
              </span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 14px', letterSpacing: '-0.02em' }}>
              Enterprise ML Platform Architectural Topology
            </h1>
            <p style={{ fontSize: 14.5, color: TOKENS.textSecondary, maxWidth: 880, margin: '0 0 24px' }}>
              Built for high concurrency and zero Out-Of-Memory (OOM) failures. The system is split across decoupled tiers:
              stateless API gateways, out-of-core profiling engines (DuckDB), isolated Monaco execution sandboxes, MLflow-grade experiment tracking, and low-latency serving with real-time drift telemetry.
            </p>

            {/* Interactive Visual Topology SVG */}
            <div
              data-testid="architecture-topology-diagram"
              style={{
                borderRadius: 12,
                background: 'rgba(10, 20, 36, 0.7)',
                border: '1px solid ' + TOKENS.border,
                padding: '24px',
                marginBottom: 28,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: TOKENS.primary, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Activity className="w-4 h-4" />
                  <span>Interactive System Flow (Click tiers to inspect responsibilities)</span>
                </div>
                <div style={{ fontSize: 11, color: TOKENS.textMuted }}>
                  Tier: <strong style={{ color: TOKENS.accentEmerald }}>{selectedArchNode.toUpperCase()}</strong>
                </div>
              </div>

              {/* Architecture SVG Diagram */}
              <svg
                viewBox="0 0 840 280"
                style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8, background: TOKENS.codeBg }}
              >
                {/* Client Layer */}
                <g
                  onClick={() => setSelectedArchNode('clients')}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x="20"
                    y="20"
                    width="800"
                    height="40"
                    rx="6"
                    fill={selectedArchNode === 'clients' ? 'rgba(0, 212, 255, 0.2)' : 'rgba(16, 31, 56, 0.7)'}
                    stroke={selectedArchNode === 'clients' ? TOKENS.primary : 'rgba(255, 255, 255, 0.1)'}
                    strokeWidth="1.5"
                  />
                  <text x="420" y="45" fill={TOKENS.textPrimary} fontSize="12" fontWeight="700" textAnchor="middle">
                    CLIENT LAYER: Web Monaco IDE • Python SDK • cURL / REST Invocations • Batch CSV Dropzone
                  </text>
                </g>

                {/* Gateway Layer */}
                <g
                  onClick={() => setSelectedArchNode('gateway')}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x="20"
                    y="80"
                    width="800"
                    height="40"
                    rx="6"
                    fill={selectedArchNode === 'gateway' ? 'rgba(0, 212, 255, 0.2)' : 'rgba(16, 31, 56, 0.7)'}
                    stroke={selectedArchNode === 'gateway' ? TOKENS.primary : 'rgba(255, 255, 255, 0.1)'}
                    strokeWidth="1.5"
                  />
                  <text x="420" y="105" fill={TOKENS.textPrimary} fontSize="12" fontWeight="700" textAnchor="middle">
                    FASTAPI GATEWAY: Stateless API Pods • JWT Authentication • Token-Bucket Rate Limiter • S3 Presigned URLs
                  </text>
                </g>

                {/* 4 Core Pillars Grid */}
                {/* Pillar 1 */}
                <g
                  onClick={() => setSelectedArchNode('pillar1')}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x="20"
                    y="140"
                    width="190"
                    height="65"
                    rx="6"
                    fill={selectedArchNode === 'pillar1' ? 'rgba(0, 212, 255, 0.25)' : 'rgba(16, 31, 56, 0.9)'}
                    stroke={TOKENS.primary}
                    strokeWidth="1.5"
                  />
                  <text x="115" y="165" fill={TOKENS.primary} fontSize="11" fontWeight="700" textAnchor="middle">
                    1. DATASET ENGINE
                  </text>
                  <text x="115" y="185" fill={TOKENS.textMuted} fontSize="9.5" textAnchor="middle">
                    DuckDB Profiler & Leakage Guard
                  </text>
                </g>

                {/* Pillar 2 */}
                <g
                  onClick={() => setSelectedArchNode('pillar2')}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x="223"
                    y="140"
                    width="190"
                    height="65"
                    rx="6"
                    fill={selectedArchNode === 'pillar2' ? 'rgba(0, 245, 160, 0.25)' : 'rgba(16, 31, 56, 0.9)'}
                    stroke={TOKENS.accentEmerald}
                    strokeWidth="1.5"
                  />
                  <text x="318" y="165" fill={TOKENS.accentEmerald} fontSize="11" fontWeight="700" textAnchor="middle">
                    2. CODE STUDIO
                  </text>
                  <text x="318" y="185" fill={TOKENS.textMuted} fontSize="9.5" textAnchor="middle">
                    Monaco IDE & Sandboxed Runners
                  </text>
                </g>

                {/* Pillar 3 */}
                <g
                  onClick={() => setSelectedArchNode('pillar3')}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x="426"
                    y="140"
                    width="190"
                    height="65"
                    rx="6"
                    fill={selectedArchNode === 'pillar3' ? 'rgba(129, 140, 248, 0.25)' : 'rgba(16, 31, 56, 0.9)'}
                    stroke={TOKENS.accentViolet}
                    strokeWidth="1.5"
                  />
                  <text x="521" y="165" fill={TOKENS.accentViolet} fontSize="11" fontWeight="700" textAnchor="middle">
                    3. EXPERIMENT HUB
                  </text>
                  <text x="521" y="185" fill={TOKENS.textMuted} fontSize="9.5" textAnchor="middle">
                    MLflow Leaderboard & Registry
                  </text>
                </g>

                {/* Pillar 4 */}
                <g
                  onClick={() => setSelectedArchNode('pillar4')}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x="630"
                    y="140"
                    width="190"
                    height="65"
                    rx="6"
                    fill={selectedArchNode === 'pillar4' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(16, 31, 56, 0.9)'}
                    stroke={TOKENS.accentAmber}
                    strokeWidth="1.5"
                  />
                  <text x="725" y="165" fill={TOKENS.accentAmber} fontSize="11" fontWeight="700" textAnchor="middle">
                    4. MODEL SERVING
                  </text>
                  <text x="725" y="185" fill={TOKENS.textMuted} fontSize="9.5" textAnchor="middle">
                    REST, Batch & Drift Telemetry
                  </text>
                </g>

                {/* Persistent Storage & Worker Cluster */}
                <g
                  onClick={() => setSelectedArchNode('storage')}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x="20"
                    y="225"
                    width="800"
                    height="40"
                    rx="6"
                    fill={selectedArchNode === 'storage' ? 'rgba(0, 212, 255, 0.2)' : 'rgba(16, 31, 56, 0.7)'}
                    stroke={selectedArchNode === 'storage' ? TOKENS.primary : 'rgba(255, 255, 255, 0.1)'}
                    strokeWidth="1.5"
                  />
                  <text x="420" y="250" fill={TOKENS.textPrimary} fontSize="12" fontWeight="700" textAnchor="middle">
                    STORAGE & QUEUE INFRASTRUCTURE: PostgreSQL (RLS) • Redis Cluster • S3 / MinIO Artifacts • Ephemeral Compute Workers
                  </text>
                </g>
              </svg>

              {/* Explanatory Tier Card */}
              <div
                style={{
                  marginTop: 14,
                  padding: '12px 16px',
                  borderRadius: 8,
                  background: 'rgba(0, 212, 255, 0.05)',
                  border: '1px solid ' + TOKENS.border,
                  fontSize: 12.5,
                  color: TOKENS.textSecondary,
                }}
              >
                {selectedArchNode === 'clients' && (
                  <div>
                    <strong style={{ color: TOKENS.primary }}>Client Tier:</strong> Single-page Monaco Studio, REST clients (cURL, Python httpx), and automated batch scoring drag-and-drop file uploaders connecting over secure HTTPS.
                  </div>
                )}
                {selectedArchNode === 'gateway' && (
                  <div>
                    <strong style={{ color: TOKENS.primary }}>FastAPI Gateway:</strong> Authenticates incoming requests via JWT tokens, applies Redis token-bucket rate limits, and issues S3 pre-signed multipart upload URLs to avoid RAM bottlenecks.
                  </div>
                )}
                {selectedArchNode === 'pillar1' && (
                  <div>
                    <strong style={{ color: TOKENS.primary }}>Pillar 1 — Dataset Engine:</strong> Powered by DuckDB for streaming out-of-core profiling, automated target leakage detection (&gt;0.98 Pearson/Spearman correlation), and immutable SHA-256 version fingerprinting.
                  </div>
                )}
                {selectedArchNode === 'pillar2' && (
                  <div>
                    <strong style={{ color: TOKENS.accentEmerald }}>Pillar 2 — Code Studio:</strong> Real VS Code Monaco editor, AST Python syntax verification, ML cause-and-effect diff modal, AI Copilot, and isolated process sandboxes with strict cgroup resource limits.
                  </div>
                )}
                {selectedArchNode === 'pillar3' && (
                  <div>
                    <strong style={{ color: TOKENS.accentViolet }}>Pillar 3 — Experiment Tracking & Registry:</strong> MLflow-standard multi-run leaderboard, parameter diffing, interactive confusion matrix, threshold optimizer, SHAP feature importance, and Champion vs Candidate lifecycle staging.
                  </div>
                )}
                {selectedArchNode === 'pillar4' && (
                  <div>
                    <strong style={{ color: TOKENS.accentAmber }}>Pillar 4 — Model Serving:</strong> Sub-second REST endpoints, high-throughput bulk batch CSV scoring, live P50/P95/P99 latency telemetry, and Population Stability Index (PSI) drift monitoring.
                  </div>
                )}
                {selectedArchNode === 'storage' && (
                  <div>
                    <strong style={{ color: TOKENS.primary }}>Storage & Worker Tier:</strong> PostgreSQL for relational metadata, Redis for token buckets and job queues, S3/MinIO for immutable serialized artifacts, and auto-scaling Celery/Docker compute workers.
                  </div>
                )}
                {selectedArchNode === 'pillars' && (
                  <div>
                    <strong style={{ color: TOKENS.accentEmerald }}>The 4 Pillars:</strong> Click any tier or pillar above to inspect its production engineering specifications.
                  </div>
                )}
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: ML FOUNDATIONS & CORE CONCEPTS ───────────────── */}
          <section id="fundamentals" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentEmerald, marginBottom: 8 }}>
              <Sparkles className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Machine Learning 101
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Machine Learning Foundations & Intuitive Concepts
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 24px' }}>
              Machine learning does not have to feel like a black box of complex math. At its core, it is simply about discovering patterns in historical examples so a computer can make accurate predictions on new data.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              {/* Concept 1 */}
              <div style={{ padding: '18px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.primary, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Target className="w-4 h-4" />
                  <span>Features vs. Target (Input vs. Output)</span>
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary, lineHeight: 1.6 }}>
                  <strong>Features (X):</strong> The clues or background facts you give the model (e.g. customer age, tenure, monthly bill).<br />
                  <strong>Target (y):</strong> The specific answer you want the model to predict (e.g. will they churn: yes/no, or what will their bill be: \$85.50).
                </div>
              </div>

              {/* Concept 2 */}
              <div style={{ padding: '18px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.accentEmerald, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Split className="w-4 h-4" />
                  <span>Classification vs. Regression</span>
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary, lineHeight: 1.6 }}>
                  <strong>Classification:</strong> The answer is a category or label. Examples: Churn vs. Active, Spam vs. Not Spam, High vs. Low Risk.<br />
                  <strong>Regression:</strong> The answer is a continuous number. Examples: House price (\$350,000), Exam score (88/100), Future temperature (72.5°F).
                </div>
              </div>

              {/* Concept 3 */}
              <div style={{ padding: '18px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.accentAmber, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Train / Test Split & Honest Evaluation</span>
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary, lineHeight: 1.6 }}>
                  If a teacher tests a student on the exact same questions they practiced, you don’t know if they learned or just memorized.
                  In ML, we hold back 20% to 30% of our data as an unseen <strong>Test Set</strong> to prove the model can truly generalize.
                </div>
              </div>

              {/* Concept 4 */}
              <div style={{ padding: '18px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.accentRose, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle className="w-4 h-4" />
                  <span>Overfitting vs. Underfitting</span>
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary, lineHeight: 1.6 }}>
                  <strong>Overfitting:</strong> The model memorized the training noise like a parrot. 99% train accuracy, but fails on real data. (Fix: reduce depth, add regularization).<br />
                  <strong>Underfitting:</strong> The model is too simple to grasp the pattern. Bad on both train and test. (Fix: try a more expressive model or add features).
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: PILLAR 1 DATASET ENGINE ───────────────────────── */}
          <section id="pillar1" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.primary, marginBottom: 8 }}>
              <Database className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Pillar 1
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Dataset Engine & Feature Governance (Data Foundation)
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              Enterprise datasets frequently range from 10MB to 50GB+. Loading full CSVs into pandas in web server memory causes immediate Out-Of-Memory crashes. ML Playground replaces in-memory pandas with <strong>DuckDB</strong> streaming out-of-core profiling and strict feature governance guardrails.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.primary, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Zap className="w-4 h-4" />
                  <span>Out-of-Core DuckDB Profiling</span>
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary }}>
                  DuckDB streams tabular files in vector chunks using memory-mapped zero-copy execution. Datasets profile in sub-second time without loading raw bytes into the FastAPI process memory.
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentRose, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle className="w-4 h-4" />
                  <span>Automated Data Leakage Detection</span>
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary }}>
                  Columns with correlation &gt; 0.98 with the target column (e.g., <code>cancellation_date</code> when predicting <code>churn</code>) are automatically flagged as severe data leakage to prevent false 100% accuracy illusions.
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentAmber, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sliders className="w-4 h-4" />
                  <span>Constant & Identifier Column Pruning</span>
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary }}>
                  Zero-variance columns (same value across all rows) and high-cardinality unique ID columns (e.g. <code>customer_id</code>, UUIDs) are automatically identified and flagged for dropping.
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentEmerald, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Immutable SHA-256 Dataset Versioning</span>
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary }}>
                  Every uploaded dataset receives an immutable cryptographic content hash (e.g., <code>telco_churn:v1#a7f29b</code>). Models trained on this version retain complete, verifiable audit lineage.
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: PREPROCESSING & SCALERS ───────────────────────── */}
          <section id="preprocessing" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentViolet, marginBottom: 8 }}>
              <Sliders className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Data Preparation
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Data Preprocessing: Imputation, Scalers & Encoders
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              Real-world data is almost never clean. Models cannot process missing values or text directly, and numeric features on drastically different scales can distort distance calculations.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
              {/* Imputation Box */}
              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.primary, marginBottom: 6 }}>
                  1. Imputation (Missing Values)
                </div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, lineHeight: 1.5 }}>
                  • <strong>Mean:</strong> Fills numeric gaps with column average.<br />
                  • <strong>Median:</strong> Fills with middle value; immune to outliers.<br />
                  • <strong>Mode / Most Frequent:</strong> Best for text/categorical columns.<br />
                  • <strong>Constant:</strong> Replaces NaN with a dedicated placeholder (e.g., 0).
                </div>
              </div>

              {/* Scalers Box */}
              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentEmerald, marginBottom: 6 }}>
                  2. Feature Scalers
                </div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, lineHeight: 1.5 }}>
                  • <strong>StandardScaler:</strong> Centers mean to 0, standard deviation to 1.<br />
                  • <strong>MinMaxScaler:</strong> Squashes numbers strictly between 0 and 1.<br />
                  • <strong>RobustScaler:</strong> Uses interquartile range (IQR); resists outliers.<br />
                  • <strong>MaxAbsScaler:</strong> Scales by max absolute value for sparse data.
                </div>
              </div>

              {/* Encoders Box */}
              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentAmber, marginBottom: 6 }}>
                  3. Categorical Encoders
                </div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, lineHeight: 1.5 }}>
                  • <strong>One-Hot Encoding:</strong> Turns each category into a 0 or 1 column (e.g., Contract_Yearly).<br />
                  • <strong>Label Encoding:</strong> Assigns numbers (0, 1, 2) to categories.<br />
                  • <strong>Ordinal Encoding:</strong> Preserves logical order (Small=0, Large=2).
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: PILLAR 2 CODE STUDIO ─────────────────────────── */}
          <section id="pillar2" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentEmerald, marginBottom: 8 }}>
              <Code2 className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Pillar 2
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Monaco Code Studio & Pipeline Guardian (Decoupled Compute)
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              Rather than black-boxing machine learning, ML Playground generates clean, production-grade <code>scikit-learn</code> and <code>pandas</code> code directly inside a customized VS Code Monaco editor, defended by debounced AST validation and ephemeral sandboxes.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '16px 20px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.textPrimary, marginBottom: 4 }}>
                  1. Monaco Editor Engine (VS Code Core)
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                  Includes Python syntax highlighting, bracket colorization, multi-cursor editing, code folding, minimap, and auto-indentation. Direct modifications to hyperparameters (e.g., <code>n_estimators=100</code>, <code>max_depth=6</code>) take immediate effect.
                </div>
              </div>

              <div style={{ padding: '16px 20px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.textPrimary, marginBottom: 4 }}>
                  2. AST Syntax Checks & Pipeline Guardian Diff Modal
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                  Before any code is executed, our Python AST parser performs live static analysis. If code is modified or regenerated, the <strong>Pipeline Guardian Diff Modal</strong> highlights exact hyperparameter additions, deletions, and downstream ML impacts.
                </div>
              </div>

              <div style={{ padding: '16px 20px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.textPrimary, marginBottom: 4 }}>
                  3. Contextual AI Copilot
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                  The integrated Copilot drawer has real-time context of your active dataset, selected target column, and current editor script. It diagnoses traceback errors, suggests optimal imputation strategies, and provides enterprise optimization code.
                </div>
              </div>

              <div style={{ padding: '16px 20px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.textPrimary, marginBottom: 4 }}>
                  4. Decoupled Sandbox Execution
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                  Training jobs are queued and executed in isolated child processes with memory quotas (2GB RAM limit) and 120-second hard timeouts. Terminal logs stream back in real-time with zero blocking of the web API.
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: ALGORITHMS ENCYCLOPEDIA ───────────────────────── */}
          <section id="algorithms" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.primary, marginBottom: 8 }}>
              <Cpu className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Model Selection Guide
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 6px' }}>
                  Machine Learning Algorithms Encyclopedia
                </h2>
                <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: 0 }}>
                  A clear breakdown of all 10 Classification and 10 Regression algorithms supported in ML Playground:
                </p>
              </div>

              {/* Task Toggle Buttons */}
              <div style={{ display: 'flex', gap: 8, background: TOKENS.bgElevated, padding: 4, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <button
                  type="button"
                  onClick={() => setAlgoTab('classification')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: algoTab === 'classification' ? 'rgba(0, 212, 255, 0.2)' : 'transparent',
                    color: algoTab === 'classification' ? TOKENS.primary : TOKENS.textMuted,
                  }}
                >
                  🔍 Classification (10)
                </button>
                <button
                  type="button"
                  onClick={() => setAlgoTab('regression')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: algoTab === 'regression' ? 'rgba(0, 245, 160, 0.2)' : 'transparent',
                    color: algoTab === 'regression' ? TOKENS.accentEmerald : TOKENS.textMuted,
                  }}
                >
                  📈 Regression (10)
                </button>
              </div>
            </div>

            {/* Classification Algorithms */}
            {algoTab === 'classification' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>Logistic Regression</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Fits a linear boundary through the data and converts the result into class probabilities (0% to 100%) via an S-shaped sigmoid curve.<br />
                    <strong>Best for:</strong> Quick baseline, tabular data where features have linear relationships with outcome.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>Random Forest Classifier</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Creates an ensemble of dozens of independent decision trees trained on random data slices, letting all trees vote on the final winner.<br />
                    <strong>Best for:</strong> High accuracy, zero need for feature scaling, and handles missing or nonlinear interactions reliably.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>Decision Tree Classifier</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Builds a flowchart of simple yes/no questions (e.g. &quot;is monthly_charges &gt; 50?&quot;) to partition samples cleanly.<br />
                    <strong>Best for:</strong> Full interpretability; easy to audit and explain to business stakeholders.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>Gradient Boosting Classifier</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Trains trees sequentially in a chain. Each subsequent tree specifically focuses on correcting the errors made by previous trees.<br />
                    <strong>Best for:</strong> High predictive power on tabular datasets when properly tuned.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>XGBoost Classifier</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Optimized extreme gradient boosting with built-in L1/L2 penalty regularization to prevent trees from growing too complex.<br />
                    <strong>Best for:</strong> Top benchmark performance on tabular business data.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>LightGBM Classifier</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Bins continuous features into discrete histograms and grows trees leaf-wise rather than level-wise.<br />
                    <strong>Best for:</strong> Massive datasets with hundreds of thousands of rows where training speed is critical.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>Support Vector Classifier (SVC)</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Finds the maximum-margin decision boundary between classes; uses kernel tricks (RBF, Poly) for complex shapes.<br />
                    <strong>Best for:</strong> Moderate-sized datasets with complex decision boundaries; requires feature scaling.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>K-Nearest Neighbors Classifier</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Finds the k closest examples in feature distance and assigns the most common class among those neighbors.<br />
                    <strong>Best for:</strong> Intuitive geometric clustering problems; strictly requires scaled features.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>Gaussian Naive Bayes</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Applies Bayes&apos; probability theorem assuming all input features are completely independent of each other.<br />
                    <strong>Best for:</strong> Lightning-fast baseline, text classification, and high-dimensional sparse inputs.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>Ridge Classifier</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Converts targets to [-1, 1] and fits regularized linear regression with an L2 weight penalty.<br />
                    <strong>Best for:</strong> Fast linear classification when features exhibit strong multicollinearity (correlation).
                  </div>
                </div>
              </div>
            )}

            {/* Regression Algorithms */}
            {algoTab === 'regression' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>Linear Regression (OLS)</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Fits the best-fit straight line or plane that minimizes the sum of squared prediction errors.<br />
                    <strong>Best for:</strong> Continuous targets where each feature contributes linearly to the final outcome.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>Random Forest Regressor</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Generates a forest of decision trees and averages their numerical predictions to produce smooth continuous outputs.<br />
                    <strong>Best for:</strong> Robust, nonlinear numerical predictions without worrying about scaling or outliers.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>Decision Tree Regressor</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Splits data into partitions and predicts the average target value of samples that land in that leaf.<br />
                    <strong>Best for:</strong> Rule-based interpretability and understanding key threshold splits.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>Gradient Boosting Regressor</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Successive trees fit to the numerical residuals (Actual - Predicted) of the combined previous ensemble.<br />
                    <strong>Best for:</strong> High-precision numerical forecasting on tabular data.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>XGBoost Regressor</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Gradient boosted trees with exact second-order Taylor expansion loss optimization and tree pruning.<br />
                    <strong>Best for:</strong> Industry-standard performance across continuous business metrics (revenue, demand, price).
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>LightGBM Regressor</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Histogram-optimized boosting that rapidly groups continuous values into bins for near-instant training.<br />
                    <strong>Best for:</strong> Very large datasets with hundreds of thousands of rows.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>Support Vector Regressor (SVR)</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Fits predictions within an error tube (epsilon), ignoring small errors that fall inside the tolerance margin.<br />
                    <strong>Best for:</strong> Nonlinear regression on moderate-sized datasets; requires scaled features.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>K-Nearest Neighbors Regressor</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Locates the k closest data points in feature space and calculates the arithmetic mean of their target values.<br />
                    <strong>Best for:</strong> Local neighborhood valuation (e.g. estimating home price based on the 5 closest neighboring houses).
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>Ridge Regressor (L2 Penalty)</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Linear regression with an added penalty on the squared size of weights, preventing coefficients from blowing up.<br />
                    <strong>Best for:</strong> Data where input features have strong correlations with one another.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>Lasso Regressor (L1 Penalty)</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Linear regression with an added penalty on absolute weights, which drives irrelevant feature coefficients strictly to 0.<br />
                    <strong>Best for:</strong> High-dimensional datasets where you want automatic feature selection.
                  </div>
                </div>
              </div>
            )}
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: HYPERPARAMETERS & TUNING ──────────────────────── */}
          <section id="hyperparameters" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentAmber, marginBottom: 8 }}>
              <Target className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Knobs & Settings
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Hyperparameter Tuning Guide: What Every Slider Does
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              Hyperparameters are the control knobs you set before launching training. Tuning them balances underfitting against overfitting:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: TOKENS.primary }}>n_estimators (Number of Trees)</strong>
                  <span style={{ fontSize: 11, color: TOKENS.textMuted, fontFamily: 'monospace' }}>Default: 100</span>
                </div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                  <strong>What it does:</strong> Sets how many individual decision trees are created in an ensemble (Random Forest, Gradient Boosting, XGBoost).<br />
                  <strong>If too low:</strong> The model may underfit and produce noisy predictions.<br />
                  <strong>If too high:</strong> Training takes longer with diminishing returns in accuracy.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: TOKENS.primary }}>max_depth (Tree Depth)</strong>
                  <span style={{ fontSize: 11, color: TOKENS.textMuted, fontFamily: 'monospace' }}>Default: 4 - 6</span>
                </div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                  <strong>What it does:</strong> Limits how many levels of yes/no decision splits each tree can develop.<br />
                  <strong>If too low:</strong> Tree is too simple and misses nuances (underfitting).<br />
                  <strong>If too high:</strong> Tree memorizes every single row and overfits severely.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: TOKENS.primary }}>learning_rate (Step Size)</strong>
                  <span style={{ fontSize: 11, color: TOKENS.textMuted, fontFamily: 'monospace' }}>Default: 0.05 - 0.1</span>
                </div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                  <strong>What it does:</strong> Shrinks the contribution of each consecutive tree in gradient boosting.<br />
                  <strong>Rule of thumb:</strong> Lower learning rates (e.g. 0.03) combined with more trees (e.g. 200) almost always generalize better.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: TOKENS.primary }}>min_samples_split &amp; min_samples_leaf</strong>
                  <span style={{ fontSize: 11, color: TOKENS.textMuted, fontFamily: 'monospace' }}>Default: 2 / 1</span>
                </div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                  <strong>What it does:</strong> Sets the minimum sample count required to split a node or populate a final leaf.<br />
                  <strong>Why it matters:</strong> Increasing min_samples_leaf to 4 or 5 prevents trees from creating isolated rules for 1 or 2 outlier rows.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: TOKENS.primary }}>C &amp; alpha (Regularization Knobs)</strong>
                  <span style={{ fontSize: 11, color: TOKENS.textMuted, fontFamily: 'monospace' }}>C: 1.0 | alpha: 1.0</span>
                </div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                  <strong>In Logistic Regression / SVM (C):</strong> <em>Smaller C</em> = stronger penalty against large weights (simpler model).<br />
                  <strong>In Ridge / Lasso (alpha):</strong> <em>Larger alpha</em> = stronger penalty, pulling coefficients closer to zero.
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: PILLAR 3 EXPERIMENT TRACKING ─────────────────── */}
          <section id="pillar3" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentViolet, marginBottom: 8 }}>
              <BarChart2 className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Pillar 3
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Experiment Tracking & Model Registry (MLflow Standard)
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              Every model execution generates a formal experiment run artifact with complete metric histories, confusion matrices, and feature importance explanations. High-performing runs can be promoted into the formal Model Registry.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentViolet, marginBottom: 6 }}>
                  Multi-Run Comparison Leaderboard
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary }}>
                  Compare up to 5 model runs side-by-side. Inspect color-coded parameter diffs (learning rate, tree depth, estimators) aligned with evaluation metrics (ROC-AUC, F1, Log Loss, Latency).
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentViolet, marginBottom: 6 }}>
                  Interactive Confusion Matrix & Threshold Tuner
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary }}>
                  Toggle between raw counts, row-normalized recall, and column-normalized precision. Slide the classification threshold from 0.0 to 1.0 to balance precision vs. recall dynamically.
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentViolet, marginBottom: 6 }}>
                  SHAP & Permutation Feature Importance
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary }}>
                  Computed directly on the holdout test split. Identify which features drive model decisions and catch proxy variables or unintended data leaks before production deployment.
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentViolet, marginBottom: 6 }}>
                  Model Registry Governance
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary }}>
                  Promote models across lifecycle stages: <strong>Experiment → Candidate (Staging) → Champion (Production)</strong>. Deploying a Champion automatically routes live production traffic to the new weights.
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: PILLAR 4 MODEL SERVING ───────────────────────── */}
          <section id="pillar4" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentAmber, marginBottom: 8 }}>
              <Rocket className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Pillar 4
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Model Serving & High-Throughput Batch Scoring (Production MLOps)
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              Production deployments require sub-second low-latency serving, bulk batch scoring capabilities for millions of rows, and continuous statistical data drift guardrails.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '16px 20px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.accentAmber, marginBottom: 4 }}>
                  1. Real-Time REST Invocations API
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                  Every deployed model exposes a dedicated HTTPS route: <code>POST /api/v1/deployments/&#123;id&#125;/invocations</code>. Payloads are validated against the serialized input schema, returning predictions and class probabilities with sub-50ms latency.
                </div>
              </div>

              <div style={{ padding: '16px 20px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.accentAmber, marginBottom: 4 }}>
                  2. High-Throughput Batch CSV Scoring Engine
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                  Drag and drop an unlabeled 100,000-row CSV file. Worker processes score rows in parallel chunks and immediately produce a downloadable enriched CSV containing <code>predicted_label</code>, <code>prediction_probability</code>, and timestamps.
                </div>
              </div>

              <div style={{ padding: '16px 20px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.accentAmber, marginBottom: 4 }}>
                  3. P50 / P95 / P99 Latency Telemetry & Error Tracking
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                  Production deployments stream live telemetry charts tracking request throughput (req/sec), P50/P95/P99 latency distribution, and HTTP 2xx/4xx/5xx status ratios.
                </div>
              </div>

              <div style={{ padding: '16px 20px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.accentAmber, marginBottom: 4 }}>
                  4. Real-Time Data Drift Detection (PSI & KS Testing)
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                  Continuous background workers compute Population Stability Index (PSI) and Kolmogorov-Smirnov (KS) tests between live inference traffic and the training baseline. If PSI &gt; 0.25, automated drift warnings recommend retraining.
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: METRICS & FORMULAS ───────────────────────────── */}
          <section id="metrics" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.primary, marginBottom: 8 }}>
              <Activity className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Statistical Guide
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Diagnostic Metrics & Mathematical Formulas
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              Choosing the right metric is vital. A naive model predicting 99% accuracy on a skewed dataset (1% fraud) can be completely useless. Use this reference to pick the right metric:
            </p>

            {/* Classification Metrics Grid */}
            <h3 style={{ fontSize: 16, fontWeight: 700, color: TOKENS.primary, margin: '0 0 12px' }}>
              Classification Evaluation Metrics
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 24 }}>
              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>Accuracy: (TP + TN) / (TP + TN + FP + FN)</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  Proportion of total correct predictions. Best for balanced datasets; severely misleading when class imbalance exists.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>Precision: TP / (TP + FP)</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  Out of all positive predictions, how many were truly positive? Critical when false alarms are expensive (e.g. spam filtering).
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentAmber, fontSize: 14 }}>Recall (Sensitivity): TP / (TP + FN)</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  Out of all actual positive cases, how many were detected? Critical when missing a positive is catastrophic (e.g. medical diagnosis, fraud).
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentViolet, fontSize: 14 }}>F1-Score: 2 * (Precision * Recall) / (Precision + Recall)</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  Harmonic mean balancing both precision and recall. Best single metric for imbalanced classification tasks.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>ROC-AUC: Area Under ROC Curve</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  Measures model discrimination across all decision thresholds. 1.0 is perfect; 0.5 is coin-flip guessing.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentAmber, fontSize: 14 }}>PR-AUC: Area Under Precision-Recall Curve</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  Focuses strictly on the minority positive class. Highly recommended when positive cases represent less than 5% of data.
                </div>
              </div>
            </div>

            {/* Regression Metrics Grid */}
            <h3 style={{ fontSize: 16, fontWeight: 700, color: TOKENS.accentEmerald, margin: '0 0 12px' }}>
              Regression Evaluation Metrics
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>MAE: (1/n) * Σ |y - ŷ|</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  Mean Absolute Error: The average error distance in original units (e.g. predictions are off by \$12 on average). Intuitive and outlier-robust.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>RMSE: √[ (1/n) * Σ (y - ŷ)² ]</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  Root Mean Squared Error: Expressed in target units, but penalizes large errors much more aggressively than MAE.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>R² Score (Coefficient of Determination)</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  The percentage of total variance explained by the model. 1.0 = flawless model; 0.0 = baseline mean prediction; &lt;0 = worse than average.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>MSE: (1/n) * Σ (y - ŷ)²</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  Mean Squared Error: The raw squared loss function minimized during gradient descent and ordinary least squares training.
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: GLOSSARY ─────────────────────────────────────── */}
          <section id="glossary" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.primary, marginBottom: 8 }}>
              <BookOpen className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Encyclopedia
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px' }}>
              MLOps &amp; Machine Learning Glossary ({filteredGlossary.length} Terms)
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 18px' }}>
              Every single term, algorithm, hyperparameter, and metric used throughout ML Playground, defined in plain English:
            </p>

            {/* Interactive Category Filter Pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
              {['All', 'Foundations', 'Data & Preprocessing', 'Algorithms', 'Hyperparameters', 'Evaluation Metrics', 'MLOps & Serving'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setGlossaryCategory(cat)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 6,
                    border: '1px solid ' + (glossaryCategory === cat ? TOKENS.primary : TOKENS.border),
                    background: glossaryCategory === cat ? 'rgba(0, 212, 255, 0.18)' : 'rgba(16, 31, 56, 0.6)',
                    color: glossaryCategory === cat ? TOKENS.primary : TOKENS.textMuted,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 120ms ease',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {filteredGlossary.map((item) => (
                <div
                  key={item.term}
                  style={{
                    padding: '14px 18px',
                    background: TOKENS.bgElevated,
                    borderRadius: 8,
                    border: '1px solid ' + TOKENS.border,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 13.5 }}>{item.term}</span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'rgba(0, 212, 255, 0.1)',
                        color: TOKENS.textMuted,
                        border: '1px solid rgba(0, 212, 255, 0.15)',
                      }}
                    >
                      {item.category}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, lineHeight: 1.5 }}>{item.definition}</div>
                </div>
              ))}
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: KEYBOARD SHORTCUTS ───────────────────────────── */}
          <section id="shortcuts" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentEmerald, marginBottom: 8 }}>
              <Keyboard className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Productivity
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Keyboard Shortcuts Cheatsheet
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              Accelerate your workflow with Code Studio and Monaco editor keyboard shortcuts:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {shortcuts.map((sc) => (
                <div
                  key={sc.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: 8,
                    background: TOKENS.bgElevated,
                    border: '1px solid ' + TOKENS.border,
                  }}
                >
                  <span style={{ fontSize: 13, color: TOKENS.textSecondary }}>{sc.description}</span>
                  <button
                    onClick={() => handleCopy(sc.key)}
                    title="Click to copy shortcut"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      borderRadius: 6,
                      background: TOKENS.codeBg,
                      border: '1px solid ' + TOKENS.border,
                      color: TOKENS.primary,
                      fontSize: 11.5,
                      fontWeight: 600,
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                    }}
                  >
                    <span>{sc.key}</span>
                    {copiedShortcut === sc.key ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3 text-slate-400" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: FAQS ─────────────────────────────────────────── */}
          <section id="faqs" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentViolet, marginBottom: 8 }}>
              <HelpCircle className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Knowledge Base
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Frequently Asked Questions (FAQs)
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {filteredFaqs.map((faq, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '16px 20px',
                    borderRadius: 10,
                    background: TOKENS.bgElevated,
                    border: '1px solid ' + TOKENS.border,
                  }}
                >
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14, marginBottom: 6 }}>
                    {faq.q}
                  </div>
                  <div style={{ fontSize: 13, color: TOKENS.textSecondary, lineHeight: 1.6 }}>
                    {faq.a}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: ENTERPRISE PITFALLS ──────────────────────────── */}
          <section id="pitfalls" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentRose, marginBottom: 8 }}>
              <AlertTriangle className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Risk Mitigation
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Enterprise Anti-Patterns to Avoid
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: '14px 18px', background: 'rgba(244, 63, 94, 0.08)', borderRadius: 8, border: '1px solid rgba(244, 63, 94, 0.25)' }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentRose, fontSize: 13.5 }}>1. In-Memory Large CSV Buffering</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 3 }}>
                  Never load 10GB+ CSVs into pandas on web server pods. Always leverage DuckDB out-of-core streaming and S3 presigned multipart uploads.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: 'rgba(244, 63, 94, 0.08)', borderRadius: 8, border: '1px solid rgba(244, 63, 94, 0.25)' }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentRose, fontSize: 13.5 }}>2. Unchecked Target Leakage</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 3 }}>
                  Features with correlation &gt; 0.98 or post-event data (e.g. refund amounts in churn modeling) cause models to exhibit 99.9% test accuracy but complete failure in production.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: 'rgba(244, 63, 94, 0.08)', borderRadius: 8, border: '1px solid rgba(244, 63, 94, 0.25)' }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentRose, fontSize: 13.5 }}>3. Blind Deployment Without Drift Baselines</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 3 }}>
                  Deploying models without automated PSI / KS telemetry monitoring allows concept drift to silently degrade inference revenue unnoticed.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: 'rgba(244, 63, 94, 0.08)', borderRadius: 8, border: '1px solid rgba(244, 63, 94, 0.25)' }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentRose, fontSize: 13.5 }}>4. In-Memory Job Dictionaries Across Replicas</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 3 }}>
                  Storing active training job states in global Python dictionaries causes random 404s when requests hit different load-balanced pods. Always persist state in PostgreSQL and Redis.
                </div>
              </div>
            </div>
          </section>

          {/* ── Footer CTA ────────────────────────────────────────────── */}
          <div
            style={{
              padding: '28px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.12), rgba(0, 245, 160, 0.12))',
              border: '1px solid ' + TOKENS.borderActive,
              textAlign: 'center',
              marginTop: 40,
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: TOKENS.textPrimary }}>
              Ready to launch production ML pipelines?
            </h3>
            <p style={{ fontSize: 13, color: TOKENS.textMuted, margin: '0 0 20px' }}>
              Return to your workspace, upload an enterprise dataset or load a sample, and train your model.
            </p>
            <button
              onClick={handleReturnToPlatform}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 24px',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, #00D4FF, #00F5A0)',
                color: '#050B14',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 0 20px rgba(0, 212, 255, 0.4)',
                transition: 'transform 150ms ease',
              }}
            >
              <span>Launch ML Playground Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
