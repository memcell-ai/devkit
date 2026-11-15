# 07 — OAuth 2.0 Machine-to-Machine (M2M) Agent (Python)

## The Story

Headless Python workers and background agent services deployed in production authenticate with MemCell using OAuth 2.0 `client_credentials` (`client_id` + `client_secret`) instead of static personal access tokens.

This example demonstrates how `MemCell` and `AsyncMemCell` handle M2M authentication natively:
1. **First-Class Credentials**: Pass `client_id` and `client_secret` directly into the client constructor or via `MEMCELL_CLIENT_ID` / `MEMCELL_CLIENT_SECRET`.
2. **Transparent Token Lifecycle**: Automatically exchanges credentials at `/oauth2/token`, caches the bearer token, and proactively refreshes it 60 seconds before expiry.
3. **Concurrent Async Deduplication**: Coalesces concurrent token refresh calls so parallel coroutines share a single token exchange.

---

## Running this Example

```bash
export MEMCELL_CLIENT_ID="app_..."
export MEMCELL_CLIENT_SECRET="sec_..."
export MEMCELL_WORKSPACE="acme/compliance"
export MEMCELL_URL="https://memcell.ai"

python main.py
```
