# OAuth 2.0 Machine-to-Machine (M2M) Agent (Node.js)

Demonstrates how to connect an autonomous agent service to MemCell using OAuth 2.0 client credentials (`clientId` + `clientSecret`):

1. **First-Class Credentials**: Pass `clientId` and `clientSecret` directly into `MemcellClient` constructor options or via standard environment variables (`MEMCELL_CLIENT_ID`, `MEMCELL_CLIENT_SECRET`).
2. **Transparent Token Lifecycle**: The SDK automatically exchanges credentials at `/oauth2/token`, caches the bearer token, and proactively refreshes it 60 seconds prior to expiry.
3. **Concurrent Request Deduplication**: Prevents thundering herds by coalescing concurrent in-flight token requests into a single promise.

---

## Running this Example

```bash
export MEMCELL_CLIENT_ID="app_..."
export MEMCELL_CLIENT_SECRET="sec_..."
export MEMCELL_WORKSPACE="acme/compliance"
export MEMCELL_URL="https://api.memcell.io"

pnpm start
```
