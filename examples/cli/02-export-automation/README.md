# Multi-Agent Export Automation (CLI)

Demonstrates how to automate exporting MemCell workspace memory pools into multi-agent markdown files:

1. `AGENTS.md` (universal format across autonomous coding & reasoning agents).
2. `CLAUDE.md` (Anthropic Claude Code harness).
3. `.cursorrules` (Cursor IDE agent harness).
4. `memories.json` (Structured JSON archive for downstream data pipelines).

---

## Running this Example

```bash
chmod +x backup-and-export.sh
./backup-and-export.sh <workspace-slug>
```
