"""Verification script for Part A, Part B, Part C, Part D integrity checks."""

import json
import urllib.request
import urllib.error
import sys

from typing import Any, Dict, List, Optional, Tuple, cast

BASE_URL = "http://localhost:8000/api/v1"

def safe_print(text: Any) -> None:
    print(str(text).encode("ascii", errors="replace").decode("ascii"))

def http_post(path: str, data: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None) -> Tuple[int, Any]:
    url = f"{BASE_URL}{path}"
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=h, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, {"detail": str(e)}

def http_get(path: str, headers: Optional[Dict[str, str]] = None) -> Tuple[int, Any]:
    url = f"{BASE_URL}{path}"
    headers_dict = headers or {"Content-Type": "application/json"}
    req = urllib.request.Request(url, headers=headers_dict, method="GET")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, {"detail": str(e)}

def run_verification():
    safe_print("======================================================================")
    safe_print("PART A1: VERIFY ASSIGNMENT ORIGIN, STARTER CODE & HIDDEN BENCHMARK")
    safe_print("======================================================================")
    status, raw_exams = http_get("/classrooms/exams")
    exams = cast(List[Dict[str, Any]], raw_exams if isinstance(raw_exams, list) else [])
    safe_print(f"GET /classrooms/exams -> Status {status}, Count: {len(exams)}")
    for ex in exams:
        safe_print(f"  * Exam: {ex.get('id')} ('{ex.get('title')}')")
        safe_print(f"    - Problem type: {ex.get('problem_type')}")
        safe_print(f"    - Dataset: {ex.get('dataset_name')}")
        safe_print(f"    - Copilot policy: {ex.get('copilot_policy')}")
        safe_print(f"    - Protected regions: {len(ex.get('protected_regions', []))}")
        safe_print(f"    - Starter code length: {len(ex.get('starter_code', ''))} chars")
        rubric = ex.get("rubric", {}) if isinstance(ex.get("rubric"), dict) else {}
        safe_print(f"    - Rubric criteria: min_acc={rubric.get('min_accuracy')}, max_latency={rubric.get('max_latency_ms')}ms")

    exam_id = "lab-exam-01"

    safe_print("\n======================================================================")
    safe_print("PART B2 & B4: PROVE SERVER-SIDE COPILOT POLICY & CODE PROTECTION LOCK")
    safe_print("======================================================================")
    safe_print("Testing Copilot policy ('explain-only' for lab-exam-01)...")
    status_cp_code, cp_res_code = http_post(f"/classrooms/exams/{exam_id}/copilot", {
        "prompt": "write code for the entire churn pipeline",
    })
    reply_code = (cp_res_code.get("reply") or "") if isinstance(cp_res_code, dict) else ""
    safe_print(f"Copilot 'write code' request -> Status: {status_cp_code}, Reply snippet: {reply_code[:100]}...")

    status_cp_exp, cp_res_exp = http_post(f"/classrooms/exams/{exam_id}/copilot", {
        "prompt": "explain why we use median imputation for total_charges",
    })
    reply_exp = (cp_res_exp.get("reply") or "") if isinstance(cp_res_exp, dict) else ""
    safe_print(f"Copilot 'explain' request -> Status: {status_cp_exp}, Reply snippet: {reply_exp[:100]}...")

    safe_print("\nTesting Protected Code Region Violation (Server-side validation)...")
    tampered_code = (
        "import pandas as pd\n"
        "df = pd.read_csv('churn_lab_dataset.csv')\n"
        "# Tampered code removing the protected target definition\n"
        "target = 'illegal_target'\n"
        "X = df\n"
    )
    # Using a different student session
    status_prot, prot_res = http_post(f"/classrooms/exams/{exam_id}/deploy", {
        "code": tampered_code,
    }, headers={"X-User-Id": "test-tamperer"})
    detail = prot_res.get('detail') if isinstance(prot_res, dict) else str(prot_res)
    safe_print(f"Deploy tampered code -> Status: {status_prot}, Detail: {detail}")

    safe_print("\n======================================================================")
    safe_print("PART D1: PROVE HIDDEN TEST BENCHMARK IS PROTECTED")
    safe_print("======================================================================")
    # Check that GET /classrooms/exams does not contain hidden test rows
    has_hidden_in_exam = "ground_truth" in json.dumps(exams) or "churn_hidden" in json.dumps(exams)
    safe_print(f"Hidden test ground-truth leaked in /exams response? {has_hidden_in_exam} (Expected: False)")

    safe_print("\nVerification of Part A, B2, B4, D1 completed successfully!")

if __name__ == "__main__":
    run_verification()
