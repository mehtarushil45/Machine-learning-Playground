"""Python Code Linter Service -- ML Playground Code Studio.

Provides deep, real-time syntax and semantic analysis using Python's native
`ast` parser and `pyflakes` analysis engine, complemented by PEP 8 compliance checks.

Returns structured diagnostics with:
  - line (1-indexed)
  - col (1-indexed)
  - end_line / end_col
  - severity ("error" | "warning" | "info")
  - message
  - source ("syntax" | "pyflakes" | "pep8")
  - code (e.g. "E999", "F821", "F401")
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class DiagnosticItem:
    line: int
    col: int
    severity: str  # "error" | "warning" | "info"
    message: str
    source: str    # "syntax" | "pyflakes" | "pep8"
    end_line: Optional[int] = None
    end_col: Optional[int] = None
    code: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "line": self.line,
            "col": self.col,
            "end_line": self.end_line or self.line,
            "end_col": self.end_col or (self.col + 1),
            "severity": self.severity,
            "message": self.message,
            "source": self.source,
            "code": self.code,
        }


class _PyflakesCollector:
    """Collects messages emitted by pyflakes.api.check."""

    def __init__(self) -> None:
        self.diagnostics: List[DiagnosticItem] = []

    def unexpectedError(self, filename: str, msg: str) -> None:
        self.diagnostics.append(
            DiagnosticItem(
                line=1,
                col=1,
                severity="error",
                message=f"Linter error: {msg}",
                source="pyflakes",
                code="E999",
            )
        )

    def syntaxError(
        self,
        filename: str,
        msg: str,
        lineno: int,
        offset: Optional[int],
        text: Optional[str],
    ) -> None:
        self.diagnostics.append(
            DiagnosticItem(
                line=lineno or 1,
                col=offset or 1,
                severity="error",
                message=f"SyntaxError: {msg}",
                source="syntax",
                code="E999",
            )
        )

    def flake(self, message: object) -> None:
        mtype = type(message).__name__
        lineno = getattr(message, "lineno", 1)
        col = getattr(message, "col", 0) + 1  # 1-indexed

        # Categorize severity based on message type
        # Undefined names, undefined local, invalid syntax are critical errors
        if any(term in mtype for term in ("Undefined", "Syntax", "DuplicateArgument", "ReturnWithArgs")):
            severity = "error"
        elif "Unused" in mtype or "Redefined" in mtype or "ImportStar" in mtype:
            severity = "warning"
        else:
            severity = "info"

        # Code mapping
        code_map = {
            "UndefinedName": "F821",
            "UndefinedExport": "F822",
            "UndefinedLocal": "F823",
            "DuplicateArgument": "F831",
            "UnusedImport": "F401",
            "UnusedVariable": "F841",
            "RedefinedWhileUnused": "F811",
            "ImportStarUsed": "F403",
            "ImportShadowedByLoopVar": "F402",
        }
        code_id = code_map.get(mtype, mtype)

        raw_str = str(message)
        # Clean up pyflakes prefix like "filename:1:2: ..."
        clean_msg = raw_str.split(":", 3)[-1].strip() if ":" in raw_str else raw_str

        self.diagnostics.append(
            DiagnosticItem(
                line=lineno,
                col=col,
                severity=severity,
                message=clean_msg,
                source="pyflakes",
                code=code_id,
            )
        )


def _check_pep8_and_patterns(code: str) -> List[DiagnosticItem]:
    """Fast line-by-line checks for standard PEP 8 and ML conventions."""
    results: List[DiagnosticItem] = []
    lines = code.split("\n")

    for idx, raw_line in enumerate(lines):
        line_num = idx + 1
        trimmed = raw_line.strip()
        if not trimmed or trimmed.startswith("#"):
            continue

        # E501: Line length > 120
        if len(raw_line) > 120:
            results.append(
                DiagnosticItem(
                    line=line_num,
                    col=121,
                    severity="warning",
                    message=f"Line too long ({len(raw_line)} > 120 characters) -- E501",
                    source="pep8",
                    code="E501",
                )
            )

        # E101: Mixed tabs and spaces
        leading_ws = re.match(r"^(\s+)", raw_line)
        if leading_ws and "\t" in leading_ws.group(1) and " " in leading_ws.group(1):
            results.append(
                DiagnosticItem(
                    line=line_num,
                    col=1,
                    severity="error",
                    message="Mixed tabs and spaces in indentation -- E101",
                    source="pep8",
                    code="E101",
                )
            )

        # E722: Bare except
        if re.match(r"^except\s*:", trimmed):
            results.append(
                DiagnosticItem(
                    line=line_num,
                    col=1,
                    severity="warning",
                    message="Bare except clause catches all exceptions including SystemExit -- E722",
                    source="pep8",
                    code="E722",
                )
            )

        # E711: Comparison to None using ==
        if re.search(r"==\s*None\b|None\s*==", trimmed):
            results.append(
                DiagnosticItem(
                    line=line_num,
                    col=raw_line.find("None") + 1 if "None" in raw_line else 1,
                    severity="warning",
                    message="Comparison to None should be 'if cond is None:' -- E711",
                    source="pep8",
                    code="E711",
                )
            )

        # E712: Comparison to True/False
        if re.search(r"==\s*(True|False)\b", trimmed):
            results.append(
                DiagnosticItem(
                    line=line_num,
                    col=1,
                    severity="info",
                    message="Comparison to True/False should use truthiness ('if cond:' or 'if not cond:') -- E712",
                    source="pep8",
                    code="E712",
                )
            )

        # Python 2 print statement without parens
        if re.search(r"\bprint\s+[\"\'a-zA-Z_\[\(]", trimmed) and not re.search(r"\bprint\s*\(", trimmed):
            results.append(
                DiagnosticItem(
                    line=line_num,
                    col=raw_line.find("print") + 1,
                    severity="warning",
                    message="Python 2 style print statement -- use print(...) -- E999",
                    source="pep8",
                    code="E999",
                )
            )

    return results


def lint_code(code: str, filename: str = "train.py") -> List[DiagnosticItem]:
    """Run comprehensive syntax and semantic analysis on the provided Python code buffer.

    - Empty buffer -> returns [] (valid).
    - Syntax error -> returns exact line/col error from ast.parse.
    - Semantic checks -> pyflakes analysis for undefined variables, unused imports, etc.
    - Style checks -> PEP 8 line length, bare except, None comparison.
    """
    if not code or not code.strip():
        return []

    diagnostics: List[DiagnosticItem] = []

    # 1. AST Syntax Check
    syntax_error = False
    try:
        ast.parse(code, filename=filename)
    except SyntaxError as exc:
        syntax_error = True
        line = exc.lineno or 1
        col = exc.offset or 1
        end_line = getattr(exc, "end_lineno", line) or line
        end_col = getattr(exc, "end_offset", col + 1) or (col + 1)
        msg = exc.msg or "Syntax error"
        diagnostics.append(
            DiagnosticItem(
                line=line,
                col=col,
                end_line=end_line,
                end_col=end_col,
                severity="error",
                message=f"SyntaxError: {msg}",
                source="syntax",
                code="E999",
            )
        )

    # 2. Pyflakes Semantic Analysis (run if no syntax error or via pyflakes reporter)
    if not syntax_error:
        try:
            import importlib
            pyflakes_api = importlib.import_module("pyflakes.api")
            collector = _PyflakesCollector()
            pyflakes_api.check(code, filename, collector)
            diagnostics.extend(collector.diagnostics)
        except Exception:
            pass

    # 3. PEP 8 & ML Pattern checks
    diagnostics.extend(_check_pep8_and_patterns(code))

    # 4. Deduplicate by line and message
    seen = set()
    deduped: List[DiagnosticItem] = []
    for d in diagnostics:
        key = (d.line, d.message)
        if key not in seen:
            seen.add(key)
            deduped.append(d)

    # 5. Sort by severity (error -> warning -> info) then line, then col
    severity_order = {"error": 0, "warning": 1, "info": 2}
    deduped.sort(key=lambda d: (severity_order.get(d.severity, 3), d.line, d.col))

    return deduped
