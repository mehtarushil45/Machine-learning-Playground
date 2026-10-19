/**
 * UserGuidePage — Comprehensive, Friendly Machine Learning User Guide
 *
 * Provides intuitive, plain-English educational guidance and operational references for:
 * 1. The Machine Learning Journey (Interactive 5-stage pipeline flow)
 * 2. Core Machine Learning Concepts (Features, targets, classification vs regression, overfitting)
 * 3. Preparing & Cleaning Data (Missing values, scalers, encoders, and leakage prevention)
 * 4. Code Studio & Pipeline Editor (Interactive code writing with safety checks)
 * 5. Machine Learning Algorithms Encyclopedia (All 10 classifiers & 10 regressors explained simply)
 * 6. Settings & Sliders Explained (Hyperparameters demystified with real-world analogies)
 * 7. Comparing Experiments & Models (Leaderboard, confusion matrix, and feature importance)
 * 8. Understanding Model Scores (Classification & regression metrics explained in plain English)
 * 9. Making Predictions on New Data (Single test cases & high-throughput batch CSV scoring)
 * 10. Complete Machine Learning Glossary (80+ terms covering every concept in the app)
 * 11. Keyboard Shortcuts, FAQs, and Common Mistakes to Avoid
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
  Split,
  FileSpreadsheet,
} from 'lucide-react';

// Design Tokens matching ML Playground Theme
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
  const [activeSection, setActiveSection] = useState<string>('journey');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPipelineStep, setSelectedPipelineStep] = useState<string>('dataset');
  const [copiedShortcut, setCopiedShortcut] = useState<string | null>(null);
  const [glossaryCategory, setGlossaryCategory] = useState<string>('All');
  const [algoTab, setAlgoTab] = useState<'classification' | 'regression'>('classification');

  const sections = useMemo(
    () => [
      { id: 'journey', label: '1. The Machine Learning Journey', icon: <Layers className="w-4 h-4" /> },
      { id: 'fundamentals', label: '2. Core Machine Learning Concepts', icon: <Sparkles className="w-4 h-4" /> },
      { id: 'datasets', label: '3. Preparing & Cleaning Data', icon: <Database className="w-4 h-4" /> },
      { id: 'studio', label: '4. Code Studio & Pipeline Editor', icon: <Code2 className="w-4 h-4" /> },
      { id: 'algorithms', label: '5. Algorithms & Models Guide', icon: <Cpu className="w-4 h-4" /> },
      { id: 'hyperparameters', label: '6. Settings & Sliders Explained', icon: <Target className="w-4 h-4" /> },
      { id: 'experiments', label: '7. Comparing Experiments & Models', icon: <BarChart2 className="w-4 h-4" /> },
      { id: 'metrics', label: '8. Understanding Model Scores (Metrics)', icon: <Activity className="w-4 h-4" /> },
      { id: 'predictions', label: '9. Making Predictions on New Data', icon: <Rocket className="w-4 h-4" /> },
      { id: 'glossary', label: '10. Machine Learning Glossary', icon: <BookOpen className="w-4 h-4" /> },
      { id: 'shortcuts', label: '11. Keyboard Shortcuts Cheatsheet', icon: <Keyboard className="w-4 h-4" /> },
      { id: 'faqs', label: '12. Frequently Asked Questions', icon: <HelpCircle className="w-4 h-4" /> },
      { id: 'pitfalls', label: '13. Common Mistakes to Avoid', icon: <AlertTriangle className="w-4 h-4" /> },
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

  // Complete, friendly glossary containing every term in the project
  const glossaryTerms = useMemo(
    () => [
      // Foundations
      {
        term: 'Machine Learning',
        category: 'Foundations',
        definition:
          'Teaching computers how to solve problems and make predictions by studying past examples, rather than writing thousands of rigid manual rules by hand.',
      },
      {
        term: 'Supervised Learning',
        category: 'Foundations',
        definition:
          'The most common machine learning approach: the model is given historical examples with known answers (labels) so it can learn the pattern and predict answers for new data.',
      },
      {
        term: 'Dataset',
        category: 'Foundations',
        definition:
          'Your table of data, made of rows (individual records, people, or events) and columns (the properties or measurements recorded for each row).',
      },
      {
        term: 'Features (Inputs)',
        category: 'Foundations',
        definition:
          'The input columns used by the model to learn patterns (for example: age, monthly charges, contract type, website visits). Mathematically called X.',
      },
      {
        term: 'Target (Output to Predict)',
        category: 'Foundations',
        definition:
          'The specific column you want the model to learn to predict (for example: whether a customer will churn, or the estimated price of a house). Mathematically called y.',
      },
      {
        term: 'Classification',
        category: 'Foundations',
        definition:
          'Predicting a category or label. Examples: Will this customer churn? (Yes/No), Is this email spam? (Spam/Not Spam), What is this image? (Cat/Dog).',
      },
      {
        term: 'Binary Classification',
        category: 'Foundations',
        definition:
          'Classification with exactly two possible answers (Yes or No, 1 or 0, True or False, Passed or Failed).',
      },
      {
        term: 'Multi-Class Classification',
        category: 'Foundations',
        definition:
          'Classification with three or more distinct categories (e.g. Low Risk, Medium Risk, High Risk).',
      },
      {
        term: 'Regression',
        category: 'Foundations',
        definition:
          'Predicting a continuous number. Examples: What will the house sell for? (\$420,000), What score will a student get? (86), What will tomorrow’s temperature be? (74.5°).',
      },
      {
        term: 'Train / Test Split',
        category: 'Foundations',
        definition:
          'Dividing your data into two parts: a Training Set (usually 80%) to teach the model, and an unseen Test Set (usually 20%) to test how well it performs on new data.',
      },
      {
        term: 'Overfitting',
        category: 'Foundations',
        definition:
          'When a model memorizes the training data like a parrot instead of learning general rules. It scores 99% on practice questions, but fails when given real-world questions.',
      },
      {
        term: 'Underfitting',
        category: 'Foundations',
        definition:
          'When a model is too simple to grasp the pattern in the data. It scores poorly on both the training data and the test data.',
      },
      {
        term: 'Bias-Variance Tradeoff',
        category: 'Foundations',
        definition:
          'The core balance in ML: making a model too simple leads to high bias (underfitting); making it too complex leads to high variance (overfitting). Tuning finds the sweet spot.',
      },
      {
        term: 'Random Seed / Random State',
        category: 'Foundations',
        definition:
          'A number (like 42) that locks the random number generator so your data splits and training runs produce identical, reproducible results every single time.',
      },
      {
        term: 'Stratified Split',
        category: 'Foundations',
        definition:
          'Splitting data so that both the training set and test set have the exact same percentage of positive and negative cases as the original dataset.',
      },
      {
        term: 'Cross-Validation (CV)',
        category: 'Foundations',
        definition:
          'Testing the model across multiple different slices of the data to verify that results are solid and not just a lucky fluke on one split.',
      },
      {
        term: 'Class Imbalance',
        category: 'Foundations',
        definition:
          'When one outcome is much rarer than another (e.g. 99% legitimate transactions vs 1% fraud). Simple accuracy is misleading here, so we look at Precision, Recall, and F1-Score.',
      },

      // Data & Preprocessing
      {
        term: 'Target Leakage',
        category: 'Data & Preprocessing',
        definition:
          'When an input column accidentally contains information that would only exist AFTER the outcome happened (e.g. cancellation_date when predicting churn). ML Playground automatically warns you if a feature has >0.98 correlation with the target.',
      },
      {
        term: 'Missing Values (NaN)',
        category: 'Data & Preprocessing',
        definition:
          'Empty or blank cells in your data table. Models cannot compute math with empty cells, so they must be filled in (imputed) or cleaned before training.',
      },
      {
        term: 'Imputation',
        category: 'Data & Preprocessing',
        definition:
          'The process of filling in missing cells with smart, statistically sound estimates instead of throwing away entire rows of valuable data.',
      },
      {
        term: 'Mean Imputation',
        category: 'Data & Preprocessing',
        definition:
          'Fills in missing numeric cells using the column average. Fast and straightforward.',
      },
      {
        term: 'Median Imputation',
        category: 'Data & Preprocessing',
        definition:
          'Fills in missing numeric cells using the middle value of the sorted column. Highly recommended whenever data has extreme outliers (like income or house prices).',
      },
      {
        term: 'Mode / Most Frequent Imputation',
        category: 'Data & Preprocessing',
        definition:
          'Fills in missing values with the most frequently occurring value in that column. Standard for text or category columns.',
      },
      {
        term: 'Constant Imputation',
        category: 'Data & Preprocessing',
        definition:
          'Fills in missing values with a designated fixed placeholder (like 0 for numbers or "Unknown" for categories).',
      },
      {
        term: 'KNN Imputer',
        category: 'Data & Preprocessing',
        definition:
          'Finds the most similar rows based on other features and uses their values to estimate what was missing.',
      },
      {
        term: 'Feature Scaling',
        category: 'Data & Preprocessing',
        definition:
          'Adjusting numeric columns to a consistent scale so that columns with huge numbers (e.g. Salary \$120,000) don’t drown out columns with small numbers (e.g. Age 28).',
      },
      {
        term: 'StandardScaler (Z-Score)',
        category: 'Data & Preprocessing',
        definition:
          'Adjusts numbers so the column average becomes 0 and the spread (standard deviation) becomes 1. The most common standard scaler in machine learning.',
      },
      {
        term: 'MinMaxScaler',
        category: 'Data & Preprocessing',
        definition:
          'Squashes all numbers in a column strictly into a range between 0.0 and 1.0, preserving the exact relative distances.',
      },
      {
        term: 'RobustScaler',
        category: 'Data & Preprocessing',
        definition:
          'Scales numbers using the median and the middle 50% of the data, ensuring extreme outliers do not distort the scale.',
      },
      {
        term: 'One-Hot Encoding',
        category: 'Data & Preprocessing',
        definition:
          'Converts text categories (e.g., Red, Blue) into separate 0 or 1 indicator columns (Is_Red = 0 or 1, Is_Blue = 0 or 1) so models can do math with them.',
      },
      {
        term: 'Label Encoding',
        category: 'Data & Preprocessing',
        definition:
          'Converts categories into numbers (e.g., Small = 0, Medium = 1, Large = 2).',
      },
      {
        term: 'High Cardinality',
        category: 'Data & Preprocessing',
        definition:
          'When a category column has an excessively large number of unique values (like 5,000 postal codes or user IDs). ML Playground alerts you so it doesn’t slow down training.',
      },
      {
        term: 'Zero-Variance / Constant Column',
        category: 'Data & Preprocessing',
        definition:
          'A column where every single row has the exact same value. Since it provides zero clues, it should be dropped.',
      },
      {
        term: 'Multicollinearity',
        category: 'Data & Preprocessing',
        definition:
          'When two or more input columns are nearly identical or heavily correlated, providing duplicate information.',
      },
      {
        term: 'Dataset Profiler',
        category: 'Data & Preprocessing',
        definition:
          'The automatic analysis tool inside ML Playground that instantly scans, profiles, and detects column types and missing values for your uploaded files without lagging.',
      },

      // Algorithms
      {
        term: 'Random Forest',
        category: 'Algorithms',
        definition:
          'Builds a team of dozens of independent decision trees. In classification, the trees vote on the best answer; in regression, they average their predictions. Very accurate and reliable.',
      },
      {
        term: 'Decision Tree',
        category: 'Algorithms',
        definition:
          'Creates a simple flowchart of yes/no questions (e.g., "Is age > 30?"). Easy to understand and visually inspect.',
      },
      {
        term: 'Logistic Regression',
        category: 'Algorithms',
        definition:
          'A fast classification model that calculates probabilities between 0% and 100% using an S-shaped curve. Great for establishing a clear baseline.',
      },
      {
        term: 'Linear Regression',
        category: 'Algorithms',
        definition:
          'The foundational regression model that draws the best-fitting straight line through your data points to make continuous numerical predictions.',
      },
      {
        term: 'Gradient Boosting',
        category: 'Algorithms',
        definition:
          'A powerful team of decision trees built sequentially, where each new tree specifically focuses on correcting the mistakes of the previous trees.',
      },
      {
        term: 'XGBoost',
        category: 'Algorithms',
        definition:
          'An optimized, tournament-winning version of gradient boosting that includes built-in safeguards to prevent trees from growing overly complex.',
      },
      {
        term: 'LightGBM',
        category: 'Algorithms',
        definition:
          'A high-speed gradient boosting model created by Microsoft that groups numbers into bins, making it extremely fast on large datasets with thousands of rows.',
      },
      {
        term: 'K-Nearest Neighbors (KNN)',
        category: 'Algorithms',
        definition:
          'Makes predictions by finding the closest past examples in the data and taking their vote or average. Intuitive and visual.',
      },
      {
        term: 'Support Vector Machine (SVM / SVC / SVR)',
        category: 'Algorithms',
        definition:
          'Draws the widest possible separation boundary between classes, using mathematical kernels to handle complex shapes.',
      },
      {
        term: 'Gaussian Naive Bayes',
        category: 'Algorithms',
        definition:
          'A fast probability-based classifier that calculates odds based on Bayes’ Theorem, assuming features operate independently.',
      },
      {
        term: 'Ridge',
        category: 'Algorithms',
        definition:
          'A regularized linear model with an L2 penalty that prevents feature weights from blowing up when features are correlated.',
      },
      {
        term: 'Lasso',
        category: 'Algorithms',
        definition:
          'A linear regression model with an L1 penalty that forces unhelpful feature weights down to zero, automatically selecting the most important columns.',
      },

      // Hyperparameters (Settings)
      {
        term: 'Hyperparameter',
        category: 'Hyperparameters',
        definition:
          'A setting or knob you adjust before training begins (such as number of trees, tree depth, or learning rate) to control how the model learns.',
      },
      {
        term: 'n_estimators (Number of Trees)',
        category: 'Hyperparameters',
        definition:
          'The number of trees in an ensemble model like Random Forest. More trees generally increase stability up until a natural plateau.',
      },
      {
        term: 'max_depth (Tree Depth)',
        category: 'Hyperparameters',
        definition:
          'How deep a decision tree is allowed to grow. Lower depth prevents memorizing noise (overfitting); higher depth captures more intricate patterns.',
      },
      {
        term: 'learning_rate (Step Size)',
        category: 'Hyperparameters',
        definition:
          'How big of a step each tree takes in gradient boosting. A smaller learning rate with more trees almost always generalizes better.',
      },
      {
        term: 'min_samples_split',
        category: 'Hyperparameters',
        definition:
          'The minimum number of samples needed in a node before a tree is allowed to make another question split.',
      },
      {
        term: 'min_samples_leaf',
        category: 'Hyperparameters',
        definition:
          'The minimum number of samples required at the end of a decision branch. Prevents models from creating rules for single oddball rows.',
      },
      {
        term: 'C (Regularization Knob in SVM/Logistic)',
        category: 'Hyperparameters',
        definition:
          'Controls the penalty against complexity. Smaller C makes the model simpler and smoother; larger C fits the training data more closely.',
      },
      {
        term: 'alpha (Regularization Knob in Ridge/Lasso)',
        category: 'Hyperparameters',
        definition:
          'The penalty strength for Ridge and Lasso. Increasing alpha pulls coefficients closer to zero to combat overfitting.',
      },
      {
        term: 'n_neighbors (k in KNN)',
        category: 'Hyperparameters',
        definition:
          'The number of closest past examples to examine when making a prediction.',
      },
      {
        term: 'criterion',
        category: 'Hyperparameters',
        definition:
          'The mathematical formula used to judge split quality in trees: Gini or Entropy for classification; Squared Error for regression.',
      },

      // Evaluation Metrics
      {
        term: 'Accuracy',
        category: 'Evaluation Metrics',
        definition:
          'The percentage of all predictions that were correct: (Correct Predictions / Total Predictions). Great for balanced datasets.',
      },
      {
        term: 'Precision',
        category: 'Evaluation Metrics',
        definition:
          'When the model says "Yes", how often is it actually right? Crucial when false alarms are expensive (e.g. spam filtering or fraud alerts).',
      },
      {
        term: 'Recall (Sensitivity)',
        category: 'Evaluation Metrics',
        definition:
          'Out of all the real "Yes" cases out there, how many did the model catch? Crucial when missing a positive is dangerous (e.g. medical diagnosis).',
      },
      {
        term: 'F1-Score',
        category: 'Evaluation Metrics',
        definition:
          'The balanced average between Precision and Recall. The single best overall score for classification when classes are imbalanced.',
      },
      {
        term: 'Confusion Matrix',
        category: 'Evaluation Metrics',
        definition:
          'A 2x2 grid showing where the model was right (True Positives, True Negatives) and where it made mistakes (False Positives, False Negatives).',
      },
      {
        term: 'ROC Curve & ROC-AUC',
        category: 'Evaluation Metrics',
        definition:
          'A score measuring how well the model separates the two classes across all confidence levels. 1.0 is a perfect model; 0.5 is guessing like a coin toss.',
      },
      {
        term: 'Precision-Recall (PR) Curve',
        category: 'Evaluation Metrics',
        definition:
          'Shows the tradeoff between Precision and Recall across different thresholds. The best metric when positive cases are very rare.',
      },
      {
        term: 'Decision Threshold',
        category: 'Evaluation Metrics',
        definition:
          'The confidence cutoff (default 50% or 0.50) above which a case is declared positive. Lowering it catches more positives; raising it reduces false alarms.',
      },
      {
        term: 'Mean Absolute Error (MAE)',
        category: 'Evaluation Metrics',
        definition:
          'The average error distance in regression, expressed in original units (e.g. predictions are off by \$15 on average). Simple and intuitive.',
      },
      {
        term: 'Root Mean Squared Error (RMSE)',
        category: 'Evaluation Metrics',
        definition:
          'Similar to MAE, but penalizes large mistakes much more harshly. Also expressed in original target units.',
      },
      {
        term: 'R² Score (Coefficient of Determination)',
        category: 'Evaluation Metrics',
        definition:
          'The percentage of variation explained by your model. 1.0 = 100% perfect predictions; 0.0 = no better than guessing the average; < 0 = worse than average.',
      },
      {
        term: 'Feature Importance',
        category: 'Evaluation Metrics',
        definition:
          'A percentage ranking showing which columns in your data contributed the most to the model’s predictions.',
      },
      {
        term: 'SHAP Values',
        category: 'Evaluation Metrics',
        definition:
          'An advanced explanation method that reveals whether each specific feature pushed a prediction higher or lower.',
      },

      // Predictions & Workflow
      {
        term: 'Trained Model',
        category: 'Predictions & Workflow',
        definition:
          'The finished, trained pattern engine saved to your workspace, ready to make predictions on new data anytime.',
      },
      {
        term: 'Batch CSV Predictions',
        category: 'Predictions & Workflow',
        definition:
          'Drag and drop an unlabeled CSV file with hundreds or thousands of rows. The model calculates predictions for all rows and gives you a downloadable results file.',
      },
      {
        term: 'Single Test Prediction',
        category: 'Predictions & Workflow',
        definition:
          'Type in values for a single customer or case and instantly see what the model predicts along with its confidence percentage.',
      },
      {
        term: 'Candidate Model',
        category: 'Predictions & Workflow',
        definition:
          'A promising newly trained model saved in your experiment list for verification before replacing your primary model.',
      },
      {
        term: 'Champion Model',
        category: 'Predictions & Workflow',
        definition:
          'Your active, winning model designated to handle live predictions and batch CSV scoring.',
      },
      {
        term: 'Model Registry Staging',
        category: 'Predictions & Workflow',
        definition:
          'Organizing your models into clear stages: Experiments (training runs), Candidate (testing), and Champion (active winner).',
      },
      {
        term: 'Data Drift',
        category: 'Predictions & Workflow',
        definition:
          'When real-world conditions change over time (e.g. customer behavior shifts after a year) so new data no longer matches the historical training data.',
      },
      {
        term: 'Population Stability Index (PSI)',
        category: 'Predictions & Workflow',
        definition:
          'A statistical score measuring whether incoming new data matches your training baseline. PSI < 0.1 means stable; PSI > 0.25 warns that retraining is recommended.',
      },
      {
        term: 'Kolmogorov-Smirnov (KS) Test',
        category: 'Predictions & Workflow',
        definition:
          'A statistical test comparing continuous distributions to detect if incoming numbers have significantly shifted away from your baseline data.',
      },
      {
        term: 'Pipeline Guardian',
        category: 'Predictions & Workflow',
        definition:
          'The built-in safety checker in ML Playground that verifies your code for syntax errors and reviews parameter changes before running.',
      },
    ],
    []
  );

  // Keyboard Shortcuts
  const shortcuts = useMemo(
    () => [
      { key: 'Ctrl + Enter', description: 'Run Pipeline in Code Studio' },
      { key: 'Ctrl + S', description: 'Save Pipeline Code & State' },
      { key: 'Ctrl + F', description: 'Find & Replace in Code Editor' },
      { key: 'Ctrl + K', description: 'Focus Global Search Bar' },
      { key: 'Alt + Up / Down', description: 'Move Line Up / Down in Editor' },
      { key: 'Ctrl + /', description: 'Toggle Line Comment' },
    ],
    []
  );

  // Friendly FAQs
  const faqs = useMemo(
    () => [
      {
        q: 'How does the platform handle large datasets without freezing or slowing down?',
        a: 'The platform uses high-speed streaming data processing. Instead of loading an entire large file into browser memory all at once, it reads and inspects your data in efficient chunks directly from disk, ensuring smooth and instant previews.',
      },
      {
        q: 'How does the Pipeline Guardian prevent broken execution?',
        a: 'The Pipeline Guardian checks your Python code as you type. If you introduce a typo, syntax error, or unsupported parameter, it alerts you before you run so your workspace never crashes.',
      },
      {
        q: 'What is the difference between Candidate and Champion models?',
        a: 'When you train models, they start as Experiments. You can mark a great run as a Candidate to test it out. When you are confident it is your best model, you promote it to Champion, making it your primary model for making predictions.',
      },
      {
        q: 'How does Batch CSV Predictions handle missing columns?',
        a: 'The prediction engine checks your uploaded CSV against the columns the model was trained on. Missing non-critical columns receive automatic imputation; missing required columns raise a clear, helpful message.',
      },
      {
        q: 'What does the Data Drift alert mean?',
        a: 'If incoming real-world data looks noticeably different from the data used during training (measured by Population Stability Index > 0.25), the system alerts you so you know it is time to retrain with fresh data.',
      },
      {
        q: 'Why do algorithms like Random Forest exist in both Classification and Regression?',
        a: 'The tree structure can handle both types of problems! When predicting categories (like Churn: Yes or No), the trees take a vote on the most popular class. When predicting numbers (like House Price), the trees calculate the average number.',
      },
      {
        q: 'How does the Decision Threshold slider work?',
        a: 'By default, models classify anything above 50% probability (0.50) as positive. Lowering the threshold to 0.30 makes the model catch more positive cases (higher Recall), but creates more false alarms. Raising it to 0.70 makes it conservative (higher Precision).',
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
              ML Playground — Complete Machine Learning Guide
            </div>
            <div style={{ fontSize: 11, color: TOKENS.textMuted }}>
              Learn How to Explore Data, Train Models, and Understand Predictions
            </div>
          </div>
        </div>

        {/* Global Search Input */}
        <div style={{ position: 'relative', width: 380, display: 'flex', alignItems: 'center' }}>
          <Search style={{ position: 'absolute', left: 12, width: 14, height: 14, color: TOKENS.textMuted }} />
          <input
            type="text"
            data-testid="guide-search-input"
            placeholder="Search any ML concept, algorithm, metric, or slider..."
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
            width: 310,
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
            Guide &amp; Reference Sections
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
        </aside>

        {/* ── Main Content Area ────────────────────────────────────────── */}
        <main style={{ flex: 1, padding: '36px 48px', overflowY: 'auto', lineHeight: 1.6 }}>

          {/* ── SECTION 1: THE MACHINE LEARNING JOURNEY ──────────────── */}
          <section id="journey" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.primary, marginBottom: 8 }}>
              <Layers className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Step-by-Step Overview
              </span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 14px', letterSpacing: '-0.02em' }}>
              The Machine Learning Journey in ML Playground
            </h1>
            <p style={{ fontSize: 14.5, color: TOKENS.textSecondary, maxWidth: 880, margin: '0 0 24px' }}>
              Building a machine learning model follows a straightforward 5-stage workflow. Click any stage in the flow below to see what happens:
            </p>

            {/* Interactive Visual ML Pipeline Diagram */}
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
                  <span>The 5 Stages of Machine Learning (Click a stage to inspect)</span>
                </div>
                <div style={{ fontSize: 11, color: TOKENS.textMuted }}>
                  Selected Stage: <strong style={{ color: TOKENS.accentEmerald }}>{selectedPipelineStep.toUpperCase()}</strong>
                </div>
              </div>

              {/* Friendly Pipeline SVG Flow */}
              <svg
                viewBox="0 0 840 180"
                style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8, background: TOKENS.codeBg }}
              >
                {/* Step 1 */}
                <g onClick={() => setSelectedPipelineStep('dataset')} style={{ cursor: 'pointer' }}>
                  <rect
                    x="20"
                    y="30"
                    width="150"
                    height="80"
                    rx="8"
                    fill={selectedPipelineStep === 'dataset' ? 'rgba(0, 212, 255, 0.25)' : 'rgba(16, 31, 56, 0.9)'}
                    stroke={TOKENS.primary}
                    strokeWidth="1.5"
                  />
                  <text x="95" y="62" fill={TOKENS.primary} fontSize="11" fontWeight="700" textAnchor="middle">
                    1. DATASET &amp; PROFILER
                  </text>
                  <text x="95" y="82" fill={TOKENS.textMuted} fontSize="9" textAnchor="middle">
                    Upload &amp; Inspect Columns
                  </text>
                </g>

                {/* Arrow 1 */}
                <path d="M 175 70 L 195 70" stroke={TOKENS.borderActive} strokeWidth="2" markerEnd="url(#arrow)" />

                {/* Step 2 */}
                <g onClick={() => setSelectedPipelineStep('preprocessing')} style={{ cursor: 'pointer' }}>
                  <rect
                    x="200"
                    y="30"
                    width="150"
                    height="80"
                    rx="8"
                    fill={selectedPipelineStep === 'preprocessing' ? 'rgba(129, 140, 248, 0.25)' : 'rgba(16, 31, 56, 0.9)'}
                    stroke={TOKENS.accentViolet}
                    strokeWidth="1.5"
                  />
                  <text x="275" y="62" fill={TOKENS.accentViolet} fontSize="11" fontWeight="700" textAnchor="middle">
                    2. DATA PREPROCESSING
                  </text>
                  <text x="275" y="82" fill={TOKENS.textMuted} fontSize="9" textAnchor="middle">
                    Fill Gaps &amp; Scale Numbers
                  </text>
                </g>

                {/* Arrow 2 */}
                <path d="M 355 70 L 375 70" stroke={TOKENS.borderActive} strokeWidth="2" />

                {/* Step 3 */}
                <g onClick={() => setSelectedPipelineStep('studio')} style={{ cursor: 'pointer' }}>
                  <rect
                    x="380"
                    y="30"
                    width="150"
                    height="80"
                    rx="8"
                    fill={selectedPipelineStep === 'studio' ? 'rgba(0, 245, 160, 0.25)' : 'rgba(16, 31, 56, 0.9)'}
                    stroke={TOKENS.accentEmerald}
                    strokeWidth="1.5"
                  />
                  <text x="455" y="62" fill={TOKENS.accentEmerald} fontSize="11" fontWeight="700" textAnchor="middle">
                    3. CODE &amp; TRAINING STUDIO
                  </text>
                  <text x="455" y="82" fill={TOKENS.textMuted} fontSize="9" textAnchor="middle">
                    Pick Model &amp; Train Code
                  </text>
                </g>

                {/* Arrow 3 */}
                <path d="M 535 70 L 555 70" stroke={TOKENS.borderActive} strokeWidth="2" />

                {/* Step 4 */}
                <g onClick={() => setSelectedPipelineStep('results')} style={{ cursor: 'pointer' }}>
                  <rect
                    x="560"
                    y="30"
                    width="130"
                    height="80"
                    rx="8"
                    fill={selectedPipelineStep === 'results' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(16, 31, 56, 0.9)'}
                    stroke={TOKENS.accentAmber}
                    strokeWidth="1.5"
                  />
                  <text x="625" y="62" fill={TOKENS.accentAmber} fontSize="10.5" fontWeight="700" textAnchor="middle">
                    4. RESULTS &amp; EVALUATION
                  </text>
                  <text x="625" y="82" fill={TOKENS.textMuted} fontSize="9" textAnchor="middle">
                    Accuracy &amp; Metrics
                  </text>
                </g>

                {/* Arrow 4 */}
                <path d="M 695 70 L 710 70" stroke={TOKENS.borderActive} strokeWidth="2" />

                {/* Step 5 */}
                <g onClick={() => setSelectedPipelineStep('predictions')} style={{ cursor: 'pointer' }}>
                  <rect
                    x="715"
                    y="30"
                    width="110"
                    height="80"
                    rx="8"
                    fill={selectedPipelineStep === 'predictions' ? 'rgba(0, 212, 255, 0.25)' : 'rgba(16, 31, 56, 0.9)'}
                    stroke={TOKENS.primary}
                    strokeWidth="1.5"
                  />
                  <text x="770" y="62" fill={TOKENS.primary} fontSize="10" fontWeight="700" textAnchor="middle">
                    5. MODEL PREDICTIONS
                  </text>
                  <text x="770" y="82" fill={TOKENS.textMuted} fontSize="9" textAnchor="middle">
                    Test or Bulk Score
                  </text>
                </g>

                {/* Bottom Guide Bar */}
                <rect x="20" y="130" width="805" height="30" rx="6" fill="rgba(0, 212, 255, 0.08)" />
                <text x="420" y="150" fill={TOKENS.textSecondary} fontSize="11" fontWeight="600" textAnchor="middle">
                  Every step is connected: change your settings, regenerate code, and train models with 1 click.
                </text>
              </svg>

              {/* Explanatory Step Card */}
              <div
                style={{
                  marginTop: 14,
                  padding: '14px 18px',
                  borderRadius: 8,
                  background: 'rgba(0, 212, 255, 0.05)',
                  border: '1px solid ' + TOKENS.border,
                  fontSize: 13,
                  color: TOKENS.textSecondary,
                }}
              >
                {selectedPipelineStep === 'dataset' && (
                  <div>
                    <strong style={{ color: TOKENS.primary }}>Stage 1 — Dataset &amp; Profiler:</strong> Upload any CSV file or load our sample datasets. The app instantly shows row counts, missing values, column data types, and checks for data leakage.
                  </div>
                )}
                {selectedPipelineStep === 'preprocessing' && (
                  <div>
                    <strong style={{ color: TOKENS.accentViolet }}>Stage 2 — Data Preprocessing:</strong> Clean and format your data. Choose how to fill missing gaps (Mean, Median, or Mode), scale large numbers, and turn text into numbers that models can calculate.
                  </div>
                )}
                {selectedPipelineStep === 'studio' && (
                  <div>
                    <strong style={{ color: TOKENS.accentEmerald }}>Stage 3 — Code &amp; Training Studio:</strong> Pick your algorithm (like Random Forest or XGBoost), adjust your settings (like number of trees), and click Launch Training to watch your model learn in real time.
                  </div>
                )}
                {selectedPipelineStep === 'results' && (
                  <div>
                    <strong style={{ color: TOKENS.accentAmber }}>Stage 4 — Results &amp; Evaluation:</strong> Inspect your model&apos;s scorecards. View Accuracy, Precision, Recall, Confusion Matrix, and see which features were most influential.
                  </div>
                )}
                {selectedPipelineStep === 'predictions' && (
                  <div>
                    <strong style={{ color: TOKENS.primary }}>Stage 5 — Model Predictions:</strong> Put your trained model to work! Test individual inputs with live predictions, or upload an entire CSV of new records to score them in bulk.
                  </div>
                )}
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION 2: CORE MACHINE LEARNING CONCEPTS ────────────── */}
          <section id="fundamentals" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentEmerald, marginBottom: 8 }}>
              <Sparkles className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Machine Learning 101
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Core Machine Learning Concepts Made Simple
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 24px' }}>
              Machine learning is simply finding patterns in historical examples so a computer can make predictions on new data. Here are the core concepts you need to know:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              {/* Concept 1 */}
              <div style={{ padding: '18px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.primary, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Target className="w-4 h-4" />
                  <span>Inputs (Features) vs. The Output (Target)</span>
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary, lineHeight: 1.6 }}>
                  <strong>Features (Inputs):</strong> The facts you give the model to learn from (e.g., customer age, monthly charges, contract type).<br />
                  <strong>Target (Output):</strong> The specific answer you want the model to learn to predict (e.g., will this customer churn: Yes or No?).
                </div>
              </div>

              {/* Concept 2 */}
              <div style={{ padding: '18px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.accentEmerald, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Split className="w-4 h-4" />
                  <span>Classification vs. Regression</span>
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary, lineHeight: 1.6 }}>
                  <strong>Classification:</strong> The answer is a category or label. Examples: Churn vs. Stay, Spam vs. Not Spam, High vs. Low Risk.<br />
                  <strong>Regression:</strong> The answer is a continuous number. Examples: House price (\$350,000), Exam score (88/100), Tomorrow&apos;s temperature (72°F).
                </div>
              </div>

              {/* Concept 3 */}
              <div style={{ padding: '18px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.accentAmber, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Train / Test Split &amp; Honest Testing</span>
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary, lineHeight: 1.6 }}>
                  If a student takes an exam with the exact same questions they practiced, you don&apos;t know if they learned or just memorized.
                  In ML, we hold back 20% to 30% of data as an unseen <strong>Test Set</strong> to prove the model can truly make accurate predictions on new data.
                </div>
              </div>

              {/* Concept 4 */}
              <div style={{ padding: '18px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.accentRose, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle className="w-4 h-4" />
                  <span>Overfitting vs. Underfitting</span>
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary, lineHeight: 1.6 }}>
                  <strong>Overfitting:</strong> The model memorized the training data like a parrot. 99% training score, but fails on real data. (Fix: reduce tree depth, add regularization).<br />
                  <strong>Underfitting:</strong> The model is too simple to grasp the pattern. Bad on both training and test data. (Fix: try a more expressive model or add more features).
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION 3: PREPARING & CLEANING DATA ───────────────────── */}
          <section id="datasets" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.primary, marginBottom: 8 }}>
              <Database className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Data Preparation
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Preparing &amp; Cleaning Data: Imputation, Scalers &amp; Encoders
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              Real-world data is almost never clean. Models cannot do math with missing values or raw text words, and columns with huge numbers can overshadow small numbers.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
              {/* Imputation Box */}
              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.primary, marginBottom: 6 }}>
                  1. Filling Gaps (Imputation)
                </div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, lineHeight: 1.5 }}>
                  • <strong>Mean:</strong> Fills empty numeric cells with the column average.<br />
                  • <strong>Median:</strong> Fills with the middle value; best when data has extreme outliers.<br />
                  • <strong>Mode / Most Frequent:</strong> Best for text categories.<br />
                  • <strong>Constant:</strong> Replaces missing cells with 0 or a fixed placeholder.
                </div>
              </div>

              {/* Scalers Box */}
              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentEmerald, marginBottom: 6 }}>
                  2. Number Scaling (Scalers)
                </div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, lineHeight: 1.5 }}>
                  • <strong>StandardScaler:</strong> Centers numbers around 0 with a spread of 1.<br />
                  • <strong>MinMaxScaler:</strong> Squashes numbers strictly between 0.0 and 1.0.<br />
                  • <strong>RobustScaler:</strong> Resists outliers using the middle 50% of data.<br />
                  • <strong>Why it matters:</strong> Ensures Salary (\$100,000) doesn&apos;t overpower Age (25).
                </div>
              </div>

              {/* Encoders Box */}
              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentAmber, marginBottom: 6 }}>
                  3. Turning Text to Numbers (Encoders)
                </div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, lineHeight: 1.5 }}>
                  • <strong>One-Hot Encoding:</strong> Turns each category into a 0 or 1 column (e.g., Contract_Yearly).<br />
                  • <strong>Label Encoding:</strong> Assigns simple numbers (0, 1, 2) to categories.<br />
                  • <strong>Why it matters:</strong> Algorithms can only do mathematical calculations with numbers.
                </div>
              </div>
            </div>

            <div style={{ padding: '14px 18px', background: 'rgba(244, 63, 94, 0.08)', borderRadius: 8, border: '1px solid rgba(244, 63, 94, 0.25)' }}>
              <div style={{ fontWeight: 700, color: TOKENS.accentRose, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle className="w-4 h-4" />
                <span>Target Leakage Warning</span>
              </div>
              <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 3 }}>
                Target leakage happens when an input column contains the answer from the future (for example, including <code>cancellation_date</code> when trying to predict <code>churn</code>). ML Playground automatically flags any feature with over 0.98 correlation with the target so you don&apos;t get fooled by fake 100% scores.
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION 4: CODE STUDIO & PIPELINE EDITOR ──────────────── */}
          <section id="studio" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentEmerald, marginBottom: 8 }}>
              <Code2 className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Code &amp; Training
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Code Studio &amp; Pipeline Editor
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              ML Playground writes clean, real Python code using standard libraries (<code>scikit-learn</code> and <code>pandas</code>). You can inspect the code, modify settings, or run it directly:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '16px 20px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.textPrimary, marginBottom: 4 }}>
                  1. Interactive Code Editor
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                  Full code editor with Python syntax highlighting, line numbers, and auto-indentation. As you change sliders in the setup panel, the Python script updates automatically.
                </div>
              </div>

              <div style={{ padding: '16px 20px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.textPrimary, marginBottom: 4 }}>
                  2. Smart Safety Check (Pipeline Guardian)
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                  Before any code runs, a safety checker validates your code for syntax typos or missing variables. If you make edits, the Diff modal highlights exactly what changed so you don&apos;t accidentally break your model.
                </div>
              </div>

              <div style={{ padding: '16px 20px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.textPrimary, marginBottom: 4 }}>
                  3. Built-In AI Assistant (Copilot)
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                  Open the Copilot drawer anytime to ask questions about your data, diagnose errors, or get suggestions on which algorithm will perform best on your dataset.
                </div>
              </div>

              <div style={{ padding: '16px 20px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.textPrimary, marginBottom: 4 }}>
                  4. Safe Sandboxed Execution
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                  When you click Run, training executes in an isolated environment with real-time log streaming. Your browser never freezes, even when training models on large files.
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION 5: ALGORITHMS ENCYCLOPEDIA ─────────────────────── */}
          <section id="algorithms" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.primary, marginBottom: 8 }}>
              <Cpu className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Choosing The Right Model
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 6px' }}>
                  Machine Learning Algorithms Guide
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
                  🔍 Classification Models (10)
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
                  📈 Regression Models (10)
                </button>
              </div>
            </div>

            {/* Classification Algorithms */}
            {algoTab === 'classification' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>Logistic Regression</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Calculates a probability between 0% and 100% using an S-shaped curve.<br />
                    <strong>Best for:</strong> A quick, easy-to-understand baseline for Yes/No questions.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>Random Forest Classifier</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Creates an army of decision trees and takes a majority vote on the winner.<br />
                    <strong>Best for:</strong> Top accuracy, handles messy data with zero need to scale numbers.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>Decision Tree Classifier</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Breaks data down into a flowchart of simple yes/no questions.<br />
                    <strong>Best for:</strong> Maximum transparency; easy to explain rules to anyone.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>Gradient Boosting Classifier</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Builds trees in a chain, where each new tree focuses on correcting the mistakes of the previous ones.<br />
                    <strong>Best for:</strong> High precision on business tables and customer data.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>XGBoost Classifier</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Extreme gradient boosting with built-in penalties to stop trees from becoming overly complicated.<br />
                    <strong>Best for:</strong> Tournament-winning accuracy on structured tables.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>LightGBM Classifier</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Groups numbers into bins, making tree growth incredibly fast.<br />
                    <strong>Best for:</strong> Large datasets with thousands of rows where training speed matters.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>Support Vector Classifier (SVC)</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Finds the widest separation boundary line between two classes.<br />
                    <strong>Best for:</strong> Clean datasets with clear separation; requires scaled numbers.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>K-Nearest Neighbors Classifier</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Looks at the k most similar past examples and takes their majority vote.<br />
                    <strong>Best for:</strong> Intuitive similarity-based problems; requires scaled numbers.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>Gaussian Naive Bayes</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Uses probability formulas assuming each feature contributes independently.<br />
                    <strong>Best for:</strong> Lightning-fast training, text classification, and simple baselines.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>Ridge Classifier</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Linear classification with a penalty that stops weights from blowing up.<br />
                    <strong>Best for:</strong> Fast linear classification when features are correlated with each other.
                  </div>
                </div>
              </div>
            )}

            {/* Regression Algorithms */}
            {algoTab === 'regression' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>Linear Regression</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Draws the best-fitting straight line through your data points.<br />
                    <strong>Best for:</strong> Predicting continuous numbers when trends follow a straight path.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>Random Forest Regressor</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Averages the numerical predictions of dozens of independent decision trees.<br />
                    <strong>Best for:</strong> Smooth, highly accurate number predictions on real-world data.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>Decision Tree Regressor</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Splits data into branches and calculates the average value of each leaf.<br />
                    <strong>Best for:</strong> Easy visual inspection of numerical cutoff rules.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>Gradient Boosting Regressor</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Successive trees fit to the remaining numerical error of the previous trees.<br />
                    <strong>Best for:</strong> Precise financial, pricing, and quantitative forecasting.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>XGBoost Regressor</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Scaled gradient boosted trees with built-in penalties to avoid overfitting.<br />
                    <strong>Best for:</strong> State-of-the-art accuracy on continuous business figures.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>LightGBM Regressor</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Fast histogram-based tree boosting optimized for speed and memory.<br />
                    <strong>Best for:</strong> Very large datasets with many rows.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>Support Vector Regressor (SVR)</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Fits predictions inside a narrow error tube, ignoring minor variations.<br />
                    <strong>Best for:</strong> Complex nonlinear numerical prediction on medium-sized datasets.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>K-Nearest Neighbors Regressor</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Finds the k most similar past examples and averages their numbers.<br />
                    <strong>Best for:</strong> Neighborhood estimation (e.g. estimating house price from 5 similar nearby homes).
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>Ridge Regressor</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Linear regression with an L2 penalty that prevents weight swings.<br />
                    <strong>Best for:</strong> Data where input features are correlated with each other.
                  </div>
                </div>

                <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                  <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>Lasso Regressor</div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                    <strong>How it works:</strong> Linear regression with an L1 penalty that zeroes out unhelpful features.<br />
                    <strong>Best for:</strong> Automatic feature selection when you have dozens of columns.
                  </div>
                </div>
              </div>
            )}
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION 6: SETTINGS & SLIDERS EXPLAINED ───────────────── */}
          <section id="hyperparameters" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentAmber, marginBottom: 8 }}>
              <Target className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Knobs &amp; Controls
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Settings &amp; Sliders: What Every Knob Does
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              These are the settings you adjust in the setup panel before clicking Run. Here is what happens when you turn each knob:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: TOKENS.primary }}>Number of Trees (n_estimators)</strong>
                  <span style={{ fontSize: 11, color: TOKENS.textMuted, fontFamily: 'monospace' }}>Default: 100</span>
                </div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                  <strong>What it does:</strong> Sets how many decision trees are built in models like Random Forest or XGBoost.<br />
                  <strong>If too low:</strong> Predictions might be noisy and unstable.<br />
                  <strong>If too high:</strong> Training takes longer with diminishing returns.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: TOKENS.primary }}>Tree Depth (max_depth)</strong>
                  <span style={{ fontSize: 11, color: TOKENS.textMuted, fontFamily: 'monospace' }}>Default: 4 - 6</span>
                </div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                  <strong>What it does:</strong> Limits how many levels of yes/no question branches each tree can develop.<br />
                  <strong>If too low:</strong> The tree is too simple and misses nuances (underfitting).<br />
                  <strong>If too high:</strong> The tree memorizes every tiny row and overfits to noise.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: TOKENS.primary }}>Learning Rate (Step Size)</strong>
                  <span style={{ fontSize: 11, color: TOKENS.textMuted, fontFamily: 'monospace' }}>Default: 0.05 - 0.1</span>
                </div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                  <strong>What it does:</strong> Sets how big of a step the model takes when learning from previous mistakes.<br />
                  <strong>Rule of thumb:</strong> A smaller learning rate (e.g. 0.05) with more trees almost always generalizes better.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: TOKENS.primary }}>Minimum Samples per Leaf &amp; Split</strong>
                  <span style={{ fontSize: 11, color: TOKENS.textMuted, fontFamily: 'monospace' }}>Default: 2 / 1</span>
                </div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                  <strong>What it does:</strong> Stops decision trees from creating rules that only apply to 1 or 2 isolated rows, helping to prevent memorization.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: TOKENS.primary }}>Regularization Knobs (C &amp; alpha)</strong>
                  <span style={{ fontSize: 11, color: TOKENS.textMuted, fontFamily: 'monospace' }}>Standard: 1.0</span>
                </div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 4 }}>
                  <strong>The Brake Pedal:</strong> Penalizes the model for becoming overly aggressive. Keeps weights balanced and stops single features from dominating.
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION 7: COMPARING EXPERIMENTS & MODELS ─────────────── */}
          <section id="experiments" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentViolet, marginBottom: 8 }}>
              <BarChart2 className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Comparing Models
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Comparing Experiments &amp; Finding Your Champion Model
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              Every time you train, your run is saved automatically so you can compare scores and pick the best one:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentViolet, marginBottom: 6 }}>
                  Side-by-Side Comparison Leaderboard
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary }}>
                  Compare up to 5 model runs side-by-side. See which hyperparameter settings (like tree depth or learning rate) resulted in higher accuracy scores.
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentViolet, marginBottom: 6 }}>
                  Interactive Confusion Matrix
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary }}>
                  A visual grid that shows you exactly where your model was right and where it made mistakes, so you know if it is prone to false alarms or missed cases.
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentViolet, marginBottom: 6 }}>
                  Feature Importance Ranking
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary }}>
                  Rank columns by how much they influenced predictions. Find out which features were the biggest drivers of customer churn or price.
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentViolet, marginBottom: 6 }}>
                  Promoting to Champion Model
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary }}>
                  Found your best run? Click <strong>Set as Champion</strong>. This marks it as your primary model for making live predictions and scoring batch CSVs.
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION 8: UNDERSTANDING MODEL SCORES ─────────────────── */}
          <section id="metrics" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.primary, marginBottom: 8 }}>
              <Activity className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Scorecard Guide
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Understanding Model Scores: How to Know if Your Model is Good
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              Don&apos;t just look at accuracy alone. Use these plain-English guides to understand what your scores mean:
            </p>

            {/* Classification Metrics Grid */}
            <h3 style={{ fontSize: 16, fontWeight: 700, color: TOKENS.primary, margin: '0 0 12px' }}>
              Classification Scores (When Predicting Categories)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 24 }}>
              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>Accuracy</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  Out of all rows, what percentage did the model predict correctly? Best when classes are roughly balanced.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>Precision (Avoiding False Alarms)</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  When the model says &quot;Yes&quot;, how often is it actually right? Critical when a false alarm is annoying or expensive (e.g. spam filter).
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentAmber, fontSize: 14 }}>Recall (Avoiding Missed Cases)</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  Out of all real positive cases, how many did the model find? Critical when missing a positive is disastrous (e.g. medical diagnosis).
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentViolet, fontSize: 14 }}>F1-Score (The Balanced Score)</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  The balanced average of Precision and Recall. The single most trusted overall score when classes are uneven.
                </div>
              </div>
            </div>

            {/* Regression Metrics Grid */}
            <h3 style={{ fontSize: 16, fontWeight: 700, color: TOKENS.accentEmerald, margin: '0 0 12px' }}>
              Regression Scores (When Predicting Numbers)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>MAE (Mean Absolute Error)</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  On average, by how much was the prediction off? Expressed directly in the original units (e.g. off by \$12 on average).
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>RMSE (Root Mean Squared Error)</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  Similar to MAE, but heavily penalizes occasional huge mistakes.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>R² Score (Variance Explained)</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  How much of the variation does the model explain? 1.0 = 100% perfect predictions; 0.0 = no better than guessing the average.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>MSE (Mean Squared Error)</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  The raw squared mathematical loss minimized during training.
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION 9: MAKING PREDICTIONS ─────────────────────────── */}
          <section id="predictions" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentAmber, marginBottom: 8 }}>
              <Rocket className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Using Your Model
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Making Predictions on New Data
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              Once you have a trained model, ML Playground gives you two simple ways to use it:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ padding: '18px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.primary, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Target className="w-4 h-4" />
                  <span>1. Single Test Predictions</span>
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary, lineHeight: 1.6 }}>
                  Type in values for a single customer or example (e.g. tenure = 12, contract = One year). Click Predict to instantly see what the model forecasts along with confidence percentages.
                </div>
              </div>

              <div style={{ padding: '18px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.accentEmerald, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>2. Batch CSV Predictions</span>
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary, lineHeight: 1.6 }}>
                  Drag and drop an entire unlabeled CSV file with hundreds or thousands of rows. The model calculates answers for all of them and generates a downloadable file with predictions attached.
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION 10: GLOSSARY ──────────────────────────────────── */}
          <section id="glossary" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.primary, marginBottom: 8 }}>
              <BookOpen className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Complete Reference
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px' }}>
              Machine Learning Glossary ({filteredGlossary.length} Terms)
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 18px' }}>
              Every single term, algorithm, setting, and metric in ML Playground explained in plain English:
            </p>

            {/* Category Filter Pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
              {['All', 'Foundations', 'Data & Preprocessing', 'Algorithms', 'Hyperparameters', 'Evaluation Metrics', 'Predictions & Workflow'].map((cat) => (
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

          {/* ── SECTION 11: KEYBOARD SHORTCUTS ────────────────────────── */}
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
              Useful shortcuts to speed up your workflow in the code editor:
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

          {/* ── SECTION 12: FAQS ──────────────────────────────────────── */}
          <section id="faqs" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentViolet, marginBottom: 8 }}>
              <HelpCircle className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Questions &amp; Answers
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

          {/* ── SECTION 13: COMMON MISTAKES TO AVOID ──────────────────── */}
          <section id="pitfalls" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentRose, marginBottom: 8 }}>
              <AlertTriangle className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Best Practices
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Common Machine Learning Mistakes to Avoid
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: '14px 18px', background: 'rgba(244, 63, 94, 0.08)', borderRadius: 8, border: '1px solid rgba(244, 63, 94, 0.25)' }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentRose, fontSize: 13.5 }}>1. Leaving Target Leakage in Your Data</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 3 }}>
                  If a column gives away the answer from the future (e.g. cancellation date when predicting churn), your model will show 99.9% test accuracy but fail completely in the real world. Always drop target leakage columns.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: 'rgba(244, 63, 94, 0.08)', borderRadius: 8, border: '1px solid rgba(244, 63, 94, 0.25)' }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentRose, fontSize: 13.5 }}>2. Relying Solely on Accuracy for Imbalanced Data</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 3 }}>
                  If only 1% of transactions are fraud, a dumb model that predicts &quot;Legitimate&quot; 100% of the time gets 99% accuracy while missing all fraud. Always check Precision, Recall, and F1-Score.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: 'rgba(244, 63, 94, 0.08)', borderRadius: 8, border: '1px solid rgba(244, 63, 94, 0.25)' }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentRose, fontSize: 13.5 }}>3. Forgetting to Scale Numbers for Distance Models</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 3 }}>
                  Models like KNN and SVM calculate physical distances between data points. If one feature is 100,000 (Salary) and another is 25 (Age), Salary will dominate the calculation unless you apply StandardScaler or MinMaxScaler.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: 'rgba(244, 63, 94, 0.08)', borderRadius: 8, border: '1px solid rgba(244, 63, 94, 0.25)' }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentRose, fontSize: 13.5 }}>4. Overfitting Deep Decision Trees</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 3 }}>
                  Letting decision trees grow with unlimited depth lets them memorize noisy individual rows. Keep <code>max_depth</code> between 4 and 8 to ensure the model learns general patterns.
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
              Ready to build and train your model?
            </h3>
            <p style={{ fontSize: 13, color: TOKENS.textMuted, margin: '0 0 20px' }}>
              Return to your workspace, upload a dataset, and start experimenting.
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
              <span>Open ML Playground Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
