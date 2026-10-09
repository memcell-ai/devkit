# OAuth 2.0 Machine-to-Machine (M2M) Agent (Python)

demonstrates how to connect an autonomous agent service to MemCell using OAuth 2.0 client credentials (`client_id` + `client_secret`):

1. **First-Class Credentials**: Pass `client_id` and `client_secret` directly into `MemcellClient` or `AsyncMemcellClient` constructor arguments, or rely on ambient environment variables (`MEMCELL_CLIENT_ID`, `MEMCELL_CLIENT_SECRET`).
2. **Transparent Token Lifecycle**: The SDK automatically exchanges credentials at `/oauth2/token`, caches the bearer token, and proactively refreshes it 60 seconds prior to expiry.
3. **Concurrent Async Deduplication**: Prevents duplicate token requests by coalescing concurrent in-flight token requests.

---

3# Running this Example

```bash
export MEMCELL_CLIENT_ID="app_..."
export MEMCELL_CLIENT_SECRET="sec_..."
export MEMCELL_WORKSPACE="acme/compliance"
export MEMCELL_URL="https://api.memcell.io"

python main.py
```
