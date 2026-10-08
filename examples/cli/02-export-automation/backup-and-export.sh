#!/usr/bin/env bash
set -euo pipefail

# MemCell Multi-Agent Export Automation
# Exports memories into agents-md, claude-md, cursorrules, and raw JSON formats.

WORKSPACE="${1:-}"
OUTPUT_DIR="./exports/$(date +%Y%m%d_%H%M%S)"

if [ -z "$WORKSPACE" ]; then
  echo "Usage: ./backup-and-export.sh <workspace-slug>"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
echo "=== Exporting MemCell Workspace Context: $WORKSPACE ==="
echo "Output Directory: $OUTPUT_DIR"

# 1. Export as raw JSON
echo "1. Exporting JSON archive..."
memcell export "$WORKSPACE" --format json > "$OUTPUT_DIR/memories.json"

# 2. Export as universal AGENTS.md format
echo "2. Exporting AGENTS.md..."
memcell export "$WORKSPACE" --format agents-md > "$OUTPUT_DIR/AGENTS.md"

# 3. Export as CLAUDE.md
echo "3. Exporting CLAUDE.md..."
memcell export "$WORKSPACE" --format claude-md > "$OUTPUT_DIR/CLAUDE.md"

# 4. Export as .cursorrules
echo "4. Exporting .cursorrules..."
memcell export "$WORKSPACE" --format cursorrules > "$OUTPUT_DIR/.cursorrules"

echo "✓ Context export complete."
ls -lh "$OUTPUT_DIR"
