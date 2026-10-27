from __future__ import annotations

import base64
import os
from pathlib import Path
from typing import Any
from urllib.parse import quote

from .models import (
    CreateSourceResponse,
    SourceItem,
    SourceType,
    SyncSourceResponse,
    WebhookIngestResponse,
)


def _parse_namespace(namespace: str) -> tuple[str, str]:
    parts = namespace.split("/")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise ValueError(
            f'Invalid namespace "{namespace}". Expected format "owner/workspace" (e.g. "acme/operations").'
        )
    return quote(parts[0], safe=""), quote(parts[1], safe="")


def _encode_file_payload(
    *,
    file_path: str | os.PathLike[str] | None = None,
    file_bytes: bytes | None = None,
    file_base64: str | None = None,
    filename: str | None = None,
) -> tuple[str | None, str | None]:
    resolved_name = filename
    resolved_b64 = file_base64
    if file_path is not None:
        p = Path(file_path)
        raw = p.read_bytes()
        resolved_b64 = base64.b64encode(raw).decode("ascii")
        if resolved_name is None:
            resolved_name = p.name
    elif file_bytes is not None:
        resolved_b64 = base64.b64encode(file_bytes).decode("ascii")
    return resolved_b64, resolved_name


def _serialize_webhook_doc(item: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    b64, fname = _encode_file_payload(
        file_path=item.get("file_path") or item.get("filePath"),
        file_bytes=item.get("file_bytes") or item.get("fileBytes"),
        file_base64=item.get("file_base64") or item.get("fileBase64"),
        filename=item.get("filename"),
    )
    if item.get("title") is not None:
        out["title"] = item["title"]
    if item.get("content") is not None:
        out["content"] = item["content"]
    if b64 is not None:
        out["fileBase64"] = b64
    if fname is not None:
        out["filename"] = fname
    mime = item.get("mime_type") or item.get("mimeType")
    if mime is not None:
        out["mimeType"] = mime
    ctype = item.get("content_type") or item.get("contentType")
    if ctype is not None:
        out["contentType"] = ctype
    uri = item.get("source_uri") or item.get("sourceUri")
    if uri is not None:
        out["sourceUri"] = uri
    if item.get("distill") is not None:
        out["distill"] = item["distill"]
    if item.get("metadata") is not None:
        out["metadata"] = item["metadata"]
    return out


class WorkspaceSourcesNamespace:
    """Synchronous workspace knowledge sources namespace (URL/sitemap, inbound webhook, GitHub)."""

    def __init__(self, client: Any) -> None:
        self._client = client

    def list(self, namespace: str) -> list[SourceItem]:
        owner, workspace = _parse_namespace(namespace)
        data = self._client._request("GET", f"/api/v1/{owner}/{workspace}/sources")
        return [SourceItem.model_validate(s) for s in (data.get("sources") or [])]

    def get(self, namespace: str, source_id: str) -> SourceItem:
        owner, workspace = _parse_namespace(namespace)
        data = self._client._request(
            "GET",
            f"/api/v1/{owner}/{workspace}/sources/{quote(source_id, safe='')}",
        )
        return SourceItem.model_validate(data.get("source") or {})

    def create(
        self,
        namespace: str,
        *,
        type: SourceType = "url",
        url: str | None = None,
        repo_full_name: str | None = None,
        default_branch: str | None = None,
        name: str | None = None,
        max_pages: int | None = None,
        distill_memories: bool | None = None,
        root_path: str | None = None,
        installation_id: str | None = None,
    ) -> CreateSourceResponse:
        owner, workspace = _parse_namespace(namespace)
        payload: dict[str, Any] = {"type": type}
        if url is not None:
            payload["url"] = url
        if repo_full_name is not None:
            payload["repoFullName"] = repo_full_name
        if default_branch is not None:
            payload["defaultBranch"] = default_branch
        if name is not None:
            payload["name"] = name
        if max_pages is not None:
            payload["maxPages"] = max_pages
        if distill_memories is not None:
            payload["distillMemories"] = distill_memories
        if root_path is not None:
            payload["rootPath"] = root_path
        if installation_id is not None:
            payload["installationId"] = installation_id

        data = self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/sources",
            json=payload,
        )
        return CreateSourceResponse.model_validate(data)

    def sync(
        self,
        namespace: str,
        source_id: str,
        *,
        distill_memories: bool | None = None,
        max_files: int | None = None,
        max_pages: int | None = None,
    ) -> SyncSourceResponse:
        owner, workspace = _parse_namespace(namespace)
        payload: dict[str, Any] = {}
        if distill_memories is not None:
            payload["distillMemories"] = distill_memories
        if max_files is not None:
            payload["maxFiles"] = max_files
        if max_pages is not None:
            payload["maxPages"] = max_pages

        data = self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/sources/{quote(source_id, safe='')}/sync",
            json=payload,
        )
        return SyncSourceResponse.model_validate(data)

    def ingest(
        self,
        namespace: str,
        source_id: str,
        *,
        title: str | None = None,
        content: str | None = None,
        file_path: str | os.PathLike[str] | None = None,
        file_bytes: bytes | None = None,
        file_base64: str | None = None,
        filename: str | None = None,
        mime_type: str | None = None,
        content_type: str | None = None,
        source_uri: str | None = None,
        distill: bool | None = None,
        distill_memories: bool | None = None,
        metadata: dict[str, Any] | None = None,
        documents: list[dict[str, Any]] | None = None,
        secret: str | None = None,
    ) -> WebhookIngestResponse:
        owner, workspace = _parse_namespace(namespace)
        payload = _serialize_webhook_doc(
            {
                "title": title,
                "content": content,
                "file_path": file_path,
                "file_bytes": file_bytes,
                "file_base64": file_base64,
                "filename": filename,
                "mime_type": mime_type,
                "content_type": content_type,
                "source_uri": source_uri,
                "distill": distill,
                "metadata": metadata,
            }
        )
        if documents is not None:
            payload["documents"] = [_serialize_webhook_doc(d) for d in documents]
        if distill_memories is not None:
            payload["distillMemories"] = distill_memories

        headers: dict[str, str] = {}
        if secret:
            headers["x-memcell-webhook-secret"] = secret

        data = self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/sources/{quote(source_id, safe='')}/ingest",
            headers=headers,
            json=payload,
        )
        return WebhookIngestResponse.model_validate(data)

    def delete(self, namespace: str, source_id: str) -> dict[str, bool]:
        owner, workspace = _parse_namespace(namespace)
        data = self._client._request(
            "DELETE",
            f"/api/v1/{owner}/{workspace}/sources/{quote(source_id, safe='')}",
        )
        return {"deleted": bool(data.get("deleted", True))}


class AsyncWorkspaceSourcesNamespace:
    """Asynchronous workspace knowledge sources namespace (URL/sitemap, inbound webhook, GitHub)."""

    def __init__(self, client: Any) -> None:
        self._client = client

    async def list(self, namespace: str) -> list[SourceItem]:
        owner, workspace = _parse_namespace(namespace)
        data = await self._client._request("GET", f"/api/v1/{owner}/{workspace}/sources")
        return [SourceItem.model_validate(s) for s in (data.get("sources") or [])]

    async def get(self, namespace: str, source_id: str) -> SourceItem:
        owner, workspace = _parse_namespace(namespace)
        data = await self._client._request(
            "GET",
            f"/api/v1/{owner}/{workspace}/sources/{quote(source_id, safe='')}",
        )
        return SourceItem.model_validate(data.get("source") or {})

    async def create(
        self,
        namespace: str,
        *,
        type: SourceType = "url",
        url: str | None = None,
        repo_full_name: str | None = None,
        default_branch: str | None = None,
        name: str | None = None,
        max_pages: int | None = None,
        distill_memories: bool | None = None,
        root_path: str | None = None,
        installation_id: str | None = None,
    ) -> CreateSourceResponse:
        owner, workspace = _parse_namespace(namespace)
        payload: dict[str, Any] = {"type": type}
        if url is not None:
            payload["url"] = url
        if repo_full_name is not None:
            payload["repoFullName"] = repo_full_name
        if default_branch is not None:
            payload["defaultBranch"] = default_branch
        if name is not None:
            payload["name"] = name
        if max_pages is not None:
            payload["maxPages"] = max_pages
        if distill_memories is not None:
            payload["distillMemories"] = distill_memories
        if root_path is not None:
            payload["rootPath"] = root_path
        if installation_id is not None:
            payload["installationId"] = installation_id

        data = await self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/sources",
            json=payload,
        )
        return CreateSourceResponse.model_validate(data)

    async def sync(
        self,
        namespace: str,
        source_id: str,
        *,
        distill_memories: bool | None = None,
        max_files: int | None = None,
        max_pages: int | None = None,
    ) -> SyncSourceResponse:
        owner, workspace = _parse_namespace(namespace)
        payload: dict[str, Any] = {}
        if distill_memories is not None:
            payload["distillMemories"] = distill_memories
        if max_files is not None:
            payload["maxFiles"] = max_files
        if max_pages is not None:
            payload["maxPages"] = max_pages

        data = await self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/sources/{quote(source_id, safe='')}/sync",
            json=payload,
        )
        return SyncSourceResponse.model_validate(data)

    async def ingest(
        self,
        namespace: str,
        source_id: str,
        *,
        title: str | None = None,
        content: str | None = None,
        file_path: str | os.PathLike[str] | None = None,
        file_bytes: bytes | None = None,
        file_base64: str | None = None,
        filename: str | None = None,
        mime_type: str | None = None,
        content_type: str | None = None,
        source_uri: str | None = None,
        distill: bool | None = None,
        distill_memories: bool | None = None,
        metadata: dict[str, Any] | None = None,
        documents: list[dict[str, Any]] | None = None,
        secret: str | None = None,
    ) -> WebhookIngestResponse:
        owner, workspace = _parse_namespace(namespace)
        payload = _serialize_webhook_doc(
            {
                "title": title,
                "content": content,
                "file_path": file_path,
                "file_bytes": file_bytes,
                "file_base64": file_base64,
                "filename": filename,
                "mime_type": mime_type,
                "content_type": content_type,
                "source_uri": source_uri,
                "distill": distill,
                "metadata": metadata,
            }
        )
        if documents is not None:
            payload["documents"] = [_serialize_webhook_doc(d) for d in documents]
        if distill_memories is not None:
            payload["distillMemories"] = distill_memories

        headers: dict[str, str] = {}
        if secret:
            headers["x-memcell-webhook-secret"] = secret

        data = await self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/sources/{quote(source_id, safe='')}/ingest",
            headers=headers,
            json=payload,
        )
        return WebhookIngestResponse.model_validate(data)

    async def delete(self, namespace: str, source_id: str) -> dict[str, bool]:
        owner, workspace = _parse_namespace(namespace)
        data = await self._client._request(
            "DELETE",
            f"/api/v1/{owner}/{workspace}/sources/{quote(source_id, safe='')}",
        )
        return {"deleted": bool(data.get("deleted", True))}


class ScopedWorkspaceSourcesSync:
    def __init__(self, sources_ns: WorkspaceSourcesNamespace, namespace: str) -> None:
        self._sources = sources_ns
        self.namespace = namespace

    def list(self) -> list[SourceItem]:
        return self._sources.list(self.namespace)

    def get(self, source_id: str) -> SourceItem:
        return self._sources.get(self.namespace, source_id)

    def create(self, **kwargs: Any) -> CreateSourceResponse:
        return self._sources.create(self.namespace, **kwargs)

    def sync(self, source_id: str, **kwargs: Any) -> SyncSourceResponse:
        return self._sources.sync(self.namespace, source_id, **kwargs)

    def ingest(self, source_id: str, **kwargs: Any) -> WebhookIngestResponse:
        return self._sources.ingest(self.namespace, source_id, **kwargs)

    def delete(self, source_id: str) -> dict[str, bool]:
        return self._sources.delete(self.namespace, source_id)


class ScopedWorkspaceSourcesAsync:
    def __init__(self, sources_ns: AsyncWorkspaceSourcesNamespace, namespace: str) -> None:
        self._sources = sources_ns
        self.namespace = namespace

    async def list(self) -> list[SourceItem]:
        return await self._sources.list(self.namespace)

    async def get(self, source_id: str) -> SourceItem:
        return await self._sources.get(self.namespace, source_id)

    async def create(self, **kwargs: Any) -> CreateSourceResponse:
        return await self._sources.create(self.namespace, **kwargs)

    async def sync(self, source_id: str, **kwargs: Any) -> SyncSourceResponse:
        return await self._sources.sync(self.namespace, source_id, **kwargs)

    async def ingest(self, source_id: str, **kwargs: Any) -> WebhookIngestResponse:
        return await self._sources.ingest(self.namespace, source_id, **kwargs)

    async def delete(self, source_id: str) -> dict[str, bool]:
        return await self._sources.delete(self.namespace, source_id)
