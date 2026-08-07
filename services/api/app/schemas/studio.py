"""Studio Schemas — View-as-Code DSL Studio (V7B Part 2)"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ── DSL Definition ─────────────────────────────────────────────────────────────

class DSLNode(BaseModel):
    node_id: str
    node_type: str  # dataset | preprocess | train | evaluate | deploy | monitor
    label: str
    config: Dict[str, Any] = Field(default_factory=dict)


class DSLEdge(BaseModel):
    source: str
    target: str
    label: Optional[str] = None


class DSLDocument(BaseModel):
    """Unified View-as-Code DSL document."""
    dsl_type: str  # dataset | pipeline | experiment | deployment | monitoring | workspace
    dsl_id: str
    name: str
    version: str = "1.0"
    description: Optional[str] = None
    nodes: List[DSLNode] = Field(default_factory=list)
    edges: List[DSLEdge] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


# ── Version History ────────────────────────────────────────────────────────────

class DSLVersionEntry(BaseModel):
    version_id: str
    dsl_id: str
    dsl_type: str
    version: str
    snapshot: Dict[str, Any]
    created_at: datetime
    message: Optional[str] = None


class DSLDiff(BaseModel):
    dsl_id: str
    from_version: str
    to_version: str
    added_nodes: List[str] = Field(default_factory=list)
    removed_nodes: List[str] = Field(default_factory=list)
    modified_nodes: List[str] = Field(default_factory=list)
    added_edges: List[str] = Field(default_factory=list)
    removed_edges: List[str] = Field(default_factory=list)
    summary: str


# ── Export / Import ────────────────────────────────────────────────────────────

class DSLExportRequest(BaseModel):
    dsl_id: str
    format: str = Field("yaml", description="yaml | json")
    include_version_history: bool = False


class DSLImportRequest(BaseModel):
    content: str  # YAML or JSON string
    format: str = Field("yaml", description="yaml | json")
    overwrite: bool = False


class DSLValidationResult(BaseModel):
    is_valid: bool
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


# ── Template ───────────────────────────────────────────────────────────────────

class DSLTemplate(BaseModel):
    template_id: str
    name: str
    description: str
    dsl_type: str
    tags: List[str] = Field(default_factory=list)
    document: DSLDocument
