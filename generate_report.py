"""
generate_report.py
Generates a full SE report HTML with proper matplotlib diagram images (embedded as base64 PNG).
Run this script, then open software_engineering.html with Edge headless to produce PDF.
"""
import io, base64
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch

plt.rcParams.update({'font.family': 'DejaVu Sans'})

OUT_HTML = r"c:\Users\mehta\OneDrive\Desktop\ml-playground\software_engineering.html"
OUT_PDF  = r"c:\Users\mehta\OneDrive\Desktop\ml-playground\software engineering.pdf"

# ── Shared color palette ────────────────────────────────────────────────────
C = {
    'auth':   ('#e8eaf6', '#3949ab'),
    'data':   ('#e8f5e9', '#2e7d32'),
    'pipe':   ('#fff8e1', '#f57f17'),
    'train':  ('#fce4ec', '#c62828'),
    'deploy': ('#e3f2fd', '#1565c0'),
    'class':  ('#f3e5f5', '#6a1b9a'),
    'ent':    ('#e1f5fe', '#0277bd'),
    'proc':   ('#fffde7', '#f9a825'),
    'store':  ('#f1f8e9', '#558b2f'),
    'ext':    ('#fafafa', '#424242'),
    'sys_bg': '#fafafa',
    'sys_bdr': '#333',
    'arrow':  '#444',
    'gray':   '#888',
}

def to_b64(fig, dpi=130):
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=dpi, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode()
    plt.close(fig)
    return b64

def img_tag(b64, alt='Diagram'):
    return (f'<img src="data:image/png;base64,{b64}" alt="{alt}" '
            f'style="max-width:100%;height:auto;display:block;margin:16px auto;'
            f'border:1px solid #ddd;border-radius:4px;"/>')

# ─── Helper drawing functions ───────────────────────────────────────────────

def draw_rect(ax, x, y, w, h, fc='#f5f5f5', ec='#333', lw=1.5, rx=0.3):
    patch = FancyBboxPatch((x, y), w, h,
                           boxstyle=f'round,pad={rx}',
                           facecolor=fc, edgecolor=ec, linewidth=lw, zorder=2)
    ax.add_patch(patch)

def draw_box_with_header(ax, x, y, w, h, hh, title, items,
                         fc='#e8eaf6', hc='#3949ab', fontsize=8, itemsize=7.5):
    """Box with a colored header stripe and bullet items below."""
    # Header
    draw_rect(ax, x, y + h - hh, w, hh, fc=hc, ec=hc, lw=0, rx=0.15)
    ax.text(x + w/2, y + h - hh/2, title,
            ha='center', va='center', fontsize=fontsize, color='white', fontweight='bold', zorder=3)
    # Body
    draw_rect(ax, x, y, w, h - hh, fc=fc, ec=hc, lw=1.5, rx=0.15)
    for i, item in enumerate(items):
        ax.text(x + 0.15, y + h - hh - 0.22 - i * 0.32, f'● {item}',
                ha='left', va='top', fontsize=itemsize, color='#222', zorder=3)

def draw_actor(ax, cx, cy, label, fontsize=8):
    """Stick figure actor."""
    # Head
    circle = plt.Circle((cx, cy + 0.55), 0.22, color='#222', fill=False, linewidth=1.5, zorder=5)
    ax.add_patch(circle)
    # Body
    ax.plot([cx, cx], [cy + 0.33, cy - 0.15], color='#222', lw=1.5, zorder=5)
    # Arms
    ax.plot([cx - 0.3, cx + 0.3], [cy + 0.15, cy + 0.15], color='#222', lw=1.5, zorder=5)
    # Legs
    ax.plot([cx, cx - 0.25], [cy - 0.15, cy - 0.55], color='#222', lw=1.5, zorder=5)
    ax.plot([cx, cx + 0.25], [cy - 0.15, cy - 0.55], color='#222', lw=1.5, zorder=5)
    for i, part in enumerate(label.split('\n')):
        ax.text(cx, cy - 0.72 - i * 0.22, part,
                ha='center', va='top', fontsize=fontsize, color='#111', zorder=5)

def draw_arrow(ax, x1, y1, x2, y2, label='', lw=1.2, color='#555'):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle='->', color=color, lw=lw), zorder=4)
    if label:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        ax.text(mx, my + 0.08, label, ha='center', va='bottom', fontsize=7.5, color='#333', zorder=4)

def draw_diamond(ax, cx, cy, w, h, label, fc='#fff8e1', ec='#f57f17'):
    xs = [cx, cx + w/2, cx, cx - w/2, cx]
    ys = [cy + h/2, cy, cy - h/2, cy, cy + h/2]
    ax.fill(xs, ys, color=fc, zorder=2)
    ax.plot(xs, ys, color=ec, linewidth=1.5, zorder=3)
    ax.text(cx, cy, label, ha='center', va='center', fontsize=7.5, color='#222', zorder=4)

def draw_circle(ax, cx, cy, r, fc='#333', ec='#333'):
    c = plt.Circle((cx, cy), r, color=fc, ec=ec, linewidth=1.5, zorder=3)
    ax.add_patch(c)

def draw_oval(ax, cx, cy, rx, ry, label, fc='white', ec='#555', fontsize=8):
    e = mpatches.Ellipse((cx, cy), rx * 2, ry * 2, facecolor=fc, edgecolor=ec, linewidth=1.2, zorder=3)
    ax.add_patch(e)
    ax.text(cx, cy, label, ha='center', va='center', fontsize=fontsize, color='#111', zorder=4)

def setup_ax(ax, xlim, ylim, title=''):
    ax.set_xlim(*xlim)
    ax.set_ylim(*ylim)
    ax.set_aspect('equal')
    ax.axis('off')
    if title:
        ax.set_title(title, fontsize=12, fontweight='bold', pad=10, color='#1a1a2e')

# ═══════════════════════════════════════════════════════════════════════════
# DIAGRAM 1: USE CASE DIAGRAM
# ═══════════════════════════════════════════════════════════════════════════
def make_usecase():
    fig, ax = plt.subplots(figsize=(16, 11))
    fig.patch.set_facecolor('white')
    setup_ax(ax, (-0.5, 16.5), (-0.5, 11.5), 'Figure 2.6.1 — Use Case Diagram : ML Playground Platform')

    # System boundary
    draw_rect(ax, 2.5, 0.2, 13.0, 10.8, fc='#fafafa', ec='#333', lw=2.5, rx=0.2)
    ax.text(9.0, 10.7, '« system boundary »   ML PLAYGROUND PLATFORM',
            ha='center', va='bottom', fontsize=9, color='#555', style='italic')

    # Module boxes
    modules = [
        # (x, y, w, h, hh, title, items, fc, hc)
        (2.7, 7.5, 3.5, 3.2, 0.55, 'AUTHENTICATION',
         ['Register Account', 'Login / Logout', 'Reset Password', 'Manage Profile'],
         C['auth'][0], C['auth'][1]),
        (6.4, 7.5, 4.5, 3.2, 0.55, 'DATASET & PROFILER',
         ['Upload CSV Dataset', 'Load Benchmark Dataset', 'View Data Profile',
          'View Health Report', 'Select Features / Target'],
         C['data'][0], C['data'][1]),
        (11.1, 7.5, 4.2, 3.2, 0.55, 'PIPELINE (CODE STUDIO)',
         ['View Generated Code', 'Edit Code in Monaco',
          'Run Code / Launch Training', 'View Pipeline DAG'],
         C['pipe'][0], C['pipe'][1]),
        (2.7, 0.4, 3.5, 6.8, 0.55, 'TRAINING & EXPERIMENTS',
         ['Configure Algorithm', 'Set Hyperparameters', 'Launch Training Job',
          'View Training Progress (SSE)', 'View Results & Metrics',
          'SHAP Feature Importance', 'Experiment Leaderboard',
          'Compare Runs', 'Adjust Decision Threshold'],
         C['train'][0], C['train'][1]),
        (6.4, 0.4, 4.5, 6.8, 0.55, 'MODEL DEPLOYMENTS',
         ['Deploy Trained Model', 'View All Deployments',
          'Open Deployment Studio', 'Test Live Prediction',
          'Start / Stop / Restart Endpoint',
          'View Model Registry', 'Promote Champion Model',
          'Monitor Data Drift', 'View Prediction History'],
         C['deploy'][0], C['deploy'][1]),
        (11.1, 0.4, 4.2, 6.8, 0.55, 'CLASSROOM (LAB EXAM)',
         ['Create Classroom', 'Set Join Code & Exam Time',
          'Enrol via Join Code', 'Attempt Timed Lab Exam',
          'Write & Run ML Code', 'Submit Exam Results',
          'Grade Students', 'View Student Roster',
          'Safe Exam Mode (tab lock)'],
         C['class'][0], C['class'][1]),
    ]
    for (x, y, w, h, hh, title, items, fc, hc) in modules:
        draw_box_with_header(ax, x, y, w, h, hh, title, items, fc=fc, hc=hc)

    # Actors (left side)
    left_actors = [
        (1.5, 10.2, 'Guest'),
        (1.5, 8.3, 'Learner\n(Student)'),
        (1.5, 6.0, 'Faculty'),
        (1.5, 4.0, 'Lab\nCoordinator'),
        (1.5, 2.0, 'Org Admin'),
        (1.5, 0.2, 'Platform\nOwner'),
    ]
    for (cx, cy, label) in left_actors:
        draw_actor(ax, cx, cy, label)

    # Actors (right side)
    draw_actor(ax, 15.7, 6.5, 'Celery Worker\n(System Actor)')

    # Connection lines from actors to modules
    lc = '#aaa'
    # Guest -> Auth
    ax.plot([1.75, 2.7], [10.2, 9.4], color=lc, lw=1, linestyle='--')
    # Learner -> Auth, Dataset, Pipeline, Training, Deploy
    ax.plot([1.75, 2.7], [8.3, 8.5], color=lc, lw=1, linestyle='--')
    ax.plot([1.75, 6.4], [8.3, 8.8], color=lc, lw=1, linestyle='--')
    ax.plot([1.75, 2.7], [8.3, 3.8], color=lc, lw=1, linestyle='--')
    ax.plot([1.75, 6.4], [8.3, 3.8], color=lc, lw=1, linestyle='--')
    # Faculty -> Classroom + all above
    ax.plot([1.75, 11.1], [6.0, 3.8], color=lc, lw=1, linestyle='--')
    # Celery Worker -> Training module
    ax.plot([15.5, 11.1 + 4.2], [6.5, 3.8], color=lc, lw=1, linestyle='--')

    # Legend
    ax.text(0.5, -0.3, '--- : Actor-UseCase Association    ●  : Use Case', 
            ha='left', va='bottom', fontsize=8, color='#555', style='italic')

    plt.tight_layout()
    return to_b64(fig)


# ═══════════════════════════════════════════════════════════════════════════
# DIAGRAM 2: ACTIVITY DIAGRAM
# ═══════════════════════════════════════════════════════════════════════════
def make_activity():
    fig, ax = plt.subplots(figsize=(14, 16))
    fig.patch.set_facecolor('white')
    setup_ax(ax, (0, 14), (-1, 17.5), 'Figure 2.6.2 — Activity Diagram : ML Training Job Workflow')

    # Swimlane columns
    cols = [
        (0, 4.5, 'USER / BROWSER', '#e8eaf6', '#3949ab'),
        (4.5, 5, 'FASTAPI BACKEND', '#e8f5e9', '#2e7d32'),
        (9.5, 4.5, 'CELERY WORKER', '#fce4ec', '#c62828'),
    ]
    for (x, w, label, fc, hc) in cols:
        ax.add_patch(plt.Rectangle((x, -0.8), w, 18.1, facecolor=fc, edgecolor=hc, linewidth=2, alpha=0.3, zorder=0))
        ax.text(x + w/2, 17.2, label, ha='center', va='center', fontsize=11, fontweight='bold', color=hc, zorder=2)
    # Vertical dividers
    ax.axvline(x=4.5, color='#aaa', linewidth=1, linestyle='--', zorder=1)
    ax.axvline(x=9.5, color='#aaa', linewidth=1, linestyle='--', zorder=1)

    def box(x, y, w, h, label, fc='#e3f2fd', ec='#1565c0', fontsize=8.5):
        draw_rect(ax, x - w/2, y - h/2, w, h, fc=fc, ec=ec, lw=1.5, rx=0.25)
        for i, line_ in enumerate(label.split('\n')):
            offset = (i - (label.count('\n')) / 2) * 0.22
            ax.text(x, y + offset, line_, ha='center', va='center', fontsize=fontsize, color='#111', zorder=4)

    def arr(x1, y1, x2, y2, label=''):
        draw_arrow(ax, x1, y1, x2, y2, label=label, lw=1.5)

    # Start
    draw_circle(ax, 2.2, 16.5, 0.22, fc='#1a1a2e')
    ax.text(2.2, 16.5, '', ha='center', va='center', fontsize=9, color='white')
    ax.text(3.0, 16.5, '◉ START', ha='left', va='center', fontsize=9, color='#333', fontweight='bold')

    # User actions
    box(2.2, 15.5, 3.8, 0.65, 'Select Dataset, Algorithm\n& Hyperparameters', fc='#e8eaf6', ec='#3949ab')
    box(2.2, 14.5, 3.8, 0.55, 'Click  "Launch Training"', fc='#e8eaf6', ec='#3949ab')
    arr(2.2, 15.18, 2.2, 14.78)

    # API receives
    box(7.0, 14.5, 4.2, 0.55, 'Receive POST /jobs request', fc='#e8f5e9', ec='#2e7d32')
    arr(2.2, 14.22, 2.2, 13.72)
    arr(4.1, 14.5, 4.9, 14.5, label='POST /jobs')

    # Validate JWT decision
    draw_diamond(ax, 7.0, 13.4, 3.6, 0.85, 'Valid JWT?', fc='#fff8e1', ec='#f57f17')
    arr(7.0, 14.22, 7.0, 13.83)

    # Invalid JWT path
    box(4.0, 12.55, 2.6, 0.55, '← Return 401 Forbidden', fc='#ffebee', ec='#c62828')
    ax.plot([5.2, 5.2], [13.4, 12.55], color='#c62828', lw=1.2)
    ax.annotate('', xy=(5.3, 12.55), xytext=(5.2, 12.55), arrowprops=dict(arrowstyle='->', color='#c62828'))
    ax.text(4.8, 13.05, 'No', ha='right', va='center', fontsize=8, color='#c62828')

    # Valid JWT path
    box(7.0, 12.55, 4.2, 0.55, 'Create Job Record (PENDING)', fc='#e8f5e9', ec='#2e7d32')
    arr(7.0, 12.97, 7.0, 12.83)
    ax.text(7.5, 13.1, 'Yes', ha='left', va='center', fontsize=8, color='#2e7d32')

    box(7.0, 11.8, 4.2, 0.55, 'Enqueue Task in Redis Queue', fc='#e8f5e9', ec='#2e7d32')
    arr(7.0, 12.27, 7.0, 12.08)

    box(7.0, 11.05, 4.2, 0.55, 'Return 202 Accepted + job_id', fc='#e8f5e9', ec='#2e7d32')
    arr(7.0, 11.53, 7.0, 11.33)
    arr(4.9, 11.05, 4.1, 11.05, label='202 + job_id')
    box(2.2, 11.05, 3.5, 0.55, 'Receive job_id\nConnect to SSE stream', fc='#e8eaf6', ec='#3949ab')

    # Worker picks up task
    box(11.5, 10.3, 3.6, 0.55, 'Dequeue Task from Redis', fc='#fce4ec', ec='#c62828')
    arr(7.0, 10.77, 7.0, 10.58)
    arr(9.5 + 0.1, 10.3, 9.3, 10.3, label='Celery\ndequeue')

    box(11.5, 9.5, 3.6, 0.55, 'Update Status → RUNNING', fc='#fce4ec', ec='#c62828')
    arr(11.5, 10.02, 11.5, 9.78)

    box(11.5, 8.7, 3.6, 0.55, 'Load Dataset File', fc='#fce4ec', ec='#c62828')
    arr(11.5, 9.22, 11.5, 8.98)

    draw_diamond(ax, 11.5, 7.9, 3.6, 0.75, 'Load OK?', fc='#fff8e1', ec='#f57f17')
    arr(11.5, 8.42, 11.5, 8.28)

    # Load error path
    box(13.2, 7.0, 1.5, 0.55, 'Status =\nFAILED', fc='#ffebee', ec='#c62828', fontsize=7.5)
    ax.plot([13.3, 13.3], [7.9, 7.0], color='#c62828', lw=1.2)
    ax.text(13.0, 7.55, 'No', ha='right', va='center', fontsize=7.5, color='#c62828')

    # Load OK path
    box(11.5, 7.0, 3.6, 0.55, 'Preprocess & Split Data\n(Train / Test)', fc='#fce4ec', ec='#c62828')
    arr(11.5, 7.52, 11.5, 7.28)
    ax.text(11.0, 7.55, 'Yes', ha='right', va='center', fontsize=7.5, color='#2e7d32')

    box(11.5, 6.2, 3.6, 0.55, 'Train Model on Training Set', fc='#fce4ec', ec='#c62828')
    arr(11.5, 6.72, 11.5, 6.48)

    box(11.5, 5.4, 3.6, 0.55, 'Evaluate on Test Set\n(Accuracy, F1, RMSE…)', fc='#fce4ec', ec='#c62828')
    arr(11.5, 5.92, 11.5, 5.68)

    box(11.5, 4.6, 3.6, 0.55, 'Save Model Artifact\n(model.pkl)', fc='#fce4ec', ec='#c62828')
    arr(11.5, 5.12, 11.5, 4.88)

    box(11.5, 3.8, 3.6, 0.55, 'Update Status → COMPLETED\nEmit SSE "100% DONE"', fc='#fce4ec', ec='#c62828')
    arr(11.5, 4.32, 11.5, 4.08)

    # SSE back to browser
    arr(9.5, 3.8, 4.1, 3.8, label='SSE push:\n"COMPLETED"')
    box(2.2, 3.8, 3.5, 0.55, 'View Results Dashboard', fc='#e8eaf6', ec='#3949ab')

    # Decision: deploy?
    draw_diamond(ax, 2.2, 2.85, 3.4, 0.75, 'Deploy\nthis model?', fc='#fff8e1', ec='#f57f17')
    arr(2.2, 3.53, 2.2, 3.23)

    box(0.9, 1.8, 1.5, 0.55, 'Go to\nDeployments', fc='#e3f2fd', ec='#1565c0', fontsize=7.5)
    box(3.5, 1.8, 1.5, 0.55, 'Stay on\nResults', fc='#e8eaf6', ec='#3949ab', fontsize=7.5)
    ax.plot([0.9, 0.9], [2.85, 1.8], color='#555', lw=1.2)
    ax.text(0.5, 2.4, 'Yes', ha='right', va='center', fontsize=8, color='#1565c0')
    ax.plot([3.5, 3.5], [2.85, 1.8], color='#555', lw=1.2)
    ax.text(4.0, 2.4, 'No', ha='left', va='center', fontsize=8, color='#c62828')

    # End symbols
    draw_circle(ax, 0.9, 1.0, 0.22, fc='white', ec='#1a1a2e')
    draw_circle(ax, 0.9, 1.0, 0.14, fc='#1a1a2e')
    ax.text(0.9, 0.7, 'END', ha='center', va='top', fontsize=8, color='#333')
    draw_circle(ax, 3.5, 1.0, 0.22, fc='white', ec='#1a1a2e')
    draw_circle(ax, 3.5, 1.0, 0.14, fc='#1a1a2e')
    ax.text(3.5, 0.7, 'END', ha='center', va='top', fontsize=8, color='#333')

    arr(0.9, 1.53, 0.9, 1.22)
    arr(3.5, 1.53, 3.5, 1.22)

    ax.text(0.1, -0.7, '◉ = Start    ⊙ = End    ◆ = Decision    □ = Activity',
            ha='left', va='bottom', fontsize=8, color='#666', style='italic')

    plt.tight_layout()
    return to_b64(fig)


# ═══════════════════════════════════════════════════════════════════════════
# DIAGRAM 3: SEQUENCE DIAGRAM
# ═══════════════════════════════════════════════════════════════════════════
def make_sequence():
    fig, ax = plt.subplots(figsize=(16, 12))
    fig.patch.set_facecolor('white')
    setup_ax(ax, (0, 16), (-1, 13), 'Figure 2.6.3 — Sequence Diagram : Training Job & Model Prediction Flows')

    # Component boxes + lifelines
    components = [
        (1.0, 'Browser\n(React UI)', '#e8eaf6', '#3949ab'),
        (3.5, 'FastAPI\nBackend', '#e8f5e9', '#2e7d32'),
        (6.0, 'Auth\nMiddleware', '#fff8e1', '#f57f17'),
        (8.5, 'Job\nService', '#e3f2fd', '#1565c0'),
        (11.0, 'Redis\nQueue', '#f3e5f5', '#6a1b9a'),
        (13.5, 'Celery\nWorker', '#fce4ec', '#c62828'),
    ]
    top_y = 12.3
    bot_y = -0.5
    for (x, label, fc, hc) in components:
        draw_rect(ax, x - 0.9, top_y - 0.5, 1.8, 0.85, fc=fc, ec=hc, lw=1.5, rx=0.2)
        for i, part in enumerate(label.split('\n')):
            ax.text(x, top_y - 0.08 + (0.2 if len(label.split('\n')) == 2 else 0) - i * 0.22,
                    part, ha='center', va='center', fontsize=8.5, color='#111', fontweight='bold')
        ax.plot([x, x], [top_y - 0.5, bot_y], color='#bbb', lw=1.2, linestyle='--', zorder=1)

    def msg(y, x1, x2, label, color='#333', lw=1.3, dashed=False, ret=False):
        style = '--' if dashed else '-'
        ax.annotate('', xy=(x2, y), xytext=(x1, y),
                    arrowprops=dict(arrowstyle='<-' if ret else '->', color=color,
                                   lw=lw, linestyle=style), zorder=4)
        mx = (x1 + x2) / 2
        ax.text(mx, y + 0.1, label, ha='center', va='bottom', fontsize=8, color=color, zorder=4)

    def note(y, label, color='#555'):
        ax.text(0.1, y, label, ha='left', va='center', fontsize=8, color=color,
                fontweight='bold', style='italic')

    # ── FLOW A: Training Job ──────────────────────────────────────────────
    # Section header
    ax.axhspan(11.3, 11.7, alpha=0.12, color='#3949ab', zorder=0)
    ax.text(8.0, 11.5, 'FLOW A — Submit Training Job', ha='center', va='center',
            fontsize=10, fontweight='bold', color='#3949ab', zorder=2)

    msg(11.0, 1.0, 3.5, 'POST /api/v1/jobs  {algorithm, features, target}')
    msg(10.3, 3.5, 6.0, 'validateJWT(token)')
    msg(9.7,  6.0, 3.5, 'user_id', ret=True, dashed=True)
    msg(9.1,  3.5, 8.5, 'createJob(dataset_id, algorithm)')
    msg(8.5,  8.5, 11.0, 'enqueue_task(job_id)')
    msg(7.9,  8.5, 1.0, '202 Accepted  {job_id}', ret=True, dashed=True, color='#2e7d32')

    msg(7.3, 1.0, 3.5, 'GET /jobs/{job_id}/stream  (SSE)')
    msg(6.7, 11.0, 13.5, 'dequeue(task)')
    msg(6.1, 13.5, 8.5, 'UPDATE status=RUNNING', color='#c62828')
    msg(5.5, 13.5, 8.5, 'preprocess() → split() → train()', color='#c62828')
    msg(4.9, 13.5, 8.5, 'UPDATE progress=60%', color='#c62828')
    msg(4.3, 8.5,  1.0, 'SSE: {progress:60}', dashed=True, color='#1565c0', ret=True)
    msg(3.7, 13.5, 8.5, 'evaluate() → save_artifact()', color='#c62828')
    msg(3.1, 13.5, 8.5, 'UPDATE status=COMPLETED', color='#c62828')
    msg(2.5, 8.5,  1.0, 'SSE: {status:"COMPLETED", progress:100}', dashed=True, color='#1565c0', ret=True)
    msg(1.9, 1.0, 3.5, 'GET /jobs/{job_id}  (fetch full results)')
    msg(1.3, 3.5, 1.0, 'results {metrics, feature_importance}', ret=True, dashed=True, color='#2e7d32')

    # ── FLOW B: Predict ───────────────────────────────────────────────────
    # Second diagram (vertical strip at bottom, different components)
    ax.text(0.1, -0.8, 'FLOW B (Prediction): Browser → POST /local-deployments/{id}/predict → InferenceEngine → response + log saved to DB',
            ha='left', va='top', fontsize=7.5, color='#555', style='italic')

    plt.tight_layout()
    return to_b64(fig)


# ═══════════════════════════════════════════════════════════════════════════
# DIAGRAM 4: ER DIAGRAM
# ═══════════════════════════════════════════════════════════════════════════
def make_er():
    fig, ax = plt.subplots(figsize=(16, 14))
    fig.patch.set_facecolor('white')
    setup_ax(ax, (-0.5, 16.5), (-1, 15),
             'Figure 2.6.4 — Entity-Relationship Diagram : ML Playground Database Schema')

    def entity(x, y, w, h, title, attrs, fc='#e1f5fe', ec='#0277bd'):
        # Title box
        draw_rect(ax, x, y + h, w, 0.55, fc=ec, ec=ec, lw=0, rx=0.1)
        ax.text(x + w/2, y + h + 0.27, title, ha='center', va='center',
                fontsize=9, fontweight='bold', color='white', zorder=4)
        # Attr box
        draw_rect(ax, x, y, w, h, fc=fc, ec=ec, lw=1.5, rx=0.1)
        for i, attr in enumerate(attrs):
            is_pk = attr.endswith('(PK)')
            is_fk = attr.endswith('(FK)')
            color = '#1565c0' if is_pk else ('#6a1b9a' if is_fk else '#222')
            ax.text(x + 0.12, y + h - 0.28 - i * 0.3, attr,
                    ha='left', va='center', fontsize=7.8, color=color, zorder=4,
                    fontweight='bold' if is_pk else 'normal')

    def rel(x1, y1, x2, y2, label, card1='1', card2='N'):
        ax.plot([x1, x2], [y1, y2], color='#666', lw=1.5, zorder=2)
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        ax.text(mx, my + 0.12, label, ha='center', va='bottom', fontsize=7.5,
                color='#444', style='italic', zorder=4)
        # Cardinality labels
        ax.text(x1 + (x2 - x1) * 0.1, y1 + (y2 - y1) * 0.1 + 0.1,
                card1, ha='center', va='center', fontsize=8, color='#1565c0', fontweight='bold')
        ax.text(x1 + (x2 - x1) * 0.9, y1 + (y2 - y1) * 0.9 + 0.1,
                card2, ha='center', va='center', fontsize=8, color='#c62828', fontweight='bold')

    # ── ML Workflow Cluster ──────────────────────────────────────────────

    ax.text(8.0, 14.7, '── ML WORKFLOW CLUSTER ──', ha='center', fontsize=10,
            fontweight='bold', color='#0277bd')

    # Organisation
    entity(0.2, 11.0, 3.2, 2.0, 'Organisation',
           ['id  (PK)', 'name', 'slug', 'created_at'],
           fc='#e1f5fe', ec='#0277bd')

    # User
    entity(4.5, 11.0, 3.2, 2.4, 'User',
           ['id  (PK)', 'email', 'full_name', 'hashed_password',
            'role  (enum)', 'is_active', 'organisation_id  (FK)'],
           fc='#e1f5fe', ec='#0277bd')

    # Dataset
    entity(8.8, 11.0, 3.2, 2.4, 'Dataset',
           ['id  (PK)', 'name', 'file_path', 'row_count',
            'column_count', 'status  (enum)', 'user_id  (FK)'],
           fc='#e1f5fe', ec='#0277bd')

    # Job
    entity(8.8, 7.5, 3.2, 3.0, 'Job',
           ['id  (PK)', 'algorithm', 'status  (enum)', 'progress  %',
            'current_stage', 'result_path', 'job_metadata  (JSON)',
            'dataset_id  (FK)', 'user_id  (FK)'],
           fc='#e1f5fe', ec='#0277bd')

    # LocalDeployment
    entity(8.8, 3.5, 3.2, 3.5, 'LocalDeployment',
           ['id  (PK)', 'job_id  (FK)', 'name', 'status  (enum)',
            'model_path', 'algorithm', 'target_column',
            'feature_columns  (JSON)', 'input_schema  (JSON)',
            'total_predictions'],
           fc='#e1f5fe', ec='#0277bd')

    # LocalPredictionHistory
    entity(8.8, 0.2, 3.2, 2.8, 'LocalPredictionHistory',
           ['id  (PK)', 'local_deployment_id  (FK)',
            'input_data  (JSON)', 'prediction_output  (JSON)',
            'latency_ms', 'created_at'],
           fc='#e1f5fe', ec='#0277bd')

    # Workspace
    entity(0.2, 7.5, 3.2, 2.5, 'Workspace',
           ['id  (PK)', 'name', 'slug', 'status  (enum)',
            'visibility  (enum)', 'organisation_id  (FK)',
            'created_by_user_id  (FK)'],
           fc='#e8f5e9', ec='#2e7d32')

    # Relationships (ML cluster)
    rel(3.4, 12.28, 4.5, 12.28, 'has members', '1', 'N')
    rel(1.8, 11.0, 1.8, 10.0, '', '', '')
    ax.plot([1.8, 0.2, 0.2], [10.0, 10.0, 10.0], color='#666', lw=1.5)
    rel(4.5, 10.8, 0.2, 8.95, 'creates', '1', 'N')
    rel(7.7, 12.28, 8.8, 12.28, 'uploads', '1', 'N')
    rel(10.4, 11.0, 10.4, 11.0, '', '', '')
    rel(10.4, 11.0, 10.4, 11.0, '', '', '')
    ax.plot([10.4, 10.4], [11.0, 10.95], color='#666', lw=1.5)
    rel(10.4, 10.95, 10.4, 10.95, 'feeds', '1', 'N')
    ax.plot([10.4, 10.4], [10.95, 10.95], color='#666', lw=1.5)
    rel(10.4, 11.0, 10.4, 8.05, 'feeds', '1', 'N')
    rel(10.4, 7.5, 10.4, 4.05, 'has', '1', 'N')
    rel(10.4, 3.5, 10.4, 1.05, 'logs', '1', 'N')

    # ── Education Cluster ────────────────────────────────────────────────
    ax.text(8.0, -0.5, '── EDUCATION CLUSTER ──', ha='center', fontsize=10,
            fontweight='bold', color='#6a1b9a')
    ax.axhline(y=-0.2, color='#bbb', lw=1, linestyle='--')

    entity(0.2, -4.2, 2.8, 1.5, 'Course',
           ['id  (PK)', 'code', 'title', 'organisation_id  (FK)'],
           fc='#f3e5f5', ec='#6a1b9a')

    entity(3.5, -4.9, 3.2, 2.3, 'Classroom',
           ['id  (PK)', 'name', 'join_code', 'exam_start_time',
            'exam_end_time', 'is_exam_started', 'faculty_id  (FK)',
            'course_id  (FK)'],
           fc='#f3e5f5', ec='#6a1b9a')

    entity(0.2, -7.5, 3.0, 2.5, 'ClassroomMember',
           ['id  (PK)', 'classroom_id  (FK)', 'user_id  (FK)',
            'role  (enum)', 'enrollment_number', 'division', 'batch'],
           fc='#f3e5f5', ec='#6a1b9a')

    entity(7.3, -4.9, 3.0, 2.3, 'Assignment',
           ['id  (PK)', 'title', 'description', 'due_date',
            'max_score', 'dataset_id', 'classroom_id  (FK)'],
           fc='#f3e5f5', ec='#6a1b9a')

    entity(7.3, -7.9, 3.0, 2.5, 'Submission',
           ['id  (PK)', 'learner_id  (FK)', 'assignment_id  (FK)',
            'model_id', 'status  (enum)', 'metrics_summary  (JSON)',
            'grade_score', 'code_draft'],
           fc='#f3e5f5', ec='#6a1b9a')

    entity(11.2, -7.9, 3.0, 2.0, 'Feedback',
           ['id  (PK)', 'submission_id  (FK)',
            'score', 'comments', 'evaluator_id  (FK)'],
           fc='#f3e5f5', ec='#6a1b9a')

    # Education relationships
    rel(3.0, -3.45, 3.5, -3.45, 'has', '1', 'N')
    rel(3.7, -4.9, 3.7, -5.0, '', '', '')
    rel(1.6, -4.9, 1.6, -5.0, '', '', '')
    ax.plot([3.7, 3.7], [-4.9, -5.0], color='#666', lw=1.5)
    ax.plot([1.6, 1.6], [-4.9, -5.0], color='#666', lw=1.5)
    ax.plot([1.6, 3.7], [-5.0, -5.0], color='#666', lw=1.5)
    ax.text(2.65, -5.15, 'enrolls  1:N', ha='center', va='top', fontsize=7.5, color='#555', style='italic')

    rel(6.7, -3.45, 7.3, -3.45, 'has', '1', 'N')
    rel(8.8, -4.9, 8.8, -5.4, 'receives', '1', 'N')
    rel(10.3, -6.8, 11.2, -6.9, 'gets', '1', 'N')

    # Legend
    ax.text(0.1, -9.6,
            '(PK) = Primary Key   (FK) = Foreign Key   Blue entity names = ML cluster   Purple = Education cluster',
            ha='left', va='bottom', fontsize=8, color='#555', style='italic')

    plt.tight_layout()
    return to_b64(fig)


# ═══════════════════════════════════════════════════════════════════════════
# DIAGRAM 5: DFD
# ═══════════════════════════════════════════════════════════════════════════
def make_dfd():
    fig, ax = plt.subplots(figsize=(15, 14))
    fig.patch.set_facecolor('white')
    setup_ax(ax, (-0.5, 15.5), (-1, 15.5),
             'Figure 2.6.5 — Data Flow Diagram (Level 0 & Level 1) : ML Playground')

    # ── LEVEL 0 ──────────────────────────────────────────────────────────
    ax.text(7.5, 15.2, 'LEVEL 0 — Context Diagram', ha='center', fontsize=11,
            fontweight='bold', color='#333')

    # System process (centre)
    draw_rect(ax, 5.5, 11.0, 4.0, 2.5, fc='#fffde7', ec='#f57f17', lw=2.5, rx=0.5)
    ax.text(7.5, 12.6, '0.0', ha='center', va='center', fontsize=9, color='#888')
    ax.text(7.5, 12.2, 'ML PLAYGROUND', ha='center', va='center', fontsize=10,
            fontweight='bold', color='#333')
    ax.text(7.5, 11.8, 'PLATFORM', ha='center', va='center', fontsize=10,
            fontweight='bold', color='#333')
    ax.text(7.5, 11.4, '(Entire System)', ha='center', va='center', fontsize=8, color='#666')

    def ext(x, y, w, h, label, fc='#fafafa', ec='#424242'):
        draw_rect(ax, x, y, w, h, fc=fc, ec=ec, lw=2, rx=0.15)
        for i, part in enumerate(label.split('\n')):
            ax.text(x + w/2, y + h/2 + 0.12 - i * 0.22,
                    part, ha='center', va='center', fontsize=8.5, color='#111', fontweight='bold')

    # External entities (Level 0)
    ext(0.0, 12.5, 2.8, 0.8, 'User / Learner')
    ext(0.0, 11.5, 2.8, 0.8, 'Faculty')
    ext(0.0, 10.5, 2.8, 0.8, 'Org Admin')
    ext(12.2, 12.0, 2.8, 0.8, 'External API\nClient')

    # Arrows into system
    draw_arrow(ax, 2.8, 12.9, 5.5, 12.5, label='Credentials, Dataset,\nTraining Config')
    draw_arrow(ax, 2.8, 11.9, 5.5, 12.1, label='Classroom Setup,\nExam Config')
    draw_arrow(ax, 2.8, 10.9, 5.5, 11.5, label='Admin Commands')
    draw_arrow(ax, 12.2, 12.4, 9.5, 12.4, label='Prediction\nRequest (JSON)')

    # Arrows out of system
    draw_arrow(ax, 5.5, 12.2, 2.8, 12.2, label='Auth Token, Results')
    draw_arrow(ax, 5.5, 11.8, 2.8, 11.8, label='Grades, Feedback')
    draw_arrow(ax, 9.5, 12.0, 12.2, 12.0, label='Prediction Output\n& Confidence')

    # ── LEVEL 1 ──────────────────────────────────────────────────────────
    ax.axhline(y=10.2, color='#bbb', lw=1.5, linestyle='--')
    ax.text(7.5, 10.0, 'LEVEL 1 — Major Processes', ha='center', fontsize=11,
            fontweight='bold', color='#333')

    # Data Stores
    def store(x, y, w, label):
        ax.plot([x, x], [y, y + 0.5], color='#555', lw=1.5)
        ax.plot([x + w, x + w], [y, y + 0.5], color='#555', lw=1.5)
        ax.plot([x, x + w], [y + 0.5, y + 0.5], color='#555', lw=1.5)
        ax.plot([x, x + w], [y, y], color='#555', lw=1.5)
        ax.fill_between([x, x + w], [y, y], [y + 0.5, y + 0.5], color='#f1f8e9', zorder=2)
        ax.text(x + w/2, y + 0.25, label, ha='center', va='center', fontsize=7.5, color='#2e7d32', fontweight='bold', zorder=3)

    store(0.2, 8.8, 2.5, 'D1: Users (PostgreSQL)')
    store(0.2, 7.5, 2.5, 'D2: Datasets (Files + DB)')
    store(0.2, 6.2, 2.5, 'D3: Jobs (PostgreSQL)')
    store(0.2, 4.9, 2.5, 'D4: Artifacts (Filesystem)')
    store(0.2, 3.6, 2.5, 'D5: Deployments (DB)')
    store(0.2, 2.3, 2.5, 'D6: Prediction Logs (DB)')
    store(0.2, 1.0, 2.5, 'D7: Classrooms (DB)')
    store(0.2, -0.3, 2.5, 'D8: Redis (Queue+Cache)')

    # Process circles (rounded rects to represent processes)
    def proc(x, y, w, h, pid, label, fc='#fffde7', ec='#f57f17'):
        draw_rect(ax, x, y, w, h, fc=fc, ec=ec, lw=2, rx=0.4)
        ax.text(x + w/2, y + h - 0.25, pid, ha='center', va='center',
                fontsize=8, color='#888')
        for i, part in enumerate(label.split('\n')):
            ax.text(x + w/2, y + h/2 - 0.1 + (0.15 if len(label.split('\n')) > 1 else 0) - i * 0.25,
                    part, ha='center', va='center', fontsize=8, color='#222', fontweight='bold')

    proc(3.8, 8.5, 2.8, 1.1, '1.0', 'Authentication\n& User Mgmt')
    proc(3.8, 6.8, 2.8, 1.1, '2.0', 'Dataset Ingestion\n& Profiling')
    proc(3.8, 5.0, 2.8, 1.3, '3.0', 'ML Training &\nExperiment Mgmt')
    proc(3.8, 3.2, 2.8, 1.1, '4.0', 'Model Deployment\n& Endpoint Mgmt')
    proc(3.8, 1.5, 2.8, 1.1, '5.0', 'Inference &\nPrediction Service')
    proc(3.8, -0.3, 2.8, 1.1, '6.0', 'Classroom &\nLab Exam Mgmt')

    # Arrows: data stores ↔ processes
    def da(x1, y1, x2, y2, lbl='', bi=False):
        c = '#2e7d32'
        ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle='->', color=c, lw=1.0), zorder=3)
        if bi:
            ax.annotate('', xy=(x1, y1), xytext=(x2, y2),
                        arrowprops=dict(arrowstyle='->', color=c, lw=1.0), zorder=3)
        if lbl:
            ax.text((x1+x2)/2 + 0.1, (y1+y2)/2 + 0.1, lbl, fontsize=6.5, color=c)

    # D1 ↔ Process 1.0
    da(2.75, 9.05, 3.8, 9.1, bi=True)
    # D2 ↔ Process 2.0
    da(2.75, 7.75, 3.8, 7.4, bi=True)
    # D2,D3,D8 ↔ Process 3.0
    da(2.75, 7.75, 3.8, 6.2)
    da(2.75, 6.45, 3.8, 5.8, bi=True)
    da(2.75, -0.05, 3.8, 5.2, bi=True)
    # D3,D4 ↔ Process 4.0
    da(2.75, 6.45, 3.8, 3.8, bi=True)
    da(2.75, 5.15, 3.8, 3.6, bi=True)
    # D4,D5 ↔ Process 5.0
    da(2.75, 5.15, 3.8, 2.1)
    da(2.75, 3.85, 3.8, 2.0, bi=True)
    # D6 ↔ Process 5.0
    da(2.75, 2.55, 3.8, 1.8, bi=True)
    # D7 ↔ Process 6.0
    da(2.75, 1.25, 3.8, 0.2, bi=True)

    # External entity boxes (Level 1 right side)
    ext(7.5, 8.5, 2.5, 0.8, 'User / Learner', fc='#fafafa', ec='#424242')
    ext(7.5, 6.8, 2.5, 0.8, 'User / Learner', fc='#fafafa', ec='#424242')
    ext(7.5, 5.0, 2.5, 0.8, 'User / Learner', fc='#fafafa', ec='#424242')
    ext(7.5, 3.2, 2.5, 0.8, 'ML Engineer', fc='#fafafa', ec='#424242')
    ext(7.5, 1.5, 2.5, 0.8, 'External Client', fc='#fafafa', ec='#424242')
    ext(7.5, -0.3, 2.5, 0.8, 'Faculty', fc='#fafafa', ec='#424242')

    # Arrows processes → external entities
    da(6.6, 9.0, 7.5, 9.0)
    da(6.6, 7.3, 7.5, 7.3)
    da(6.6, 5.5, 7.5, 5.5)
    da(6.6, 3.7, 7.5, 3.7)
    da(6.6, 2.0, 7.5, 2.0)
    da(6.6, 0.2, 7.5, 0.2)

    # Level 2 note
    ax.text(10.0, 5.0,
            'LEVEL 2 (Process 3.0 Expanded):\n\n'
            '3.1  Job Validation & Initialisation\n'
            '3.2  Job Queue & Dispatch (→ Redis)\n'
            '3.3  Data Loading & Preprocessing\n'
            '3.4  Feature Engineering & Splitting\n'
            '3.5  Model Training & Optimisation\n'
            '3.6  Model Evaluation & Validation\n'
            '3.7  Model Serialisation & Registration',
            ha='left', va='center', fontsize=8.5, color='#333',
            bbox=dict(boxstyle='round,pad=0.4', facecolor='#fffde7', edgecolor='#f57f17', linewidth=1.5))

    plt.tight_layout()
    return to_b64(fig)


# ═══════════════════════════════════════════════════════════════════════════
# GENERATE ALL DIAGRAMS
# ═══════════════════════════════════════════════════════════════════════════
print("[1/5] Generating Use Case diagram ...")
d_usecase  = make_usecase()
print("[2/5] Generating Activity diagram ...")
d_activity = make_activity()
print("[3/5] Generating Sequence diagram ...")
d_sequence = make_sequence()
print("[4/5] Generating ER diagram ...")
d_er       = make_er()
print("[5/5] Generating DFD ...")
d_dfd      = make_dfd()
d_dfd2     = d_dfd
print("      All diagrams done.")


# ═══════════════════════════════════════════════════════════════════════════
# CSS
# ═══════════════════════════════════════════════════════════════════════════
CSS = """
@page { size: A4; margin: 20mm 18mm 20mm 18mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "Times New Roman", Times, serif; font-size: 12pt;
       line-height: 1.85; color: #111; background: #fff; }

/* ── Cover ── */
.cover { page-break-after: always; text-align: center; padding: 35mm 20mm 20mm; }
.cover .uni  { font-size: 14pt; font-weight: bold; text-transform: uppercase; }
.cover .dept { font-size: 11pt; margin: 6px 0 14px; }
.cover hr.thick { border: none; border-top: 3px solid #111; margin: 10px 0; }
.cover hr.thin  { border: none; border-top: 1px solid #111; margin: 6px 0; }
.cover .title   { font-size: 20pt; font-weight: bold; text-transform: uppercase;
                  margin: 16px 0 8px; }
.cover .project { font-size: 15pt; font-weight: bold; color: #1a1a6e; margin: 8px 0 28px; }
.cover .lbl     { font-size: 11pt; color: #444; margin-top: 18px; }
.cover table    { margin: 12px auto; text-align: left; }
.cover td       { padding: 3px 12px; font-size: 11pt; }
.cover td:first-child { font-weight: bold; }
.cover .yr      { font-size: 12pt; font-weight: bold; margin-top: 36px; }

/* ── TOC ── */
.toc { page-break-after: always; }
.toc h2 { text-align: center; font-size: 16pt; text-transform: uppercase;
          border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 20px; }
.toc-row { display: flex; justify-content: space-between;
           border-bottom: 1px dotted #bbb; padding: 3px 0; font-size: 11pt; }
.toc-row.bold { font-weight: bold; margin-top: 12px; }
.toc-row.s1   { padding-left: 20px; }
.toc-row.s2   { padding-left: 40px; }

/* ── Page & Chapter structure ── */
.page-start { page-break-before: always; }
h1.chap { font-size: 16pt; font-weight: bold; text-transform: uppercase;
          border-bottom: 2px solid #111; padding-bottom: 6px;
          margin-bottom: 18px; }
h2.sec  { font-size: 13pt; font-weight: bold; margin-top: 22px; margin-bottom: 10px; }
h3.sub  { font-size: 12pt; font-weight: bold; margin-top: 16px; margin-bottom: 8px; }
p  { margin-bottom: 10px; text-align: justify; }
ul, ol { margin: 8px 0 12px 24px; }
li { margin-bottom: 5px; }

/* ── Tables ── */
table.data { width: 100%; border-collapse: collapse; margin: 14px 0;
             font-size: 10.5pt; page-break-inside: avoid; }
table.data th { background: #dde; border: 1px solid #555;
                padding: 6px 10px; text-align: left; font-weight: bold; }
table.data td { border: 1px solid #aaa; padding: 5px 10px; vertical-align: top; }
table.data tr:nth-child(even) td { background: #f5f5f5; }

/* ── Diagram pages ── */
.diag-page { page-break-before: always; page-break-after: always;
             padding: 10px 0; }
.diag-page h2 { text-align: center; font-size: 14pt; font-weight: bold;
                border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 14px; }
.diag-page .desc { font-size: 11pt; margin-bottom: 12px; text-align: justify; }
.diag-page .key  { font-size: 10.5pt; margin-bottom: 12px; }
.diag-page .cap  { text-align: center; font-size: 10pt; font-style: italic;
                   color: #555; margin-top: 8px; }
"""


# ═══════════════════════════════════════════════════════════════════════════
# HTML BODY
# ═══════════════════════════════════════════════════════════════════════════
BODY = f"""

<!-- ═══════════════ COVER PAGE ═══════════════ -->
<div class="cover">
  <div class="uni">Department of Computer Science &amp; Engineering</div>
  <div class="dept">Bachelor of Technology — Software Engineering Lab</div>
  <hr class="thick"><hr class="thin">
  <div class="title">Software Engineering<br>Project Report</div>
  <hr class="thin"><hr class="thick">
  <div class="project">ML Playground<br>
    <span style="font-size:12pt;font-weight:normal;">
      An Enterprise Machine Learning Training &amp; Deployment Platform
    </span>
  </div>
  <div class="lbl">Submitted by</div>
  <table>
    <tr><td>Name :</td><td>Rushil Mehta</td></tr>
    <tr><td>Roll No. :</td><td>&nbsp;</td></tr>
    <tr><td>Semester / Year :</td><td>&nbsp;</td></tr>
    <tr><td>Subject :</td><td>Software Engineering</td></tr>
    <tr><td>Subject Code :</td><td>&nbsp;</td></tr>
  </table>
  <div class="lbl">Under the guidance of</div>
  <div style="font-size:12pt;font-weight:bold;margin-top:6px;">&nbsp;</div>
  <div class="yr">Academic Year : 2025 – 2026</div>
</div>


<!-- ═══════════════ TABLE OF CONTENTS ═══════════════ -->
<div class="toc">
  <h2>Table of Contents</h2>

  <div class="toc-row bold"><span>Chapter 1 — Introduction to Project</span><span>1</span></div>
  <div class="toc-row s1"><span>1.1 Overview</span><span>1</span></div>
  <div class="toc-row s1"><span>1.2 Project Objective</span><span>2</span></div>
  <div class="toc-row s1"><span>1.3 Scope of the Project</span><span>3</span></div>

  <div class="toc-row bold"><span>Chapter 2 — System Analysis and Design</span><span>5</span></div>
  <div class="toc-row s1"><span>2.1 Disadvantages of Current Platforms</span><span>5</span></div>
  <div class="toc-row s1"><span>2.2 Proposed System</span><span>6</span></div>
  <div class="toc-row s1"><span>2.3 Requirements Gathering Methods</span><span>7</span></div>
  <div class="toc-row s1"><span>2.4 Functional Requirements</span><span>8</span></div>
  <div class="toc-row s1"><span>2.5 Non-Functional Requirements</span><span>10</span></div>
  <div class="toc-row s1"><span>2.6 UML Diagrams</span><span>11</span></div>
  <div class="toc-row s2"><span>2.6.1 Use Case Diagram</span><span>11</span></div>
  <div class="toc-row s2"><span>2.6.2 Activity Diagram</span><span>12</span></div>
  <div class="toc-row s2"><span>2.6.3 Sequence Diagram</span><span>13</span></div>
  <div class="toc-row s2"><span>2.6.4 Entity-Relationship (ER) Diagram</span><span>14</span></div>
  <div class="toc-row s2"><span>2.6.5 Data Flow Diagram (DFD)</span><span>15</span></div>

  <div class="toc-row bold"><span>Chapter 3 — Implementation of Project</span><span>16</span></div>
  <div class="toc-row s1"><span>3.1 Login Page</span><span>16</span></div>
  <div class="toc-row s1"><span>3.2 Landing Page — Project Gatekeeper</span><span>17</span></div>
  <div class="toc-row s1"><span>3.3 Page 1 — Datasets &amp; Profiler</span><span>18</span></div>
  <div class="toc-row s1"><span>3.4 Page 2 — Pipeline (Code Studio)</span><span>19</span></div>
  <div class="toc-row s1"><span>3.5 Page 3 — Training &amp; Experiments</span><span>20</span></div>
  <div class="toc-row s1"><span>3.6 Page 4 — Model Deployments</span><span>21</span></div>
  <div class="toc-row s1"><span>3.7 Page 5 — Classroom (Lab Exam)</span><span>22</span></div>

  <div class="toc-row bold"><span>Chapter 4 — Observations</span><span>23</span></div>
  <div class="toc-row s1"><span>4.1 Problems Encountered</span><span>23</span></div>
  <div class="toc-row s1"><span>4.2 Lessons Learned</span><span>24</span></div>

  <div class="toc-row bold"><span>Chapter 5 — Conclusion &amp; Future Enhancement</span><span>25</span></div>
  <div class="toc-row s1"><span>5.1 Conclusion</span><span>25</span></div>
  <div class="toc-row s2"><span>5.1.1 Main Target</span><span>26</span></div>
  <div class="toc-row s1"><span>5.2 Future Enhancement</span><span>26</span></div>
</div>


<!-- ═══════════════ CHAPTER 1 ═══════════════ -->
<div class="page-start">
<h1 class="chap">Chapter 1 — Introduction to Project</h1>

<h2 class="sec">1.1 Overview</h2>
<p>
ML Playground is a browser-based machine learning platform that lets a user go from a raw CSV file all the way to a live prediction REST API, without writing a single line of machine learning code. It was built to remove the friction that keeps beginners away from machine learning — no local installations, no blank-slate notebooks, no guessing what to do next.
</p>
<p>
From the user's perspective the platform has five main navigation areas accessed from an icon-based sidebar: Datasets &amp; Profiler, Pipeline (Code Studio), Training &amp; Experiments, Model Deployments, and Classroom (Lab Exam). There is also a Login page for authentication and a User Guide page that works as a built-in ML encyclopedia. Together these form a complete, end-to-end machine learning workflow inside one web app.
</p>
<p>
The technology stack is modern and production-grade. The frontend is a React 19 single-page application written in TypeScript, bundled with Vite. The backend is a FastAPI (Python) REST API with SQLAlchemy 2.0 async ORM, PostgreSQL as the primary database, Redis as the job queue and session cache, and Celery workers that handle model training in the background. All services run inside Docker containers with a docker-compose setup that ensures consistent, reproducible deployments.
</p>

<h2 class="sec">1.2 Project Objective</h2>
<ul>
  <li>Build a single web platform where anyone can upload data, train a model, inspect results, and deploy a live prediction endpoint — with zero local software installation.</li>
  <li>Provide seven built-in benchmark datasets (Titanic, Iris, Breast Cancer, Housing Prices, Credit Risk, Telecom Churn, Student Performance) for immediate hands-on practice.</li>
  <li>Auto-generate the Python training script so users can read, learn from, and optionally modify the code that trains their model.</li>
  <li>Support nine supervised learning algorithms — Logistic Regression, Linear Regression, Decision Tree, Random Forest, K-Nearest Neighbours, SVM, Gradient Boosting, XGBoost, and LightGBM — all accessible through the same interface.</li>
  <li>Provide a Classroom module where faculty can create a lab exam, students join with a code, write and run ML code inside a timed Safe Exam Mode, and faculty grades the results.</li>
  <li>Deploy any trained model as a local REST API endpoint with one click, and allow interactive live testing inside the Deployment Studio.</li>
  <li>Demonstrate real-world software engineering practices: asynchronous job queuing, role-based access control, Server-Sent Events for real-time updates, and containerised deployment.</li>
</ul>

<h2 class="sec">1.3 Scope of the Project</h2>
<h3 class="sub">Inside Scope</h3>
<ul>
  <li><strong>Data ingestion:</strong> CSV upload (drag-and-drop or file picker) and seven one-click benchmark datasets. Profiling runs entirely client-side — no server round-trip needed for data analysis.</li>
  <li><strong>Algorithm selection and recommendation:</strong> Nine supervised algorithms with auto-recommendations based on dataset characteristics (task type, row count, column types).</li>
  <li><strong>Model training:</strong> Background Celery workers handle training. Real-time progress (percentage, current stage) is streamed to the browser via Server-Sent Events (SSE).</li>
  <li><strong>Model evaluation:</strong> Accuracy, F1 score, precision, recall, RMSE, R-squared, and SHAP feature importance. Experiment Leaderboard compares multiple training runs.</li>
  <li><strong>Code generation:</strong> Auto-generated Python training script shown in a Monaco editor. Users can read, edit, and re-run the code.</li>
  <li><strong>Model deployment:</strong> One-click local REST API deployment. Deployment Studio provides live prediction testing and shows prediction history and drift monitoring.</li>
  <li><strong>Model Registry:</strong> Tracks all registered model versions with lineage from dataset → training job → deployment. Supports Champion model promotion.</li>
  <li><strong>Classroom / Lab Exam:</strong> Faculty creates classrooms, sets exam timers, students attempt the exam inside a Safe Exam Mode that logs tab-switch violations.</li>
  <li><strong>Authentication:</strong> JWT-based login and registration. Role-based access: platform_owner, org_admin, faculty, lab_coordinator, reviewer, learner.</li>
  <li><strong>User Guide:</strong> Built-in encyclopaedia explaining all algorithms, hyperparameters, and evaluation metrics in plain language.</li>
</ul>
<h3 class="sub">Outside Scope</h3>
<ul>
  <li>Deep learning or neural networks (no PyTorch or TensorFlow support).</li>
  <li>AutoML automatic hyperparameter search (users configure manually).</li>
  <li>Real-time or streaming data ingestion — only static file uploads are supported.</li>
  <li>Native mobile applications — the platform is web-only.</li>
  <li>Cloud deployment of trained models (only local deployments in the current version).</li>
</ul>
</div><!-- /chapter 1 -->


<!-- ═══════════════ CHAPTER 2 ═══════════════ -->
<div class="page-start">
<h1 class="chap">Chapter 2 — System Analysis and Design</h1>

<h2 class="sec">2.1 Disadvantages of Current Platforms</h2>
<p>Before building ML Playground, we examined tools commonly used to learn and practice machine learning:</p>
<table class="data">
  <tr><th>Problem</th><th>Explanation</th></tr>
  <tr><td>High setup barrier</td><td>Local Jupyter setups require Python, pip, virtual environments, and library installations that regularly break on Windows and can take hours before any actual ML work begins.</td></tr>
  <tr><td>No guided workflow</td><td>Notebooks give you a blank page. Beginners must figure out the correct sequence — load data, clean it, split it, train a model, evaluate it — entirely on their own.</td></tr>
  <tr><td>No deployment path</td><td>Deploying a trained model as a REST API requires separate skills (Flask, FastAPI, Docker). Most learners never reach this stage.</td></tr>
  <tr><td>No education layer</td><td>No built-in classroom feature exists in Colab or Jupyter. Instructors cannot assign tasks, collect student results, and grade them inside the same tool.</td></tr>
  <tr><td>No code generation</td><td>Users write all the training code themselves, often copying from tutorials without understanding what each line does.</td></tr>
  <tr><td>No experiment tracking</td><td>Comparing two training runs (different algorithms or hyperparameters) requires manually tracking metrics in a spreadsheet or an external tool like MLflow.</td></tr>
  <tr><td>Session instability</td><td>Google Colab disconnects after idle time. Long training runs get silently interrupted without warning.</td></tr>
</table>

<h2 class="sec">2.2 Proposed System</h2>
<p>ML Playground combines the full ML workflow into a single web application. Key improvements over existing tools:</p>
<ul>
  <li><strong>Zero installation:</strong> Opens in any browser. Client-side profiling engine means data analysis needs no server.</li>
  <li><strong>Guided five-page workflow:</strong> Each page handles one stage. The sidebar makes the sequence clear.</li>
  <li><strong>Auto-generated Python code:</strong> Training script is shown in a Monaco editor. Users read and optionally modify it.</li>
  <li><strong>Experiment tracking:</strong> Training &amp; Experiments leaderboard shows all past runs with metrics side by side.</li>
  <li><strong>One-click deployment:</strong> Deploy any trained model as a local REST endpoint. Deployment Studio provides interactive testing.</li>
  <li><strong>Classroom for education:</strong> Faculty sets exam timer, students attempt the lab in Safe Exam Mode.</li>
</ul>
<table class="data">
  <tr><th>Layer</th><th>Technology</th><th>Purpose</th></tr>
  <tr><td>Frontend</td><td>React 19 + TypeScript + Vite</td><td>Single-page app, fast hot-reload, strict types</td></tr>
  <tr><td>Code Editor</td><td>Monaco Editor</td><td>VS Code-grade editor with Python IntelliSense</td></tr>
  <tr><td>Backend API</td><td>FastAPI (Python 3.11+)</td><td>Async REST API, auto-generated OpenAPI docs</td></tr>
  <tr><td>ORM</td><td>SQLAlchemy 2.0 async</td><td>Non-blocking database queries</td></tr>
  <tr><td>Database</td><td>PostgreSQL 16</td><td>Primary relational store: users, metadata, jobs, classrooms</td></tr>
  <tr><td>Object Storage</td><td>MinIO (S3-compatible API via Boto3)</td><td>High-throughput blob storage for uploaded datasets and serialized model artifacts</td></tr>
  <tr><td>Job Queue</td><td>Redis + Celery</td><td>Background ML training without blocking the API</td></tr>
  <tr><td>Real-time updates</td><td>SSE (Server-Sent Events)</td><td>Live training progress to the browser</td></tr>
  <tr><td>ML Engine</td><td>scikit-learn, XGBoost, LightGBM</td><td>Training and evaluation of supervised models</td></tr>
  <tr><td>Containerisation</td><td>Docker + docker-compose</td><td>Reproducible deployment of all services</td></tr>
</table>

<h2 class="sec">2.3 Requirements Gathering Methods</h2>
<h3 class="sub">2.3.1 Personal Experience and Pain Point Analysis</h3>
<p>First-hand experience with ML education tools revealed specific pain points: difficult environment setup, no clear workflow order, no easy deployment path, and no way to share work with an instructor. These were documented and converted directly into features.</p>
<h3 class="sub">2.3.2 Review of Existing Tools</h3>
<p>We studied Google Colab, Kaggle Notebooks, Jupyter Hub, H2O AutoML, and Azure ML Studio. For each we noted strengths and gaps. This competitive analysis shaped the initial feature list and helped prioritise what to build first.</p>
<h3 class="sub">2.3.3 Iterative Prototyping</h3>
<p>The platform was built page by page. Each page was tested against its intended requirement and refined. Features adding friction were removed; missing but expected features were added in the next iteration.</p>
<h3 class="sub">2.3.4 Use Case Identification</h3>
<p>By asking "what does a student, a faculty member, and a data scientist each need from this platform?" we identified the actors and use cases that form the use case diagram in section 2.6.1.</p>

<h2 class="sec">2.4 Functional Requirements</h2>
<table class="data">
  <tr><th>FR No.</th><th>Module</th><th>Requirement</th></tr>
  <tr><td>FR-01</td><td>Auth</td><td>Users must be able to register with email and password. Login must return a JWT access token.</td></tr>
  <tr><td>FR-02</td><td>Auth</td><td>System must support roles: platform_owner, org_admin, faculty, lab_coordinator, reviewer, learner.</td></tr>
  <tr><td>FR-03</td><td>Dataset</td><td>Users must upload CSV files via drag-and-drop or file picker.</td></tr>
  <tr><td>FR-04</td><td>Dataset</td><td>The system must profile the dataset client-side without a server call.</td></tr>
  <tr><td>FR-05</td><td>Dataset</td><td>Seven ready-made benchmark datasets must be available for one-click loading.</td></tr>
  <tr><td>FR-06</td><td>Dataset</td><td>The profiler must detect target leakage and warn the user before training.</td></tr>
  <tr><td>FR-07</td><td>Pipeline</td><td>System must auto-generate a Python training script for the selected algorithm and dataset.</td></tr>
  <tr><td>FR-08</td><td>Pipeline</td><td>Users must be able to edit the generated code in a Monaco editor and re-run it.</td></tr>
  <tr><td>FR-09</td><td>Training</td><td>Users must select features, target column, algorithm, and hyperparameters, then launch training.</td></tr>
  <tr><td>FR-10</td><td>Training</td><td>Training must run in the background. Real-time progress (%, stage) sent via SSE.</td></tr>
  <tr><td>FR-11</td><td>Training</td><td>Results page must show accuracy, F1, precision, recall, RMSE, R-squared, and SHAP feature importance.</td></tr>
  <tr><td>FR-12</td><td>Training</td><td>Experiment Leaderboard must compare all past training runs for a dataset.</td></tr>
  <tr><td>FR-13</td><td>Deployment</td><td>Any completed training job must be deployable as a local REST API endpoint with one click.</td></tr>
  <tr><td>FR-14</td><td>Deployment</td><td>Deployment Studio must allow entering feature values and getting a live prediction.</td></tr>
  <tr><td>FR-15</td><td>Deployment</td><td>Model Registry must show all versions with lineage (dataset → job → deployment).</td></tr>
  <tr><td>FR-16</td><td>Classroom</td><td>Faculty must create a classroom with a unique join code and exam time window.</td></tr>
  <tr><td>FR-17</td><td>Classroom</td><td>Students must join via join code, write ML code in Monaco editor, and submit results.</td></tr>
  <tr><td>FR-18</td><td>Classroom</td><td>Faculty must view each student's submitted metrics and assign a grade with comments.</td></tr>
  <tr><td>FR-19</td><td>Classroom</td><td>Safe Exam Mode must detect and log tab switches and copy-paste attempts.</td></tr>
  <tr><td>FR-20</td><td>Guide</td><td>A built-in User Guide page must explain all algorithms, metrics, and hyperparameters.</td></tr>
</table>

<h2 class="sec">2.5 Non-Functional Requirements</h2>
<table class="data">
  <tr><th>NFR No.</th><th>Category</th><th>Requirement</th></tr>
  <tr><td>NFR-01</td><td>Performance</td><td>Standard API responses (login, dataset fetch, job status) must complete within 500 ms under normal load.</td></tr>
  <tr><td>NFR-02</td><td>Performance</td><td>Client-side profiling of a 10,000-row CSV must complete within 3 seconds.</td></tr>
  <tr><td>NFR-03</td><td>Scalability</td><td>Celery worker pool must scale horizontally by increasing container replicas.</td></tr>
  <tr><td>NFR-04</td><td>Security</td><td>All endpoints except login and registration must require JWT authentication.</td></tr>
  <tr><td>NFR-05</td><td>Security</td><td>Passwords stored as bcrypt hashes. Plain-text passwords never stored or logged.</td></tr>
  <tr><td>NFR-06</td><td>Security</td><td>Rate limiting on public endpoints: 60 req/min per IP using slowapi.</td></tr>
  <tr><td>NFR-07</td><td>Reliability</td><td>Job status persisted in PostgreSQL. A Celery worker crash must not lose job metadata.</td></tr>
  <tr><td>NFR-08</td><td>Usability</td><td>UI must be fully usable at 1366×768 and above without horizontal scrolling.</td></tr>
  <tr><td>NFR-09</td><td>Maintainability</td><td>All schema changes via Alembic migration files. No manual SQL alterations.</td></tr>
  <tr><td>NFR-10</td><td>Portability</td><td>Full backend starts with <code>docker compose up</code> on any machine with Docker.</td></tr>
</table>

<h2 class="sec">2.6 UML Diagrams</h2>
<p>The following five diagrams describe the ML Playground system from different angles.
Each diagram is on a separate page for easy printing and individual reference.</p>
</div><!-- /chapter 2 text -->


<!-- ═══════════════ 2.6.1 USE CASE DIAGRAM ═══════════════ -->
<div class="diag-page">
  <h2>2.6.1 — Use Case Diagram</h2>
  <p class="desc">
    A <strong>Use Case Diagram</strong> shows the <em>actors</em> (people or systems that interact with
    the platform) and the <em>use cases</em> (actions they can perform). Lines connect each actor to the
    use cases they are allowed to trigger. This gives a bird's-eye view of the entire system's
    functionality and who uses each feature.
  </p>
  <p class="key">
    <strong>Actors:</strong> Guest, Learner (student), Faculty, Lab Coordinator, Org Admin, Platform Owner, Celery Worker (system).<br>
    <strong>&lt;&lt;include&gt;&gt;</strong> = step is always required (e.g., "Launch Training" always includes "Select Features &amp; Target").<br>
    <strong>&lt;&lt;extend&gt;&gt;</strong> = optional step (e.g., "Edit Code" extends "View Pipeline").
  </p>
  {img_tag(d_usecase, 'Use Case Diagram')}
  <p class="cap">Figure 2.6.1 — Use Case Diagram : ML Playground Platform</p>
</div>


<!-- ═══════════════ 2.6.2 ACTIVITY DIAGRAM ═══════════════ -->
<div class="diag-page">
  <h2>2.6.2 — Activity Diagram</h2>
  <p class="desc">
    An <strong>Activity Diagram</strong> shows a process step-by-step, including decision points
    (diamond shapes), parallel activities (fork/join bars), and swimlanes to show which component
    is responsible for each step. The diagram below traces the complete flow of a training job
    from clicking "Launch Training" to viewing results — across three swimlanes: User/Browser,
    FastAPI Backend, and Celery Worker.
  </p>
  <p class="key">
    <strong>Symbols:</strong> ◉ = Start node &nbsp;|&nbsp; ⊙ = End node &nbsp;|&nbsp;
    ◆ = Decision point &nbsp;|&nbsp; □ = Activity step
  </p>
  {img_tag(d_activity, 'Activity Diagram')}
  <p class="cap">Figure 2.6.2 — Activity Diagram : Training Job Workflow (User / Backend / Worker swimlanes)</p>
</div>


<!-- ═══════════════ 2.6.3 SEQUENCE DIAGRAM ═══════════════ -->
<div class="diag-page">
  <h2>2.6.3 — Sequence Diagram</h2>
  <p class="desc">
    A <strong>Sequence Diagram</strong> shows the exact messages exchanged between system components
    in time order, reading from top to bottom. Vertical dashed lines are <em>lifelines</em> representing
    each component. Horizontal arrows are <em>messages</em> (solid = request, dashed = response).
  </p>
  <p class="key">
    <strong>Flow A</strong>: User submits a training job → Backend creates Job record → Celery Worker
    trains model → SSE streams progress → User views results.<br>
    <strong>Flow B (bottom note)</strong>: User/External client sends prediction request →
    InferenceEngine returns prediction → result logged to database.
  </p>
  {img_tag(d_sequence, 'Sequence Diagram')}
  <p class="cap">Figure 2.6.3 — Sequence Diagram : Training Job Submission and Progress Tracking</p>
</div>


<!-- ═══════════════ 2.6.4 ER DIAGRAM ═══════════════ -->
<div class="diag-page">
  <h2>2.6.4 — Entity-Relationship (ER) Diagram</h2>
  <p class="desc">
    An <strong>ER Diagram</strong> shows the database structure: which tables (entities) exist,
    what attributes each table has, and how tables are related. The <em>cardinality</em> labels
    (1 and N) show how many records in one table relate to records in another.
    The schema is divided into two clusters: the <strong>ML Workflow Cluster</strong> (Organisation, User,
    Dataset, Job, LocalDeployment, LocalPredictionHistory, Workspace) and the
    <strong>Education Cluster</strong> (Course, Classroom, ClassroomMember, Assignment, Submission, Feedback).
  </p>
  <p class="key">
    <strong>Key:</strong> Blue text = Primary Key (PK) &nbsp;|&nbsp; Purple text = Foreign Key (FK)
  </p>
  {img_tag(d_er, 'ER Diagram')}
  <p class="cap">Figure 2.6.4 — Entity-Relationship Diagram : ML Playground PostgreSQL Database Schema</p>
</div>


<!-- ═══════════════ 2.6.5 DFD Level 0+1 ═══════════════ -->
<div class="diag-page">
  <h2>2.6.5a — Data Flow Diagram (DFD) — Level 0 &amp; Level 1</h2>
  <p class="desc">
    A <strong>Data Flow Diagram</strong> shows how data moves through the system.
    <em>External entities</em> (rectangles) are sources or sinks of data outside the system.
    <em>Processes</em> (rounded rectangles) transform data.
    <em>Data stores</em> (open parallel-line boxes) hold data at rest.
    <em>Arrows</em> show named data flows between elements.
  </p>
  <p class="key">
    <strong>Level 0 (Context Diagram — top half):</strong> The entire ML Playground shown as a single
    process with all external entities (User, Faculty, Org Admin, External API Client) and their
    high-level data flows in and out.<br><br>
    <strong>Level 1 (Major Processes — bottom half):</strong> The system is broken into 6 major processes
    (1.0 Authentication, 2.0 Dataset Ingestion, 3.0 ML Training, 4.0 Model Deployment,
    5.0 Inference, 6.0 Classroom) each connected to their relevant data stores (D1–D8).
  </p>
  {img_tag(d_dfd, 'DFD Level 0 and Level 1')}
  <p class="cap">Figure 2.6.5a — Data Flow Diagram : Level 0 Context Diagram &amp; Level 1 Major Processes</p>
</div>


<!-- ═══════════════ 2.6.5b DFD LEVEL 2 ═══════════════ -->
<div class="diag-page">
  <h2>2.6.5b — Data Flow Diagram (DFD) — Level 2 : Process 3.0 Decomposition</h2>
  <p class="desc">
    Level 2 DFD zooms into <strong>Process 3.0 — ML Training &amp; Experiment Management</strong>
    from Level 1 and breaks it down into seven sub-processes. This shows exactly how data moves
    through the training pipeline — from a user submitting a training request all the way to a
    trained model artifact being saved and results being sent back to the browser via SSE.
  </p>
  <p class="key">
    <strong>3.1 Job Validation &amp; Initialisation</strong> — Validates the training config (algorithm, features, target) received from the user and creates the Job record in PostgreSQL.<br>
    <strong>3.2 Job Dispatch → Redis Queue</strong> — Serialises the validated job spec and places it onto the Redis task queue for a Celery worker to pick up.<br>
    <strong>3.3 Data Loading &amp; Validation</strong> — Celery worker dequeues the task, reads the dataset file from the file store (D2), and validates it.<br>
    <strong>3.4 Feature Engineering &amp; Train/Test Split</strong> — Cleans the data, applies encoding and scaling, and splits it into an 80% training set and 20% test set.<br>
    <strong>3.5 Model Training &amp; Optimisation</strong> — Trains the selected ML algorithm on the training set using the configured hyperparameters.<br>
    <strong>3.6 Model Evaluation &amp; Metric Computation</strong> — Runs the trained model on the test set, computes metrics (accuracy, F1, RMSE, R²) and SHAP feature importance values.<br>
    <strong>3.7 Artifact Save &amp; Model Registration</strong> — Serialises the trained model to a .pkl file, saves it to the artifact store (D4), updates the Job record to COMPLETED with all metrics, and stores an experiment history record.
  </p>
  {img_tag(d_dfd2, 'DFD Level 2')}
  <p class="cap">Figure 2.6.5b — DFD Level 2 : Decomposition of Process 3.0 — ML Training &amp; Experiment Management</p>
</div>


<!-- ═══════════════ CHAPTER 3 ═══════════════ -->
<div class="page-start">
<h1 class="chap">Chapter 3 — Implementation of Project</h1>
<p>
This chapter describes the user interface pages implemented in ML Playground as they exist in the actual
codebase. The frontend uses React 19 with TypeScript. All pages share the
<strong>BB (Blueberry-Bordeaux)</strong> dark design system — a deep navy-purple background,
subtle purple borders, gold accent for warnings, and maroon for primary action buttons.
A narrow icon-only sidebar on the left has five navigation icons:
Database (Datasets), Code2 (Pipeline), BarChart2 (Training), Rocket (Deployments), GraduationCap (Classroom).
</p>

<h2 class="sec">3.1 Login Page</h2>
<p>
The Login Page (<code>LoginPage.tsx</code>) is the entry point for users who want access to
backend-connected features (saving datasets to the server, running training jobs on the backend,
using the classroom). It combines new user registration and existing user login on the same screen
using a tab switcher at the top of the form card.
</p>
<ul>
  <li><strong>Login tab:</strong> Email and password fields. On success, the FastAPI backend returns a
      JWT access token stored in local storage and sent as a Bearer header in all subsequent API calls.
      The token payload includes user ID, email, and role so the frontend makes role-based display
      decisions without an extra request.</li>
  <li><strong>Register tab:</strong> Full name, email, password, and confirm password. Backend validates
      email uniqueness, hashes with bcrypt, creates a User record linked to the default organisation,
      and returns a JWT so the user is logged in immediately after registration.</li>
  <li><strong>Guest mode:</strong> Users who skip login can still use the dataset profiler and code studio
      locally in the browser. Backend features show a "Sign In required" prompt.</li>
  <li><strong>Error handling:</strong> Inline error messages appear below each field (not a generic alert).
      A global Axios interceptor catches 401 responses and redirects to the Login page with a
      "Session expired" message.</li>
</ul>

<h2 class="sec">3.2 Landing Page — Project Gatekeeper</h2>
<p>
The Project Gatekeeper (<code>ProjectGatekeeper.tsx</code>) is the first screen shown when the
Datasets &amp; Profiler tab is opened without an active dataset. It is the data entry point — the
user must pick or upload a dataset here before proceeding.
</p>
<ul>
  <li><strong>Upload area (top):</strong> Full-width drag-and-drop zone. Validates file format and size
      in the browser before any upload.</li>
  <li><strong>Recent uploads (left column):</strong> Up to five recently used datasets from local storage.
      One click re-loads the dataset without re-uploading.</li>
  <li><strong>Ready-made datasets (centre column):</strong> Seven benchmark datasets built into the app —
      Titanic, Iris, Student Performance, Breast Cancer, California Housing, Credit Risk,
      Telecom Churn. Each has a one-click "Try" button.</li>
  <li><strong>User guide tips (right column):</strong> Five concise steps reminding the user of the
      workflow: upload → profile → configure → train → deploy.</li>
</ul>
<p>
When a dataset is selected, a <strong>Step 2 modal</strong> asks for an experiment file name
(default: <code>experiment_1.py</code>). This name becomes the identifier for the generated Python
code file in the Code Studio. After confirming, the user goes to the Dataset Profiler page and the
<code>ProjectContext</code> is populated with the dataset.
</p>

<h2 class="sec">3.3 Page 1 — Datasets &amp; Profiler</h2>
<p>
The Dataset Profiler Page (<code>DatasetProfilerPage.tsx</code>) is the first page in the main workflow.
It is a four-panel resizable grid giving a complete statistical picture of the uploaded dataset.
</p>
<ul>
  <li><strong>Panel 1 — Data Preview:</strong> Paginated scrollable table showing dataset rows with a
      search bar. A full-screen icon opens an expanded table view.</li>
  <li><strong>Panel 2 — Column Statistics:</strong> For each column: data type, unique value count,
      missing value percentage, mean/median/std (numeric), top frequencies (categorical).
      An "Upload new" button is in this panel for convenience.</li>
  <li><strong>Panel 3 — Data Health Report (DataGovernanceCard):</strong> Quality score out of 100
      with itemised deduction breakdown: missing values, duplicate rows, constant columns,
      high-cardinality columns, type mismatches, and target leakage. An "Explain" button opens
      a modal with the exact deduction for each issue.</li>
  <li><strong>Panel 4 — Algorithm Recommendations (AlgorithmRecommendationPanel):</strong> Based on
      dataset characteristics, the system recommends the ML task type (classification/regression)
      and ranks algorithms by suitability score. The user also selects features and target column
      using the Feature/Target selector. A train/test split slider (default 80/20) is provided.
      "Launch Training" creates the job and navigates to the Pipeline page.</li>
</ul>
<p>An AI Copilot drawer (top-right button) lets users ask questions about the dataset in natural language.</p>

<h2 class="sec">3.4 Page 2 — Pipeline (Code Studio)</h2>
<p>
The View-as-Code Studio (<code>ViewAsCodeStudio.tsx</code>) shows the auto-generated Python training
script and allows editing and execution.
</p>
<ul>
  <li><strong>File explorer sidebar:</strong> A mini file tree of all experiment Python files. Users can
      create, rename, or delete files. Multiple experiments can be open simultaneously.</li>
  <li><strong>Monaco code editor:</strong> Full VS Code-grade editor with Python syntax highlighting,
      inline error squiggles (Pyflakes + PEP8), auto-completion, and ML-specific snippet suggestions.
      The generated script includes imports, data loading, preprocessing, model init, training,
      and evaluation.</li>
  <li><strong>Execution terminal:</strong> Bottom panel showing execution logs, errors, and output.
      ANSI colour codes are rendered correctly.</li>
  <li><strong>Run button:</strong> Dispatches a Celery task and starts training. SSE updates flow back
      showing current stage and progress percentage.</li>
  <li><strong>Pipeline Guardian modal:</strong> Pre-run code analysis that flags common mistakes
      (missing train/test split, wrong target reference) before submitting.</li>
  <li><strong>Regenerate Diff modal:</strong> When algorithm or hyperparameters change, shows a
      diff of what changed in the generated code before accepting.</li>
  <li><strong>AI Copilot drawer:</strong> Right-side chat drawer for code questions and suggestions.</li>
</ul>

<h2 class="sec">3.5 Page 3 — Training &amp; Experiments</h2>
<p>
The Training Results Page (<code>TrainingResultsPage.tsx</code>) shows the outcome of a completed or
in-progress training job. It has two views:
</p>
<ul>
  <li><strong>Overview view:</strong> Primary metric (accuracy for classification, R-squared/RMSE for
      regression) shown in a large circular ring chart. All metrics listed in a table with a
      horizontal progress bar and colour coding (green = good ≥ 85%, amber = moderate ≥ 70%,
      red = poor). <code>FeatureImportanceCard</code> shows a SHAP feature importance bar chart.
      <code>ThresholdOptimizer</code> lets users adjust the classification decision threshold and
      see precision/recall/F1 change in real time.</li>
  <li><strong>Leaderboard view (ExperimentLeaderboard):</strong> All past training runs for the
      current dataset side by side, sortable by any metric. "Deploy" button on any run deploys
      directly from the leaderboard.</li>
</ul>
<p>While training is in progress, a live SSE-driven progress bar updates with stage names and percentage.</p>

<h2 class="sec">3.6 Page 4 — Model Deployments</h2>
<p>
The Deployments Hub (<code>DeploymentsHub.tsx</code>) manages all deployed model endpoints.
It has two tabs:
</p>
<ul>
  <li><strong>Endpoints tab:</strong> Lists all local deployments with status (RUNNING, STOPPED, FAILED,
      STARTING). Cards show model name, algorithm, total predictions, and action buttons
      (Start, Stop, Restart, Delete). "Open Studio" opens the Deployment Studio for that endpoint.</li>
  <li><strong>Model Registry tab:</strong> All model versions grouped by model family with lineage
      from dataset to training job to deployment. "Champion" badge marks the production model.
      Users can promote any version to Champion or archive old versions.</li>
</ul>
<p>
The <strong>Deployment Studio</strong> (<code>DeploymentStudio.tsx</code>) is a split-panel view with:
</p>
<ul>
  <li><strong>Prediction form:</strong> Auto-generated input fields for each feature column.
      User fills values and clicks "Predict" to get model output and confidence in real time.</li>
  <li><strong>Prediction history:</strong> Scrollable log of recent inputs/outputs with timestamps and
      latency values.</li>
  <li><strong>Drift Monitoring panel (DriftMonitoringPanel.tsx):</strong> Detects whether recent
      prediction inputs have drifted from the training data distribution — signals when it is time
      to retrain.</li>
</ul>

<h2 class="sec">3.7 Page 5 — Classroom (Lab Exam)</h2>
<p>
The Classroom Hub (<code>ClassroomHub.tsx</code>) supports structured lab practicals for university
settings. Behaviour differs by role:
</p>
<p><strong>Faculty / Lab Coordinator view:</strong></p>
<ul>
  <li>Create a classroom with name, course code, and term. A unique join code is auto-generated.</li>
  <li>Set exam start and end times. "Start Exam" opens the exam for all enrolled students simultaneously.</li>
  <li>Student Roster (<code>ClassroomRosterTab.tsx</code>): each student's enrolment number, division,
      batch, exam start time, and submission status.</li>
  <li>Open any student's submission to view metrics, code, and assign a grade
      (<code>StudentDetailsModal.tsx</code>).</li>
  <li>Projector View (<code>ProjectorViewModal.tsx</code>): live class leaderboard on a projector.</li>
</ul>
<p><strong>Student / Learner view:</strong></p>
<ul>
  <li>Enter join code to enrol (<code>ClassroomEntryView.tsx</code>). Provide name, enrolment number,
      division, and batch.</li>
  <li>Wait in Exam Lobby (<code>ExamLobbyView.tsx</code>) until faculty starts the exam. Countdown timer
      shows time remaining.</li>
  <li>Once started: Monaco editor with assigned dataset pre-loaded. Student writes training code, runs it,
      and submits.</li>
  <li><strong>Safe Exam Mode</strong> (<code>useSafeExamBrowser.tsx</code>): detects and logs tab switches,
      window blur, and copy-paste attempts. Violations recorded and shown to faculty as an audit log.
      <code>SafeExamViolationOverlay</code> warns the student after each violation.</li>
</ul>
</div><!-- /chapter 3 -->


<!-- ═══════════════ CHAPTER 4 ═══════════════ -->
<div class="page-start">
<h1 class="chap">Chapter 4 — Observations</h1>

<h2 class="sec">4.1 Problems Encountered</h2>

<h3 class="sub">4.1.1 SSE vs WebSocket for Training Progress</h3>
<p>The initial plan was to use WebSocket connections for live updates. However, WebSocket connections dropped when the user navigated between pages, causing missed progress events. Switching to Server-Sent Events (SSE) via <code>GET /jobs/&#123;id&#125;/stream</code> fixed this because SSE uses standard HTTP — the connection re-establishes naturally when the user returns to the Training page. SSE is also simpler to implement on the FastAPI side and does not require a protocol upgrade handshake.</p>

<h3 class="sub">4.1.2 Docker Startup Race Condition</h3>
<p>When all Docker containers started simultaneously, the FastAPI backend sometimes began accepting requests before Alembic migrations had finished creating the database schema. The first login attempt crashed with a "relation does not exist" error. The fix was a dedicated <code>migrate</code> container that runs <code>alembic upgrade head</code> and exits, with <code>api</code> and <code>worker</code> containers configured with <code>depends_on: migrate: condition: service_completed_successfully</code>.</p>

<h3 class="sub">4.1.3 Monaco Editor Focus Events in Safe Exam Mode</h3>
<p>When Safe Exam Mode was active, the browser's focus-detection logic incorrectly treated certain Monaco editor interactions (right-clicking for the context menu) as "tab switch" violations. This caused false violation warnings for students who had not left the page. The fix was to refine <code>useSafeExamBrowser</code> to distinguish between window-level blur events and editor-internal focus events, and to add a short debounce to prevent rapid-fire false triggers.</p>

<h3 class="sub">4.1.4 Client-Side Profiler Freezing the Browser</h3>
<p>With CSV files larger than 5 MB, the browser-side profiling engine blocked the main JavaScript thread for several seconds, freezing the UI. The fix was to move profiling computation into a Web Worker so the main thread remains responsive and the progress indicator updates smoothly during profiling.</p>

<h3 class="sub">4.1.5 Experiment Leaderboard Sorting with Mixed Metrics</h3>
<p>The leaderboard needed to sort runs by performance. But different algorithms produce different metric names (accuracy vs RMSE), and some are "lower is better" (RMSE, MAE) while others are "higher is better" (accuracy, F1). A <code>getPrimary()</code> function checks a priority metric list and a <code>REGRESSION_ERROR_METRICS</code> set inverts the sort direction for error metrics.</p>

<h2 class="sec">4.2 Lessons Learned</h2>
<ul>
  <li><strong>Design the database schema first.</strong> The hardest schema change — adding a <code>Course</code> table as parent of <code>Classroom</code> — would have been far more disruptive if done after the classroom API was deployed and in use. Spending time on the ER diagram upfront prevents expensive migrations later.</li>
  <li><strong>Async Python is worth the setup complexity.</strong> SQLAlchemy 2.0 async sessions allow the API to handle many concurrent SSE streams without blocking. A synchronous approach would need a much larger thread pool for the same concurrency.</li>
  <li><strong>Test Docker from day one.</strong> Waiting until late in development to test the full Docker stack meant multiple environment-specific issues surfaced simultaneously. Running docker-compose from week one catches port conflicts and network issues incrementally.</li>
  <li><strong>Monaco Editor requires dedicated integration time.</strong> Monaco is a full IDE engine with its own keyboard shortcuts, context menus, and focus model. These interact with the React application in non-obvious ways that require careful wrapping and testing.</li>
  <li><strong>Small UX details have large impact.</strong> The default experiment file name (<code>experiment_1.py</code>), the live progress percentage in the browser tab title, and colour-coded metric rows (green/amber/red) cost very little to implement but significantly raise the perceived quality of the platform.</li>
</ul>
</div><!-- /chapter 4 -->


<!-- ═══════════════ CHAPTER 5 ═══════════════ -->
<div class="page-start">
<h1 class="chap">Chapter 5 — Conclusion &amp; Future Enhancement</h1>

<h2 class="sec">5.1 Conclusion</h2>
<p>
ML Playground started as a frustration with the barriers that keep beginners away from machine learning and evolved into a full-stack web application with five main pages, a login system, a structured classroom lab exam feature, and a live model deployment engine. The platform demonstrates that it is possible to guide someone from a raw CSV file through data profiling, model training, result analysis, and API deployment — all inside a single browser session, with zero local installation.
</p>
<p>
From a software engineering perspective, the project covers a wide range of production-grade practices: asynchronous job processing with Celery and Redis, a proper relational schema with Alembic migrations, RBAC at both the API and UI level, Server-Sent Events for real-time updates, a Monaco-based code editor with live linting, and a Docker-compose stack that makes the entire platform portable.
</p>
<p>
The five software engineering diagrams — Use Case, Activity, Sequence, ER, and DFD — each capture a different dimension of the system and together provide a complete picture of what the platform does, who uses it, how data flows through it, and how its components communicate.
</p>

<h3 class="sub">5.1.1 Main Target</h3>
<p>
The central goal was to remove the friction that stops beginners from finishing a machine learning project. That goal has been achieved. A user who has never written Python can upload a CSV, explore the data, choose an algorithm, watch training complete with a real-time progress bar, view metrics and feature importance, and deploy a live prediction API — all in one afternoon.
</p>
<p>
For educators, the Classroom feature means that ML lab practicals can be conducted fully online. Faculty sets up an exam in minutes, students join from any browser, and results are automatically collected and ready to grade.
</p>

<h2 class="sec">5.2 Future Enhancement</h2>
<table class="data">
  <tr><th>Enhancement</th><th>Description</th><th>Priority</th></tr>
  <tr><td>AutoML / Hyperparameter Search</td>
      <td>Add automatic hyperparameter optimisation using Optuna or scikit-learn's GridSearchCV. The system tries several configurations and presents the best one automatically.</td>
      <td>High</td></tr>
  <tr><td>Deep Learning Support</td>
      <td>Add simple neural network training using PyTorch. A visual layer builder lets users configure layers and neurons. Backend uses GPU workers if available.</td>
      <td>High</td></tr>
  <tr><td>Cloud Deployment</td>
      <td>Allow one-click deployment to cloud platforms (AWS Lambda, Google Cloud Run) so the prediction endpoint is publicly accessible, not just on the local machine.</td>
      <td>High</td></tr>
  <tr><td>Portfolio Certificate</td>
      <td>After completing a full project (upload → train → deploy), issue a digitally signed PDF certificate with a QR code that anyone can scan to verify authenticity.</td>
      <td>Medium</td></tr>
  <tr><td>Multi-file Dataset Support</td>
      <td>Allow multiple CSV files with defined join keys — supporting relational datasets without requiring SQL knowledge.</td>
      <td>Medium</td></tr>
  <tr><td>Collaborative Workspace</td>
      <td>Multiple users co-edit pipeline code and share training results in real time, similar to Google Docs collaborative editing.</td>
      <td>Medium</td></tr>
  <tr><td>LLM-Powered Explanation</td>
      <td>Natural-language answers: user asks "why did the model predict this?" and gets a plain-English explanation generated from SHAP values and model metadata.</td>
      <td>Medium</td></tr>
  <tr><td>Mobile-Responsive UI</td>
      <td>A dedicated mobile layout allowing users to monitor training jobs and view results from a smartphone.</td>
      <td>Low</td></tr>
</table>

<p style="margin-top:20px;">
In conclusion, ML Playground is a meaningful step towards making machine learning accessible,
understandable, and usable — not just for professionals, but for anyone willing to give it a try.
</p>
</div><!-- /chapter 5 -->
"""

HTML = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Software Engineering Report — ML Playground</title>
<style>{CSS}</style>
</head>
<body>
{BODY}
</body>
</html>"""

with open(OUT_HTML, 'w', encoding='utf-8') as f:
    f.write(HTML)

size_kb = len(HTML) / 1024
print(f"\n[OK] HTML written => {OUT_HTML}")
print(f"     Size: {size_kb:,.1f} KB")
print("\nNow converting to PDF via Edge headless ...")
import subprocess, sys
edge_exe = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
result = subprocess.run([
    edge_exe, '--headless', '--disable-gpu',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=20000',
    f'--print-to-pdf={OUT_PDF}',
    f'file:///{OUT_HTML.replace(chr(92), "/")}'
], capture_output=True, text=True, timeout=60)
print(result.stdout or "(no stdout)")
print(result.stderr or "(no stderr)")
import os
if os.path.exists(OUT_PDF):
    size = os.path.getsize(OUT_PDF)
    print(f"\n[DONE] PDF => {OUT_PDF}  ({size/1024:.0f} KB)")
else:
    print("\n[WARN] PDF file not found - check Edge path")
