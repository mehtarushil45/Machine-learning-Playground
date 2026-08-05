from __future__ import annotations

import os
import json
import math
import uuid
import threading
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple

SCHEMA_VERSION = "6b.1.0"

_file_lock = threading.Lock()

def _atomic_append(filepath: str, lines: List[str]):
    with _file_lock:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        content = []
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.readlines()
        content.extend(lines)
        tmp_path = filepath + ".tmp"
        with open(tmp_path, 'w', encoding='utf-8') as f:
            f.writelines(content)
        os.replace(tmp_path, filepath)

def load_actuals(monitoring_id: str, limit: int = 1000) -> List[dict]:
    dir_path = os.path.join('uploads', 'monitoring', monitoring_id, 'actuals')
    if not os.path.exists(dir_path):
        return []
    
    files = [f for f in os.listdir(dir_path) if f.endswith('.jsonl')]
    files.sort(reverse=True)
    
    records = []
    for file in files:
        filepath = os.path.join(dir_path, file)
        with _file_lock:
            with open(filepath, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                for line in reversed(lines):
                    if not line.strip():
                        continue
                    records.append(json.loads(line))
                    if len(records) >= limit:
                        return records
    return records

def match_predictions_to_actuals(prediction_records: List[dict], actual_records: List[dict]) -> List[tuple]:
    actuals_map = {r['log_id_ref']: r for r in actual_records if 'log_id_ref' in r}
    matched = []
    for p in prediction_records:
        pid = p.get('prediction_id')
        if pid in actuals_map:
            matched.append((p, actuals_map[pid]))
    return matched

def compute_accuracy(y_pred: List, y_actual: List) -> float:
    if not y_pred or not y_actual or len(y_pred) != len(y_actual):
        return 0.0
    correct = sum(str(p) == str(a) for p, a in zip(y_pred, y_actual))
    return float(correct) / len(y_pred)

def compute_precision_recall_f1(y_pred: List, y_actual: List) -> dict:
    if not y_pred or not y_actual:
        return {"precision": 0.0, "recall": 0.0, "f1": 0.0}
    
    classes = set(str(y) for y in y_actual).union(set(str(y) for y in y_pred))
    precisions = []
    recalls = []
    f1s = []
    
    for c in classes:
        tp = sum((str(p) == c and str(a) == c) for p, a in zip(y_pred, y_actual))
        fp = sum((str(p) == c and str(a) != c) for p, a in zip(y_pred, y_actual))
        fn = sum((str(p) != c and str(a) == c) for p, a in zip(y_pred, y_actual))
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
        
        precisions.append(precision)
        recalls.append(recall)
        f1s.append(f1)
        
    num_classes = len(classes)
    return {
        "precision": sum(precisions) / num_classes if num_classes else 0.0,
        "recall": sum(recalls) / num_classes if num_classes else 0.0,
        "f1": sum(f1s) / num_classes if num_classes else 0.0
    }

def compute_roc_auc(y_scores: List[float], y_actual: List) -> Optional[float]:
    if not y_scores or not y_actual:
        return None
    
    binary_actual = [1 if str(a) == '1' else 0 for a in y_actual]
    if sum(binary_actual) == 0 or sum(binary_actual) == len(binary_actual):
        return None
        
    paired = sorted(zip(y_scores, binary_actual), key=lambda x: x[0], reverse=True)
    
    tp, fp, tp_prev, fp_prev, area = 0, 0, 0, 0, 0.0
    f_prev = float('-inf')
    num_pos = sum(binary_actual)
    num_neg = len(binary_actual) - num_pos
    
    for score, actual in paired:
        if score != f_prev:
            area += abs(fp - fp_prev) * (tp + tp_prev) / 2.0
            f_prev = score
            fp_prev = fp
            tp_prev = tp
        if actual == 1:
            tp += 1
        else:
            fp += 1
            
    area += abs(fp - fp_prev) * (tp + tp_prev) / 2.0
    return area / (num_pos * num_neg) if num_pos * num_neg > 0 else 0.0

def compute_rmse(y_pred: List[float], y_actual: List[float]) -> Optional[float]:
    if not y_pred or not y_actual or len(y_pred) != len(y_actual):
        return None
    try:
        mse = sum((float(p) - float(a)) ** 2 for p, a in zip(y_pred, y_actual)) / len(y_pred)
        return math.sqrt(mse)
    except (ValueError, TypeError):
        return None

def compute_mae(y_pred: List[float], y_actual: List[float]) -> Optional[float]:
    if not y_pred or not y_actual or len(y_pred) != len(y_actual):
        return None
    try:
        return sum(abs(float(p) - float(a)) for p, a in zip(y_pred, y_actual)) / len(y_pred)
    except (ValueError, TypeError):
        return None

def compute_performance_metrics(matched_pairs: List[tuple], metrics_config: List[str], task_type: str) -> dict:
    if not matched_pairs:
        return {}
        
    y_pred = [p.get('prediction') for p, a in matched_pairs]
    y_actual = [a.get('actual') for p, a in matched_pairs]
    y_scores = [p.get('confidence') for p, a in matched_pairs]
    
    metrics = {}
    
    try:
        metrics['prediction_mean'] = sum(float(p) for p in y_pred if p is not None) / len(y_pred)
    except (ValueError, TypeError):
        metrics['prediction_mean'] = None
        
    valid_scores = [s for s in y_scores if s is not None]
    metrics['confidence_mean'] = sum(float(s) for s in valid_scores) / len(valid_scores) if valid_scores else None
    
    if task_type == 'classification':
        if 'accuracy' in metrics_config:
            metrics['accuracy'] = compute_accuracy(y_pred, y_actual)
        pr_f1 = compute_precision_recall_f1(y_pred, y_actual)
        if 'precision' in metrics_config: metrics['precision'] = pr_f1['precision']
        if 'recall' in metrics_config: metrics['recall'] = pr_f1['recall']
        if 'f1' in metrics_config: metrics['f1'] = pr_f1['f1']
        if 'roc_auc' in metrics_config and valid_scores and len(valid_scores) == len(y_actual):
            metrics['roc_auc'] = compute_roc_auc(y_scores, y_actual)
            
    elif task_type == 'regression':
        if 'rmse' in metrics_config:
            metrics['rmse'] = compute_rmse(y_pred, y_actual)
        if 'mae' in metrics_config:
            metrics['mae'] = compute_mae(y_pred, y_actual)
            
    return metrics

def compare_vs_baseline(current_metrics: dict, baseline_metrics: dict, degradation_threshold: float) -> dict:
    result = {
        "degraded_metrics": [],
        "improvements": [],
        "deltas": {},
        "degradation_detected": False
    }
    
    for metric, current in current_metrics.items():
        if current is None or metric not in baseline_metrics:
            continue
        baseline = baseline_metrics[metric]
        if baseline is None:
            continue
            
        delta = current - baseline
        result["deltas"][metric] = delta
        
        if metric in ('rmse', 'mae'):
            if current > baseline + degradation_threshold:
                result["degraded_metrics"].append(metric)
                result["degradation_detected"] = True
            elif current < baseline - degradation_threshold:
                result["improvements"].append(metric)
        else:
            if current < baseline - degradation_threshold:
                result["degraded_metrics"].append(metric)
                result["degradation_detected"] = True
            elif current > baseline + degradation_threshold:
                result["improvements"].append(metric)
                
    return result

def run_performance_check(monitoring_id: str, model_id: str, prediction_records: List[dict], performance_baseline: dict, config: dict) -> dict:
    actuals = load_actuals(monitoring_id, limit=5000)
    matched = match_predictions_to_actuals(prediction_records, actuals)
    
    if len(matched) < 50:
        return {"insufficient_data": True, "matched_actuals_count": len(matched)}
        
    task_type = config.get('task_type', 'unknown')
    metrics_config = config.get('metrics', ['accuracy', 'f1', 'rmse', 'mae'])
    
    current_metrics = compute_performance_metrics(matched, metrics_config, task_type)
    
    degradation_threshold = config.get('degradation_threshold', 0.05)
    comparison = compare_vs_baseline(current_metrics, performance_baseline, degradation_threshold)
    
    severity = 'INFO'
    if 'accuracy' in comparison['deltas']:
        acc_delta = comparison['deltas']['accuracy']
        if acc_delta < -0.10:
            severity = 'CRITICAL'
        elif acc_delta < -0.05:
            severity = 'WARNING'
            
    return {
        "report_id": "pr-" + uuid.uuid4().hex[:8],
        "schema_version": "6b.1.0",
        "monitoring_id": monitoring_id,
        "model_id": model_id,
        "matched_actuals_count": len(matched),
        "metrics": current_metrics,
        "comparison": comparison,
        "severity": severity,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }

def submit_actuals(monitoring_id: str, actuals_list: List[dict]) -> dict:
    if not actuals_list:
        return {"submitted_count": 0, "date": ""}
        
    dt_now = datetime.now(timezone.utc)
    date_str = dt_now.strftime("%Y-%m-%d")
    filepath = os.path.join('uploads', 'monitoring', monitoring_id, 'actuals', f'{date_str}.jsonl')
    
    lines = []
    for record in actuals_list:
        record['monitoring_id'] = monitoring_id
        record['submitted_at'] = dt_now.isoformat()
        lines.append(json.dumps(record) + "\n")
        
    _atomic_append(filepath, lines)
    
    return {"submitted_count": len(lines), "date": date_str}
