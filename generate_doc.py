import re
import subprocess
import os
import markdown

src_md = r"c:\Users\mehta\OneDrive\Desktop\ml-playground\software engineering.md"
out_html = r"c:\Users\mehta\OneDrive\Desktop\ml-playground\software_engineering.html"
out_pdf = r"c:\Users\mehta\OneDrive\Desktop\ml-playground\software engineering.pdf"

with open(src_md, "r", encoding="utf-8") as f:
    text = f.read()

# Convert markdown to html
html_content = markdown.markdown(
    text,
    extensions=["tables", "fenced_code", "toc", "sane_lists"]
)

# Convert mermaid code blocks to <div class="mermaid">
def replace_mermaid(match):
    code = match.group(1)
    # decode html entities if any
    code = code.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
    return f'<div class="mermaid">\n{code}\n</div>'

html_content = re.sub(
    r'<pre><code class="language-mermaid">(.*?)</code></pre>',
    replace_mermaid,
    html_content,
    flags=re.DOTALL
)

css = """
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

@page {
    size: A4;
    margin: 18mm 16mm 18mm 16mm;
    @bottom-right {
        content: counter(page);
    }
}

body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: 1.6;
    color: #1e293b;
    background-color: #ffffff;
    max-width: 900px;
    margin: 0 auto;
    padding: 20px;
    font-size: 13.5px;
}

h1, h2, h3, h4, h5, h6 {
    color: #0f172a;
    font-weight: 700;
    margin-top: 1.6em;
    margin-bottom: 0.6em;
    line-height: 1.25;
}

h1 {
    font-size: 26px;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 8px;
    margin-top: 0;
    color: #1e3a8a;
}

h2 {
    font-size: 20px;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 6px;
    color: #1d4ed8;
    page-break-after: avoid;
}

h3 {
    font-size: 16px;
    color: #2563eb;
    page-break-after: avoid;
}

h4 {
    font-size: 14px;
    color: #334155;
    page-break-after: avoid;
}

p, ul, ol {
    margin-bottom: 1em;
}

li {
    margin-bottom: 0.3em;
}

hr {
    border: none;
    border-top: 1px solid #cbd5e1;
    margin: 2em 0;
}

blockquote {
    border-left: 4px solid #3b82f6;
    padding: 8px 16px;
    margin: 1.2em 0;
    background: #f8fafc;
    color: #334155;
    border-radius: 0 6px 6px 0;
}

blockquote p {
    margin-bottom: 0.3em;
}

blockquote p:last-child {
    margin-bottom: 0;
}

table {
    width: 100%;
    border-collapse: collapse;
    margin: 1.5em 0;
    font-size: 12.5px;
    page-break-inside: avoid;
}

th, td {
    padding: 8px 12px;
    border: 1px solid #cbd5e1;
    text-align: left;
}

th {
    background-color: #f1f5f9;
    font-weight: 600;
    color: #1e293b;
}

tr:nth-child(even) {
    background-color: #f8fafc;
}

pre {
    background-color: #0f172a;
    color: #f8fafc;
    padding: 14px 16px;
    border-radius: 8px;
    overflow-x: auto;
    font-family: 'JetBrains Mono', Consolas, Monaco, monospace;
    font-size: 11.5px;
    line-height: 1.45;
    margin: 1.2em 0;
    page-break-inside: avoid;
}

code {
    font-family: 'JetBrains Mono', Consolas, Monaco, monospace;
    font-size: 12px;
    background-color: #f1f5f9;
    color: #0f172a;
    padding: 2px 5px;
    border-radius: 4px;
}

pre code {
    background-color: transparent;
    color: inherit;
    padding: 0;
    border-radius: 0;
}

.mermaid {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 16px;
    margin: 1.5em 0;
    display: flex;
    justify-content: center;
    page-break-inside: avoid;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.mermaid svg {
    max-width: 100% !important;
    height: auto !important;
}

@media print {
    body {
        max-width: 100%;
        padding: 0;
    }
    h1, h2, h3 {
        page-break-after: avoid;
    }
    pre, table, .mermaid {
        page-break-inside: avoid;
    }
}
"""

full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Software Engineering Diagrams — ML Playground</title>
<style>
{css}
</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>
    mermaid.initialize({{
        startOnLoad: true,
        theme: 'default',
        securityLevel: 'loose',
        flowchart: {{ useMaxWidth: true, htmlLabels: true, curve: 'basis' }}
    }});
</script>
</head>
<body>
{html_content}
</body>
</html>
"""

with open(out_html, "w", encoding="utf-8") as f:
    f.write(full_html)

print("Generated HTML successfully:", out_html)

# Export PDF using Microsoft Edge headless
edge_exe = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if os.path.exists(edge_exe):
    print("Compiling PDF with Edge headless...")
    cmd = [
        edge_exe,
        "--headless",
        "--disable-gpu",
        "--run-all-compositor-stages-before-draw",
        "--virtual-time-budget=6000",
        f"--print-to-pdf={out_pdf}",
        out_html
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if res.returncode == 0:
        print("Generated PDF successfully:", out_pdf)
    else:
        print("PDF export returned non-zero exit code:", res.returncode)

