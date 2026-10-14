import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { parsePipelineTargetAndConfig } from '../utils/codeParser';
import { fastCheckPythonCode } from '../utils/clientPythonLinter';
import { RegenerateDiffModal } from '../features/pipelines/RegenerateDiffModal';

describe('Code Studio — Diagnostics & Safe Regeneration', () => {
  describe('codeParser.ts — Non-blocking Synchronization Contract', () => {
    it('correctly parses target, algorithm, features, and reports isSynced: true for valid pipeline', () => {
      const validCode = `
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

target_column = 'churn'
feature_columns = ['age', 'tenure', 'balance']
model = RandomForestClassifier(n_estimators=100)
`;
      const res = parsePipelineTargetAndConfig(validCode);
      expect(res.isSynced).toBe(true);
      expect(res.target).toBe('churn');
      expect(res.algorithm).toBe('random_forest_classifier');
      expect(res.features).toEqual(['age', 'tenure', 'balance']);
      expect(res.parseError).toBeUndefined();
    });

    it('reports isSynced: false with descriptive parseError when custom modifications cannot map cleanly', () => {
      const divergedCode = `
# Custom multi-step neural network without standard target_column declaration
import torch
print("custom script")
`;
      const res = parsePipelineTargetAndConfig(divergedCode);
      expect(res.isSynced).toBe(false);
      expect(res.parseError).toContain('target column');
    });
  });

  describe('RegenerateDiffModal Component', () => {
    it('renders side-by-side review modal with diff and filenames when open', () => {
      const onAccept = vi.fn();
      const onReject = vi.fn();

      render(
        <RegenerateDiffModal
          isOpen={true}
          filename="pipeline_generated.py"
          currentCode="import pandas as pd\n# Manual user modifications"
          regeneratedCode="import pandas as pd\n# Regenerated fresh pipeline"
          onAccept={onAccept}
          onReject={onReject}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Review Pipeline Code Diff/i)).toBeInTheDocument();
      expect(screen.getAllByText(/pipeline_generated.py/i).length).toBeGreaterThanOrEqual(1);

      // Trigger accept
      const acceptBtn = screen.getByRole('button', { name: /Accept & Replace Code/i });
      fireEvent.click(acceptBtn);
      expect(onAccept).toHaveBeenCalledTimes(1);

      // Trigger reject
      const rejectBtn = screen.getByRole('button', { name: /Reject \(Keep My Edits\)/i });
      fireEvent.click(rejectBtn);
      expect(onReject).toHaveBeenCalledTimes(1);
    });

    it('does not render when isOpen is false', () => {
      const { container } = render(
        <RegenerateDiffModal
          isOpen={false}
          filename="pipeline_generated.py"
          currentCode="test"
          regeneratedCode="test"
          onAccept={vi.fn()}
          onReject={vi.fn()}
        />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Mutation Matrix Verification (AST & Pyflakes Diagnostics)', () => {
    it('demonstrates that random trailing words are caught as syntax errors or undefined names', () => {
      // In Phase 0 regex analyzer, typing 'hello world' below valid code reported 0 errors.
      // Under truthful Python AST & Pyflakes diagnostics:
      const sampleWithRandomWords = `import pandas as pd\nimport numpy as np\nhello world`;
      const diags = fastCheckPythonCode(sampleWithRandomWords);
      expect(diags.length).toBeGreaterThan(0);
      expect(diags[0].message).toContain("invalid syntax 'world'");
      expect(diags[0].line).toBe(3);

      // Undefined single variable name typed at bottom
      const sampleWithBareK = `import pandas as pd\ntarget = 'churn'\nk`;
      const kDiags = fastCheckPythonCode(sampleWithBareK);
      expect(kDiags.length).toBeGreaterThan(0);
      expect(kDiags[0].message).toContain("undefined name 'k'");
      expect(kDiags[0].code).toBe('F821');
    });
  });
});
