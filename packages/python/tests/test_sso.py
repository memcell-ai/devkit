import json

import httpx
import pytest

from memcell import AsyncMemCell, MemCell


def test_sso_sync():
    recorded = []

    def handler(request: httpx.Request) -> httpx.Response:
        u = str(request.url)
        method = request.method
        body = json.loads(request.content.decode()) if request.content else None
        recorded.append({"method": method, "url": u, "body": body})

        # GET /api/v1/organizations/acme/sso
        if method == "GET" and "/api/v1/organizations/acme/sso" in u:
            return httpx.Response(
                200,
                json={
                    "ok": True,
                    "providers": [
                        {
                            "id": "prov_1",
                            "providerId": "sso-acme-corp",
                            "domain": "acme.corp",
                            "issuer": "https://login.okta.com/oauth2/default",
                            "protocol": "saml",
                            "domainVerified": True,
                            "organizationId": "org_1",
                            "createdAt": "2026-10-01T12:00:00Z",
                            "updatedAt": "2026-10-01T12:00:00Z",
                        }
                    ],
                    "ssoEnforced": False,
                },
            )

        # POST /api/v1/organizations/acme/sso
        if (
            method == "POST"
            and "/api/v1/organizations/acme/sso" in u
            and "/token" not in u
            and "/verify" not in u
        ):
            return httpx.Response(
                200,
                json={
                    "ok": True,
                    "provider": {
                        "id": "prov_new",
                        "providerId": "sso-acme-saml",
                        "domain": body.get("domain", ""),
                        "issuer": body.get("issuer", ""),
                        "protocol": body.get("protocol", "saml"),
                        "domainVerified": False,
                        "organizationId": "org_1",
                        "createdAt": "2026-10-01T12:00:00Z",
                        "updatedAt": "2026-10-01T12:00:00Z",
                    },
                },
            )

        # POST /api/v1/organizations/acme/sso/token
        if method == "POST" and "/api/v1/organizations/acme/sso/token" in u:
            return httpx.Response(
                200,
                json={
                    "token": "dns_token_123",
                    "dnsRecordName": "_better-auth-token-sso-acme-saml.acme.corp",
                    "dnsRecordType": "TXT",
                    "domain": "acme.corp",
                },
            )

        # POST /api/v1/organizations/acme/sso/verify-domain
        if method == "POST" and "/api/v1/organizations/acme/sso/verify-domain" in u:
            return httpx.Response(200, json={"ok": True, "verified": True})

        # PATCH /api/v1/organizations/acme/sso/enforce
        if method == "PATCH" and "/api/v1/organizations/acme/sso/enforce" in u:
            return httpx.Response(
                200, json={"ok": True, "ssoEnforced": body.get("ssoEnforced", True)}
            )

        # DELETE /api/v1/organizations/acme/sso
        if method == "DELETE" and "/api/v1/organizations/acme/sso" in u:
            return httpx.Response(200, json={"ok": True})

        # GET /api/v1/auth/sso/lookup
        if method == "GET" and "/api/v1/auth/sso/lookup" in u:
            return httpx.Response(
                200,
                json={
                    "ssoAvailable": True,
                    "providerId": "sso-acme-corp",
                    "organizationSlug": "acme",
                    "organizationName": "Acme Global",
                    "ssoEnforced": True,
                },
            )

        return httpx.Response(404, json={"error": "not_found"})

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    memcell = MemCell(api_key="mc_key", http_client=mock_client)

    # 1. Get SSO status
    res = memcell.organizations.sso.get("acme")
    assert res.ok is True
    assert len(res.providers) == 1
    assert res.providers[0].domain == "acme.corp"
    assert res.sso_enforced is False

    # 2. Configure new provider
    prov = memcell.organizations.sso.configure(
        "acme",
        domain="acme.corp",
        issuer="https://idp.acme.corp",
        protocol="saml",
        saml_config={"entryPoint": "https://idp.acme.corp/sso"},
    )
    assert prov.id == "prov_new"
    assert prov.domain == "acme.corp"

    # 3. DNS token & verification
    tok = memcell.organizations.sso.get_verification_token("acme", "sso-acme-saml")
    assert tok.token == "dns_token_123"
    assert tok.dns_record_name == "_better-auth-token-sso-acme-saml.acme.corp"

    ver = memcell.organizations.sso.verify_domain("acme", "sso-acme-saml")
    assert ver.get("verified") is True

    # 4. Scoped organization handle and enforcement
    org = memcell.for_org("acme")
    enf = org.sso.set_enforcement(True)
    assert enf.get("ssoEnforced") is True

    # 5. Delete provider
    org.sso.delete("sso-acme-saml")

    # 6. Public domain discovery lookup
    lookup = memcell.organizations.sso.lookup("user@acme.corp")
    assert lookup.sso_available is True
    assert lookup.sso_enforced is True
    assert lookup.organization_name == "Acme Global"


@pytest.mark.asyncio
async def test_sso_async():
    def handler(request: httpx.Request) -> httpx.Response:
        u = str(request.url)
        method = request.method
        body = json.loads(request.content.decode()) if request.content else None

        if method == "GET" and "/api/v1/organizations/acme/sso" in u:
            return httpx.Response(
                200,
                json={
                    "ok": True,
                    "providers": [
                        {
                            "id": "prov_async",
                            "providerId": "sso-async-corp",
                            "domain": "async.corp",
                            "issuer": "https://login.okta.com",
                            "protocol": "saml",
                            "domainVerified": True,
                        }
                    ],
                    "ssoEnforced": True,
                },
            )

        if method == "PATCH" and "/api/v1/organizations/acme/sso/enforce" in u:
            return httpx.Response(
                200, json={"ok": True, "ssoEnforced": body.get("ssoEnforced", False)}
            )

        return httpx.Response(404, json={"error": "not_found"})

    mock_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    memcell = AsyncMemCell(api_key="mc_key", http_client=mock_client)

    org = memcell.for_org("acme")
    res = await org.sso.get()
    assert res.ok is True
    assert len(res.providers) == 1
    assert res.providers[0].domain == "async.corp"

    enf = await org.sso.set_enforcement(False)
    assert enf.get("ssoEnforced") is False

    await memcell.aclose()
