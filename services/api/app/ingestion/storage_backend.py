"""Storage abstraction layer for dataset files.

Defines the StorageBackend Protocol so that all callers (ingestion_service,
ingestion_task) depend on the interface only — never on a concrete class.

Current implementation: LocalFileSystemBackend.
Future implementations (no caller changes required):
  - S3Backend: boto3 multipart upload to AWS S3 or MinIO.
  - GCSBackend: google-cloud-storage streaming upload.

The file naming convention ``{dataset_id}_{filename}.csv`` is deliberately
identical to the v1 upload endpoint so that ``find_dataset_path()`` in
``services/worker/core/dataset_loader.py`` resolves both v1 and v2 files
without any modification to that module.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Iterable, Protocol, runtime_checkable

from app.config import settings


# ---------------------------------------------------------------------------
# Value objects
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class StorageLocation:
    """Immutable descriptor of a persisted dataset file.

    Attributes:
        backend:    Identifier for the storage medium (``"local"`` | ``"s3"`` | ``"gcs"``).
        path:       Absolute filesystem path (local) or object key (remote).
        size_bytes: Number of bytes written.
        dataset_id: UUID string that forms the file's primary-key prefix.
        filename:   Sanitised original filename without the dataset_id prefix.
    """

    backend: str
    path: str
    size_bytes: int
    dataset_id: str
    filename: str


class StorageError(RuntimeError):
    """Raised when any storage backend operation fails irrecoverably."""


# ---------------------------------------------------------------------------
# Protocol  (the interface every caller depends on)
# ---------------------------------------------------------------------------


@runtime_checkable
class StorageBackend(Protocol):
    """Protocol for pluggable dataset file storage.

    All implementations must be stateless and thread-safe so that Celery
    workers and async FastAPI request handlers can share the same instance.

    Contract:
        - ``save_stream`` is the only method that performs I/O writes.
        - ``resolve_path`` is a pure computation — no I/O.
        - ``exists`` is a read-only probe — no side effects.
        - ``delete`` must be idempotent (no-op if absent).
    """

    def save_stream(
        self,
        chunks: Iterable[bytes],
        dataset_id: str,
        filename: str,
    ) -> StorageLocation:
        """Persist an iterable of byte chunks as a single atomic file.

        The caller is responsible for not exceeding any size limit before
        invoking this method.  The implementation writes chunks sequentially
        and must not buffer the full content.

        Args:
            chunks:     Iterator of raw byte chunks (e.g. 64 KB reads).
            dataset_id: UUID string used as the file's primary-key prefix.
            filename:   Sanitised original filename (e.g. ``"churn.csv"``).

        Returns:
            StorageLocation describing the persisted file.

        Raises:
            StorageError: On any persistence failure (disk full, permission, …).
        """
        ...  # pragma: no cover

    def resolve_path(self, dataset_id: str, filename: str) -> str:
        """Return the canonical storage path for ``(dataset_id, filename)``.

        For local backends this is an absolute filesystem path.
        For object-storage backends this is the object key.
        This method performs no I/O and does not guarantee the file exists.
        """
        ...  # pragma: no cover

    def exists(self, dataset_id: str, filename: str) -> bool:
        """Return ``True`` if the file is present in the storage backend."""
        ...  # pragma: no cover

    def delete(self, dataset_id: str, filename: str) -> None:
        """Remove the file from storage.  No-op if the file does not exist.

        Raises:
            StorageError: On unexpected I/O errors other than FileNotFoundError.
        """
        ...  # pragma: no cover


# ---------------------------------------------------------------------------
# Local filesystem implementation
# ---------------------------------------------------------------------------


class LocalFileSystemBackend:
    """Concrete StorageBackend that persists files to the local filesystem.

    Satisfies the StorageBackend Protocol via structural subtyping
    (``isinstance(backend, StorageBackend)`` returns ``True``).

    Args:
        base_dir: Root directory for all uploads.
                  Defaults to ``settings.upload_dir`` (e.g. ``"uploads"``).
    """

    def __init__(self, base_dir: str | None = None) -> None:
        self._base_dir: str = base_dir or settings.upload_dir

    # ------------------------------------------------------------------
    # StorageBackend interface
    # ------------------------------------------------------------------

    def save_stream(
        self,
        chunks: Iterable[bytes],
        dataset_id: str,
        filename: str,
    ) -> StorageLocation:
        """Write chunks sequentially to ``<base_dir>/<dataset_id>_<filename>``.

        Creates the base directory if it does not exist.  Raises
        StorageError on any OSError so callers receive a typed exception.
        """
        os.makedirs(self._base_dir, exist_ok=True)
        dest = self._build_path(dataset_id, filename)
        written = 0

        try:
            with open(dest, "wb") as fout:
                for chunk in chunks:
                    fout.write(chunk)
                    written += len(chunk)
        except OSError as exc:
            raise StorageError(
                f"LocalFileSystemBackend: failed writing to '{dest}': {exc}"
            ) from exc

        return StorageLocation(
            backend="local",
            path=dest,
            size_bytes=written,
            dataset_id=dataset_id,
            filename=filename,
        )

    def resolve_path(self, dataset_id: str, filename: str) -> str:
        """Return ``<base_dir>/<dataset_id>_<filename>`` without touching disk."""
        return self._build_path(dataset_id, filename)

    def exists(self, dataset_id: str, filename: str) -> bool:
        """Return ``True`` if the file exists on the local filesystem."""
        return os.path.isfile(self._build_path(dataset_id, filename))

    def delete(self, dataset_id: str, filename: str) -> None:
        """Remove the file.  Silently succeeds if the file is already absent."""
        path = self._build_path(dataset_id, filename)
        try:
            os.remove(path)
        except FileNotFoundError:
            pass  # idempotent
        except OSError as exc:
            raise StorageError(
                f"LocalFileSystemBackend: failed deleting '{path}': {exc}"
            ) from exc

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_path(self, dataset_id: str, filename: str) -> str:
        """Construct ``<base_dir>/<dataset_id>_<filename>``."""
        return os.path.join(self._base_dir, f"{dataset_id}_{filename}")

    def __repr__(self) -> str:  # pragma: no cover
        return f"LocalFileSystemBackend(base_dir={self._base_dir!r})"


# ---------------------------------------------------------------------------
# Backend factory  (the only place settings.storage_backend is read)
# ---------------------------------------------------------------------------


def get_configured_backend() -> "StorageBackend":
    """Return the storage backend instance selected by ``settings.storage_backend``.

    This is the single configuration point for storage backend selection.
    All callers receive a ``StorageBackend`` Protocol instance and have
    no knowledge of which concrete implementation is active.

    Supported values of ``settings.storage_backend``:
        ``"local"``  → ``LocalFileSystemBackend`` (default, no extra deps)
        ``"minio"``  → ``MinIOStorageBackend``    (requires boto3 + running MinIO)

    Raises:
        ValueError: If ``settings.storage_backend`` is not a recognised value.
    """
    backend_name = settings.storage_backend.lower().strip()

    if backend_name == "local":
        return LocalFileSystemBackend()

    if backend_name == "minio":
        # Deferred import — boto3 is only required when MinIO backend is selected.
        from app.ingestion.minio_backend import MinIOStorageBackend  # noqa: PLC0415
        return MinIOStorageBackend()

    raise ValueError(
        f"Unrecognised storage backend '{backend_name}'. "
        f"Set STORAGE_BACKEND to 'local' or 'minio' in your .env file."
    )
