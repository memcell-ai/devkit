import httpx
import pytest

from memcell.auth import AuthManager


def test_auth_manager_api_key():
    auth = AuthManager(base_url="https://api.memcell.io", api_key="mc_live_123")
    header = auth.get_authorization_header()
    assert header == "Bearer mc_live_123"


def test_auth_manager_access_token():
    auth = AuthManager(base_url="https://api.memcell.io", access_token="jwt_abc_xyz")
    header = auth.get_authorization_header()
    assert header == "Bearer jwt_abc_xyz"


def test_auth_manager_m2m_caching_and_refresh():
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        if request.url.path == "/oauth2/token":
            call_count += 1
            body_str = request.content.decode("utf-8")
            assert "grant_type=client_credentials" in body_str
            assert "client_id=client_xyz" in body_str
            assert "client_secret=secret_xyz" in body_str
            assert "scope=memory%3Aread" in body_str or "scope=memory:read" in body_str
            return httpx.Response(
                200,
                json={
                    "access_token": "m2m_token_001",
                    "token_type": "Bearer",
                    "expires_in": 3600,
                },
            )
        return httpx.Response(404)

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    auth = AuthManager(
        base_url="https://api.memcell.io",
        client_id="client_xyz",
        client_secret="secret_xyz",
        scope="memory:read",
    )

    # 1st call -> token exchange
    header1 = auth.get_authorization_header(mock_client)
    assert header1 == "Bearer m2m_token_001"
    assert call_count == 1

    # 2nd call -> cached token
    header2 = auth.get_authorization_header(mock_client)
    assert header2 == "Bearer m2m_token_001"
    assert call_count == 1

    # Clear cache -> triggers new token exchange
    auth.clear_cache()
    header3 = auth.get_authorization_header(mock_client)
    assert header3 == "Bearer m2m_token_001"
    assert call_count == 2


@pytest.mark.asyncio
async def test_auth_manager_async_m2m():
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        if request.url.path == "/oauth2/token":
            call_count += 1
            return httpx.Response(
                200,
                json={
                    "access_token": f"m2m_async_token_00{call_count}",
                    "token_type": "Bearer",
                    "expires_in": 3600,
                },
            )
        return httpx.Response(404)

    mock_async_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    auth = AuthManager(
        base_url="https://api.memcell.io",
        client_id="cid_1",
        client_secret="csec_1",
    )

    header1 = await auth.get_authorization_header_async(mock_async_client)
    assert header1 == "Bearer m2m_async_token_001"
    assert call_count == 1

    header2 = await auth.get_authorization_header_async(mock_async_client)
    assert header2 == "Bearer m2m_async_token_001"
    assert call_count == 1
