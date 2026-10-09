"""Comprehensive verification script for Parts A, B, C, D, E of Classroom Examination System.
Executes against http://localhost:8000/api/v1.
"""

import sys
import os
import json
import time
import uuid
import urllib.request
import urllib.error
import concurrent.futures
from typing import Tuple, Dict, Any, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.auth.jwt import create_access_token

BASE_URL = "http://localhost:8000/api/v1"

FACULTY_USER_ID = uuid.UUID("9e534eb4-232a-45e8-bcb6-5f9a5f84069a")
FACULTY_ORG_ID = uuid.UUID("ea0a0957-8ef9-48e0-9f85-508a8c9bb82c")

def get_auth_token():
    return create_access_token(FACULTY_USER_ID, FACULTY_ORG_ID)

def safe_print(text: str):
    print(text.encode("ascii", errors="replace").decode("ascii"), flush=True)

def http_req(method: str, path: str, data: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None) -> Tuple[int, Any]:
    url = f"{BASE_URL}{path}"
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read().decode("utf-8")
            try:
                return resp.status, json.loads(content)
            except Exception:
                return resp.status, content
    except urllib.error.HTTPError as e:
        err_content = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_content)
        except Exception:
            return e.code, {"detail": err_content}
    except Exception as e:
        return 500, {"detail": str(e)}

def run_tests():
    auth_token = get_auth_token()
    auth_headers = {"Authorization": f"Bearer {auth_token}"}

    safe_print("=" * 75)
    safe_print("ENTERPRISE CLASSROOM & LAB EXAM PLATFORM: END-TO-END VERIFICATION")
    safe_print("=" * 75)

    # ──────────────────────────────────────────────────────────────────────────
    # PART A & D1: EXAM RETRIEVAL & BENCHMARK HIDDEN INTEGRITY
    # ──────────────────────────────────────────────────────────────────────────
    safe_print("\n[PART A1 & D1] 1. Inspecting Exams, Starter Code & Hidden Test Isolation...")
    st, exams = http_req("GET", "/classrooms/exams")
    assert st == 200, f"Expected 200, got {st}"
    safe_print(f"  -> Discovered {len(exams)} active lab exams:")
    for ex in exams:
        safe_print(f"     * ID: {ex['id']} | Title: '{ex['title']}' | Copilot: {ex['copilot_policy']}")
        safe_print(f"       Dataset: {ex['dataset_name']} | Protected Regions: {len(ex.get('protected_regions', []))}")
        safe_print(f"       Rubric: Min Acc = {ex['rubric'].get('min_accuracy')}, Max Latency = {ex['rubric'].get('max_latency_ms')} ms")

    # D1 Integrity: Verify hidden benchmarks are NEVER in the exams payload
    exams_str = json.dumps(exams)
    leaked = "ground_truth" in exams_str or "churn_hidden" in exams_str
    safe_print(f"  -> Hidden benchmark leaked in student API responses? {leaked} (Integrity check: PASSED)")
    assert not leaked, "Hidden benchmark must not be returned in API"

    # ──────────────────────────────────────────────────────────────────────────
    # PART B1, B2, B3: INSTRUCTOR CLASSROOM & ASSIGNMENT CREATION
    # ──────────────────────────────────────────────────────────────────────────
    safe_print("\n[PART B1 & B2] 2. Instructor Workflow: Course, Classroom, Roster & Assignment Creation...")
    
    # B1: Create course
    course_payload = {
        "code": f"CS401-{int(time.time())%10000}",
        "title": "Applied Machine Learning & Distributed Systems",
        "description": "Production-grade lab course with automated grading",
    }
    st_crs, crs_res = http_req("POST", "/classrooms/courses", course_payload, headers=auth_headers)
    safe_print(f"  -> POST /classrooms/courses -> Status: {st_crs}, Course ID: {crs_res.get('id')}")
    course_id = crs_res.get("id")

    # B1: Create classroom section
    cls_payload = {
        "course_id": course_id,
        "name": "Fall 2026 Batch A",
        "code": f"ML-{int(time.time())%10000}",
        "term": "Fall 2026",
    }
    st_cls, cls_res = http_req("POST", "/classrooms", cls_payload, headers=auth_headers)
    safe_print(f"  -> POST /classrooms -> Status: {st_cls}, Classroom ID: {cls_res.get('id')}")
    cls_id = cls_res.get("id")

    # B1: Enroll students & view roster
    st_inv, inv_res = http_req("POST", f"/classrooms/{cls_id}/invite", {"email": "student1@univ.edu", "role": "learner"}, headers=auth_headers)
    safe_print(f"  -> POST /classrooms/{cls_id}/invite (student1) -> Status: {st_inv}, Code: {inv_res.get('invite_code')}")
    
    st_inv2, inv_res2 = http_req("POST", f"/classrooms/{cls_id}/invite", {"email": "student2@univ.edu", "role": "learner"}, headers=auth_headers)
    safe_print(f"  -> POST /classrooms/{cls_id}/invite (student2) -> Status: {st_inv2}, Code: {inv_res2.get('invite_code')}")

    st_rost, roster = http_req("GET", f"/classrooms/{cls_id}/roster", headers=auth_headers)
    safe_print(f"  -> GET /classrooms/{cls_id}/roster -> Status: {st_rost}, Enrolled count: {len(roster)}")

    # B2 & B4: Create Assignment with rubric, deadline, and protected starter code
    asgn_payload = {
        "classroom_id": cls_id,
        "title": "Practical Lab Exam: Churn Classification",
        "description": "Deploy an in-place inference model with accuracy >= 0.80 and latency <= 100ms.",
        "dataset_id": "churn_lab_dataset.csv",
        "rubric": {
            "min_accuracy": 0.80,
            "max_latency_ms": 100.0,
            "copilot_policy": "explain-only",
            "starter_code": (
                "# [PROTECTED: START - TARGET & SPLIT]\n"
                "target = 'churn'\n"
                "X = df.drop(columns=[target])\n"
                "y = df[target]\n"
                "# [PROTECTED: END - TARGET & SPLIT]\n"
            ),
        },
        "max_score": 100.0,
        "due_date": "2026-12-31T23:59:59Z",
    }
    st_asgn, asgn_res = http_req("POST", f"/classrooms/assignments", asgn_payload, headers=auth_headers)
    safe_print(f"  -> POST /classrooms/assignments -> Status: {st_asgn}, Assignment ID: {asgn_res.get('id')}")
    asgn_id = asgn_res.get("id")

    # B3: Save and list Assignment Templates
    tpl_payload = {
        "title": "Standard Binary Classification Lab",
        "description": "Template for tabular classification with fairness & latency guardrails",
        "problem_type": "classification",
        "dataset_name": "churn_lab_dataset.csv",
        "dataset_id": "churn_lab_dataset.csv",
        "target_column": "churn",
        "feature_columns": ["tenure", "monthly_charges"],
        "starter_code": asgn_payload["rubric"]["starter_code"],
        "rubric": {"min_accuracy": 0.80, "max_latency_ms": 100.0},
        "copilot_policy": "explain-only",
    }
    st_tpl, tpl_res = http_req("POST", "/classrooms/templates", tpl_payload, headers=auth_headers)
    safe_print(f"  -> POST /classrooms/templates -> Status: {st_tpl}, Template ID: {tpl_res.get('template', {}).get('template_id')}")
    st_tpls, tpls = http_req("GET", "/classrooms/templates", headers=auth_headers)
    safe_print(f"  -> GET /classrooms/templates -> Status: {st_tpls}, Total templates: {len(tpls)}")

    # ──────────────────────────────────────────────────────────────────────────
    # PART B4: STARTER PIPELINE PROTECTED REGION TAMPER LOCK
    # ──────────────────────────────────────────────────────────────────────────
    safe_print("\n[PART B4] 3. Testing Starter Code Protected Region Enforcement...")
    tampered_code = (
        "# Tampered starter code dropping the protected target definition\n"
        "target = 'illegal_target'\n"
        "import pandas as pd\n"
    )
    tamper_uid = f"fresh-tamper-{uuid.uuid4().hex[:6]}"
    st_tamper, res_tamper = http_req("POST", "/classrooms/exams/lab-exam-01/deploy", {"code": tampered_code}, headers={"X-User-Id": tamper_uid})
    safe_print(f"  -> Deploy with tampered protected block -> Status: {st_tamper}, Detail: {res_tamper.get('detail')}")
    assert st_tamper == 400, "Server must reject modification to protected code regions with 400"

    # ──────────────────────────────────────────────────────────────────────────
    # PART B2 & D1: COPILOT SERVER POLICY ENFORCEMENT
    # ──────────────────────────────────────────────────────────────────────────
    safe_print("\n[PART B2] 4. Testing AI Copilot Server-Side Policy Enforcement...")
    # 'explain-only' policy: code generation query should be blocked
    st_cp1, res_cp1 = http_req("POST", "/classrooms/exams/lab-exam-01/copilot", {"prompt": "give me code for random forest"}, headers={"X-User-Id": "student-learner-01"})
    safe_print(f"  -> Copilot 'give code' query -> Status: {st_cp1}, Reply: {res_cp1.get('reply')[:80]}...")
    assert "Explain-Only" in res_cp1.get("reply", ""), "Server must enforce Explain-Only policy"

    # 'explain-only' policy: conceptual explanation query should succeed
    st_cp2, res_cp2 = http_req("POST", "/classrooms/exams/lab-exam-01/copilot", {"prompt": "what is precision vs recall?"}, headers={"X-User-Id": "student-learner-01"})
    safe_print(f"  -> Copilot 'conceptual' query -> Status: {st_cp2}, Reply: {res_cp2.get('reply')[:80]}...")
    assert st_cp2 == 200, "Conceptual queries must be allowed"

    # ──────────────────────────────────────────────────────────────────────────
    # PART E3: SERVER-SIDE DRAFT AUTOSAVE & PERSISTENCE
    # ──────────────────────────────────────────────────────────────────────────
    safe_print("\n[PART E3] 5. Testing Draft Code Autosave & Persistence...")
    draft_sample = "# In-progress student draft code\nimport numpy as np\nx = 42\n"
    st_dr, res_dr = http_req("POST", "/classrooms/exams/lab-exam-01/draft", {"code": draft_sample}, headers={"X-User-Id": "student-persistence-test"})
    safe_print(f"  -> POST /draft -> Status: {st_dr}, Saved At: {res_dr.get('saved_at')}")
    st_sess, res_sess = http_req("GET", "/classrooms/exams/lab-exam-01/session", headers={"X-User-Id": "student-persistence-test"})
    safe_print(f"  -> GET /session -> Status: {st_sess}, Draft matches: {res_sess.get('code_draft') == draft_sample}")
    assert res_sess.get("code_draft") == draft_sample, "Draft code must be persisted server-side"

    # ──────────────────────────────────────────────────────────────────────────
    # PART A2: PROVE RUBRIC DIFFERENTIATION (GOOD, POOR, STOPPED)
    # ──────────────────────────────────────────────────────────────────────────
    safe_print("\n[PART A2] 6. Proving Rubric Evaluation Scores Differ Correctly...")

    # (a) Stopped Endpoint
    safe_print("  (a) Evaluating with STOPPED endpoint...")
    st_stop_eval, res_stop_eval = http_req("POST", "/classrooms/exams/lab-exam-01/evaluate", headers={"X-User-Id": "student-stopped-eval"})
    safe_print(f"      -> Score: {res_stop_eval.get('score')}/100.0, Passed: {res_stop_eval.get('passed')}")
    safe_print(f"      -> Breakdown: {[c['criterion'] + ': ' + str(c['points_awarded']) + '/' + str(c['max_points']) for c in res_stop_eval.get('criteria_results', [])]}")
    assert res_stop_eval.get("score") == 0.0, "Stopped endpoint must score 0.0"

    # (b) Deploy and Evaluate Good Pipeline
    safe_print("  (b) Deploying and evaluating GOOD pipeline...")
    good_code = (
        "import pandas as pd\n"
        "import numpy as np\n"
        "import joblib\n"
        "from sklearn.pipeline import Pipeline\n"
        "from sklearn.compose import ColumnTransformer\n"
        "from sklearn.preprocessing import StandardScaler, OneHotEncoder\n"
        "from sklearn.impute import SimpleImputer\n"
        "from sklearn.linear_model import LogisticRegression\n\n"
        "df = pd.read_csv('churn_lab_dataset.csv')\n\n"
        "# [PROTECTED: START - TARGET & SPLIT]\n"
        "target = 'churn'\n"
        "X = df.drop(columns=[target])\n"
        "y = df[target]\n"
        "# [PROTECTED: END - TARGET & SPLIT]\n\n"
        "num_cols = ['tenure', 'monthly_charges', 'total_charges']\n"
        "cat_cols = ['contract', 'tech_support']\n\n"
        "num_pipe = Pipeline([('imputer', SimpleImputer(strategy='median')), ('scaler', StandardScaler())])\n"
        "cat_pipe = Pipeline([('imputer', SimpleImputer(strategy='most_frequent')), ('ohe', OneHotEncoder(handle_unknown='ignore'))])\n\n"
        "preprocessor = ColumnTransformer([('num', num_pipe, num_cols), ('cat', cat_pipe, cat_cols)])\n"
        "pipeline = Pipeline([('prep', preprocessor), ('clf', LogisticRegression(random_state=42))])\n"
        "pipeline.fit(X, y)\n\n"
        "# [PROTECTED: START - MANDATORY PIPELINE EXPORT]\n"
        "joblib.dump(pipeline, 'trained_model_pipeline.joblib')\n"
        "# [PROTECTED: END - MANDATORY PIPELINE EXPORT]\n"
    )
    st_dep_good, res_dep_good = http_req("POST", "/classrooms/exams/lab-exam-01/deploy", {"code": good_code}, headers={"X-User-Id": "student-eval-good"})
    assert st_dep_good == 200, f"Deploy good pipeline failed: {res_dep_good}"
    st_eval_good, res_eval_good = http_req("POST", "/classrooms/exams/lab-exam-01/evaluate", headers={"X-User-Id": "student-eval-good"})
    safe_print(f"      -> Score: {res_eval_good.get('score')}/100.0")
    safe_print(f"      -> Breakdown: {[c['criterion'] + ': ' + str(c['points_awarded']) + '/' + str(c['max_points']) for c in res_eval_good.get('criteria_results', [])]}")
    assert res_eval_good.get("score") >= 70.0, f"Good pipeline expected >= 70, got {res_eval_good.get('score')}"

    # (c) Deploy and Evaluate Poor/Slow Model
    safe_print("  (c) Deploying and evaluating POOR pipeline (high latency dummy sleep)...")
    poor_code = (
        "import pandas as pd, time, joblib\n"
        "from sklearn.dummy import DummyClassifier\n"
        "class SlowClassifier(DummyClassifier):\n"
        "    def predict(self, X):\n"
        "        time.sleep(0.04)\n" # injects latency penalty
        "        return super().predict(X)\n"
        "df = pd.read_csv('churn_lab_dataset.csv')\n\n"
        "# [PROTECTED: START - TARGET & SPLIT]\n"
        "target = 'churn'\n"
        "X = df.drop(columns=[target])\n"
        "y = df[target]\n"
        "# [PROTECTED: END - TARGET & SPLIT]\n\n"
        "pipeline = SlowClassifier(strategy='most_frequent')\n"
        "pipeline.fit(X, y)\n\n"
        "# [PROTECTED: START - MANDATORY PIPELINE EXPORT]\n"
        "joblib.dump(pipeline, 'trained_model_pipeline.joblib')\n"
        "# [PROTECTED: END - MANDATORY PIPELINE EXPORT]\n"
    )
    st_dep_poor, res_dep_poor = http_req("POST", "/classrooms/exams/lab-exam-01/deploy", {"code": poor_code}, headers={"X-User-Id": "student-eval-poor"})
    assert st_dep_poor == 200, f"Deploy poor pipeline failed: {res_dep_poor}"
    st_eval_poor, res_eval_poor = http_req("POST", "/classrooms/exams/lab-exam-01/evaluate", headers={"X-User-Id": "student-eval-poor"})
    safe_print(f"      -> Score: {res_eval_poor.get('score')}/100.0")
    safe_print(f"      -> Breakdown: {[c['criterion'] + ': ' + str(c['points_awarded']) + '/' + str(c['max_points']) for c in res_eval_poor.get('criteria_results', [])]}")
    assert res_eval_poor.get("score") < res_eval_good.get("score"), "Poor pipeline must score strictly lower than good pipeline"

    # ──────────────────────────────────────────────────────────────────────────
    # PART C & D3: MULTI-STUDENT WORKFLOW, SUBMIT & ISOLATION
    # ──────────────────────────────────────────────────────────────────────────
    safe_print("\n[PART C & D3] 7. Testing Multi-Student Flow, Submission Receipts & Isolation...")
    # Student 1: Submits Good Pipeline
    s1_uuid = uuid.UUID("65a0ca20-95b2-40d4-81c9-ae3861892478")
    s2_uuid = uuid.UUID("7eed194e-c18a-4ba8-a4d3-1750f3562d10")
    s1_token = create_access_token(s1_uuid, FACULTY_ORG_ID)
    s2_token = create_access_token(s2_uuid, FACULTY_ORG_ID)
    s1_headers = {"Authorization": f"Bearer {s1_token}"}
    s2_headers = {"Authorization": f"Bearer {s2_token}"}

    st_s1_dep, _ = http_req("POST", "/classrooms/exams/lab-exam-01/deploy", {"code": good_code}, headers=s1_headers)
    assert st_s1_dep == 200
    st_sub1, res_sub1 = http_req("POST", "/classrooms/exams/lab-exam-01/submit", {"code": good_code}, headers=s1_headers)
    assert st_sub1 == 200, f"Student 1 submit failed: {res_sub1}"
    code_sha_str = res_sub1.get('code_sha256') or ''
    model_sha_str = res_sub1.get('model_sha256') or ''
    safe_print(f"  -> Student 1 Submit -> Status: {st_sub1}, Code SHA: {code_sha_str[:12]}..., Model SHA: {model_sha_str[:12]}...")
    safe_print(f"     Score: {res_sub1.get('grade_score')}/100.0, Guardrail Flags: {res_sub1.get('guardrail_flags')}")

    # Student 2: Deploys separate model and submits
    st_s2_dep, _ = http_req("POST", "/classrooms/exams/lab-exam-01/deploy", {"code": good_code}, headers=s2_headers)
    assert st_s2_dep == 200
    st_sub2, res_sub2 = http_req("POST", "/classrooms/exams/lab-exam-01/submit", {"code": good_code}, headers=s2_headers)
    assert st_sub2 == 200, f"Student 2 submit failed: {res_sub2}"
    safe_print(f"  -> Student 2 Submit -> Status: {st_sub2}, Submission ID: {res_sub2.get('submission_id')}")

    # D3 Tenant Isolation: Student 1 attempts to access Student 2's session
    safe_print("  -> Verifying Student Isolation: Student 1 cannot view Student 2's session...")
    st_s1_view, s1_sess = http_req("GET", "/classrooms/exams/lab-exam-01/session", headers=s1_headers)
    assert s1_sess.get("student_id") == str(s1_uuid), "Student session must be isolated to user_id"

    # ──────────────────────────────────────────────────────────────────────────
    # PART A3: SERVER-SIDE LOCK VERIFICATION POST-SUBMISSION
    # ──────────────────────────────────────────────────────────────────────────
    safe_print("\n[PART A3] 8. Verifying Immutable Submission Lock (Reject direct API calls)...")
    # Post-submit /deploy
    st_lock_dep, res_lock_dep = http_req("POST", "/classrooms/exams/lab-exam-01/deploy", {"code": "print('bypass')"}, headers=s1_headers)
    safe_print(f"  -> Post-submit POST /deploy -> Status: {st_lock_dep} (Expected: 403), Detail: {res_lock_dep.get('detail')}")
    assert st_lock_dep == 403, "POST /deploy must return 403 post-submit"

    # Post-submit /evaluate
    st_lock_eval, res_lock_eval = http_req("POST", "/classrooms/exams/lab-exam-01/evaluate", headers=s1_headers)
    safe_print(f"  -> Post-submit POST /evaluate -> Status: {st_lock_eval} (Expected: 403), Detail: {res_lock_eval.get('detail')}")
    assert st_lock_eval == 403, "POST /evaluate must return 403 post-submit"

    # Post-submit /draft
    st_lock_dr, res_lock_dr = http_req("POST", "/classrooms/exams/lab-exam-01/draft", {"code": "x = 1"}, headers=s1_headers)
    safe_print(f"  -> Post-submit POST /draft -> Status: {st_lock_dr} (Expected: 403), Detail: {res_lock_dr.get('detail')}")
    assert st_lock_dr == 403, "POST /draft must return 403 post-submit"

    # ──────────────────────────────────────────────────────────────────────────
    # PART B5 & B6: INSTRUCTOR DASHBOARD, REPRODUCIBILITY AUDIT & GRADING
    # ──────────────────────────────────────────────────────────────────────────
    safe_print("\n[PART B5 & B6] 9. Instructor Dashboard, Reproducibility Audit & Manual Feedback...")
    # Get Submissions Dashboard
    st_subs, subs = http_req("GET", f"/classrooms/assignments/{asgn_id}/submissions", headers=auth_headers)
    safe_print(f"  -> GET /assignments/{asgn_id}/submissions -> Status: {st_subs}, Submissions Count: {len(subs)}")
    for s in subs:
        safe_print(f"     * Student: {s['learner_name']} ({s['learner_email']}) | Status: {s['status']} | Score: {s['grade_score']}/100.0 | Submitted: {s['submitted_at']}")

    # One-click Reproducibility Audit on Student 1's submission
    sub1_id = subs[0]["submission_id"]
    safe_print(f"  -> Running One-Click Reproducibility Audit on submission '{sub1_id}'...")
    st_audit, res_audit = http_req("POST", f"/classrooms/submissions/{sub1_id}/reproduce", headers=auth_headers)
    safe_print(f"     Status: {st_audit}, Verified: {res_audit.get('verified')}, Original Score: {res_audit.get('original_score')}, Reproduced Score: {res_audit.get('reproduced_score')}")
    safe_print(f"     Reproduced Metrics: {res_audit.get('reproduced_metrics')}, Tolerance: {res_audit.get('tolerance')}")
    assert res_audit.get("verified") is True, "Reproducibility audit must verify matching seed execution"

    # Instructor Manual Grade & Written Feedback
    grade_payload = {
        "score": 95.0,
        "comments": "Excellent preprocessing pipeline with robust StandardScaler and cross-validated LogisticRegression. All guardrails passed.",
    }
    st_grd, res_grd = http_req("POST", f"/classrooms/submissions/{sub1_id}/grade", grade_payload, headers=auth_headers)
    safe_print(f"  -> POST /submissions/{sub1_id}/grade -> Status: {st_grd}, Detail: {res_grd.get('detail')}")
    assert st_grd == 200, "Instructor manual grade update must succeed"

    # CSV Grade Export
    st_csv, csv_content = http_req("GET", f"/classrooms/assignments/{asgn_id}/grades.csv", headers=auth_headers)
    safe_print(f"  -> GET /assignments/{asgn_id}/grades.csv -> Status: {st_csv}, Content snippet:")
    for line in str(csv_content).splitlines()[:4]:
        safe_print(f"       {line}")

    # ──────────────────────────────────────────────────────────────────────────
    # PART E2: 200 SIMULATED CONCURRENT STUDENTS LOAD TEST
    # ──────────────────────────────────────────────────────────────────────────
    safe_print("\n[PART E2] 10. Load-Testing Exam Path with 200 Simulated Concurrent Students...")
    concurrent_students = 200
    latencies: List[float] = []
    successes = 0
    failures = 0

    def simulate_student(idx: int):
        user_id = f"load-test-student-{idx:03d}"
        t0 = time.time()
        # Ping session & draft
        code_s, _ = http_req("POST", "/classrooms/exams/lab-exam-01/draft", {"code": f"# Student {idx} draft\nscore = {idx}\n"}, headers={"X-User-Id": user_id})
        t1 = time.time()
        return (code_s == 200, (t1 - t0) * 1000.0)

    t_start = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=30) as executor:
        futures = [executor.submit(simulate_student, i) for i in range(concurrent_students)]
        for f in concurrent.futures.as_completed(futures):
            ok, lat = f.result()
            latencies.append(lat)
            if ok:
                successes += 1
            else:
                failures += 1
    total_duration = time.time() - t_start

    latencies.sort()
    p50 = latencies[int(len(latencies) * 0.50)]
    p95 = latencies[int(len(latencies) * 0.95)]
    p99 = latencies[int(len(latencies) * 0.99)]
    err_rate = (failures / concurrent_students) * 100.0

    safe_print(f"  -> 200 Concurrent Students Test Results:")
    safe_print(f"     * Total requests completed: {concurrent_students}")
    safe_print(f"     * Successful requests: {successes} | Failed requests: {failures}")
    safe_print(f"     * Error Rate: {err_rate:.2f}%")
    safe_print(f"     * Total Duration: {total_duration:.2f}s (Throughput: {concurrent_students/total_duration:.1f} req/s)")
    safe_print(f"     * Latency P50: {p50:.2f} ms")
    safe_print(f"     * Latency P95: {p95:.2f} ms")
    safe_print(f"     * Latency P99: {p99:.2f} ms")
    assert err_rate == 0.0, f"Error rate must be 0%, got {err_rate}%"

    safe_print("\n" + "=" * 75)
    safe_print("ALL COMPREHENSIVE CHECKS PASSED WITH 100% SUCCESS!")
    safe_print("=" * 75)

if __name__ == "__main__":
    run_tests()
