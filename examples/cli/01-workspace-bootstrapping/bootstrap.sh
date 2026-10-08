#!/usr/bin/env bash
set -euo pipefail

# MemCell Workspace Bootstrapping Script
# Provisions an isolated workspace, sets up operational directives, and connects locally.

INSTANCE_URL="${MEMCELL_URL:-http://localhost:3000}"
WORKSPACE_NAME="Customer Support Ops"
WORKSPACE_SLUG="customer-support-$(date +%s | cut -c6-10)"

echo "=== Bootstrapping MemCell Workspace ==="
echo "Instance: $INSTANCE_URL"

# 1. Create the new workspace
echo "1. Creating workspace '$WORKSPACE_NAME'..."
memcell workspace new "$WORKSPACE_NAME" \
  --slug "$WORKSPACE_SLUG" \
  --description "Autonomous triage and escalation memory pool" \
  --url "$INSTANCE_URL"

# 2. Connect the current local directory
echo "2. Connecting local directory to $WORKSPACE_SLUG..."
memcell connect "$WORKSPACE_SLUG" --url "$INSTANCE_URL"

# 3. Seed foundational guard memories
echo "3. Seeding operational directives..."
memcell remember "Customer refund requests exceeding $200 must be escalated to a tier-2 supervisor" \
  --type guard \
  --scope workspace

memcell remember "All customer correspondence must maintain a courteous, professional tone" \
  --type directive \
  --scope workspace

# 4. Verify status
echo "4. Verifying workspace status..."
memcell status

echo "✓ Workspace bootstrapping complete."
