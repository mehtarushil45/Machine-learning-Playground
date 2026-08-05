"""V6B Enterprise Model Monitoring & Continuous Learning.

Public surface:
  from app.ml.monitoring import monitoring_manager
  from app.ml.monitoring.monitoring_manager import (
      create_monitor, start_monitoring, pause_monitoring,
      resume_monitoring, stop_monitoring,
      run_drift_check, run_performance_check, run_system_check,
      run_full_check, get_monitor_summary, get_monitoring_history,
      list_monitors, resolve_alert, update_monitor_config,
  )
"""
from __future__ import annotations

from .monitoring_models import SCHEMA_VERSION

__all__ = ["SCHEMA_VERSION"]
