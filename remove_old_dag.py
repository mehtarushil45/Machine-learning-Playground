import sys

filepath = r"apps/web/src/features/pipelines/ViewAsCodeStudio.tsx"
with open(filepath, 'r', encoding='utf-8') as fh:
    lines = fh.readlines()

# Keep lines 0..1875 (0-indexed), skip 1876..2088, keep 2089..end
# Lines 1877-2089 in 1-indexed = indices 1876-2088 in 0-indexed
kept = lines[:1876] + lines[2089:]

with open(filepath, 'w', encoding='utf-8', newline='') as fh:
    fh.writelines(kept)

print(f"Done. Original lines: {len(lines)}, Kept: {len(kept)}, Removed: {len(lines)-len(kept)}")
