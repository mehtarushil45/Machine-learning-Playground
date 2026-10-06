import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MonacoCodeStudioEditor, type CodeDiagnostic } from '../features/pipelines/MonacoCodeStudioEditor';
import { CodeExecutionService } from '../services/api';

describe('Milestone 5: Monaco Code Studio & Distributed Compute', () => {
  it('renders MonacoCodeStudioEditor container and editor surface', () => {
    const onChange = vi.fn();
    const sampleCode = `import pandas as pd
print('hello world')`;
    render(
      <MonacoCodeStudioEditor
        code={sampleCode}
        filename="train.py"
        onChange={onChange}
      />,
    );

    expect(screen.getByTestId('monaco-code-studio-container')).toBeInTheDocument();
    const editor = screen.getByTestId('monaco-code-editor');
    expect(editor).toBeInTheDocument();
    expect(editor).toHaveValue(sampleCode);
  });

  it('invokes onChange when editor content is modified', () => {
    const onChange = vi.fn();
    render(
      <MonacoCodeStudioEditor
        code="x = 10"
        filename="train.py"
        onChange={onChange}
      />,
    );

    const editor = screen.getByTestId('monaco-code-editor');
    fireEvent.change(editor, { target: { value: 'x = 20\nprint(x)' } });
    expect(onChange).toHaveBeenCalledWith('x = 20\nprint(x)');
  });

  it('triggers onRunCode on Ctrl+Enter keyboard shortcut', () => {
    const onRunCode = vi.fn();
    render(
      <MonacoCodeStudioEditor
        code="import sklearn"
        filename="train.py"
        onChange={vi.fn()}
        onRunCode={onRunCode}
      />,
    );

    const editor = screen.getByTestId('monaco-code-editor');
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true });
    expect(onRunCode).toHaveBeenCalledTimes(1);
  });

  it('triggers onSave on Ctrl+S keyboard shortcut', () => {
    const onSave = vi.fn();
    render(
      <MonacoCodeStudioEditor
        code="import numpy as np"
        filename="train.py"
        onChange={vi.fn()}
        onSave={onSave}
      />,
    );

    const editor = screen.getByTestId('monaco-code-editor');
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('triggers onToggleTerminal on Ctrl+` keyboard shortcut', () => {
    const onToggleTerminal = vi.fn();
    render(
      <MonacoCodeStudioEditor
        code="print(123)"
        filename="train.py"
        onChange={vi.fn()}
        onToggleTerminal={onToggleTerminal}
      />,
    );

    const editor = screen.getByTestId('monaco-code-editor');
    fireEvent.keyDown(editor, { key: '`', ctrlKey: true });
    expect(onToggleTerminal).toHaveBeenCalledTimes(1);
  });

  it('accepts diagnostics without throwing', () => {
    const diags: CodeDiagnostic[] = [
      { line: 1, col: 1, severity: 'error', message: 'SyntaxError: invalid syntax' },
      { line: 3, col: 5, severity: 'warning', message: 'Unused import: os' },
    ];
    render(
      <MonacoCodeStudioEditor
        code="invalid code here"
        filename="train.py"
        diagnostics={diags}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('monaco-code-editor')).toBeInTheDocument();
  });

  it('generates proper WebSocket and SSE stream URLs in CodeExecutionService', () => {
    const execId = 'test-exec-12345';
    const sseUrl = CodeExecutionService.streamUrl(execId);
    expect(sseUrl).toBe('/api/v1/code-execution/test-exec-12345/stream');

    const wsUrl = CodeExecutionService.wsStreamUrl(execId);
    expect(wsUrl).toContain('/api/v1/code-execution/test-exec-12345/ws');
  });
});
