# 07 — OAuth 2.0 Machine-to-Machine (M2M) Agent (Node.js)

## The Story

Production backend services and headless agent workers deployed in Kubernetes or serverless environments authenticate via OAuth 2.0 `client_credentials` (`clientId` + `clientSecret`) rather than static personal access tokens.

This example shows how `@memcell/sdk` handles M2M authentication natively:
1. **First-Class Credentials**: Pass `clientId` and `clientSecret` directly into `MemCell` constructor options or via `MEMCELL_CLIENT_ID` / `MEMCELL_CLIENT_SECRET`.
2. **Transparent Token Lifecycle**: Automatically exchanges credentials at `/oauth2/token`, caches the short-lived bearer token, and refreshes it 60 seconds prior to expiry.
3. **Concurrent Request Deduplication**: Coalesces parallel in-flight token refreshes into a single network request.

---

## Running this Example

```bash
export MEMCELL_CLIENT_ID="app_..."
export MEMCELL_CLIENT_SECRET="sec_..."
export MEMCELL_WORKSPACE="acme/compliance"
export MEMCELL_URL="https://memcell.ai"

pnpm start
```
