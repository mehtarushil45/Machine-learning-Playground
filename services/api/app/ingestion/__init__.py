"""Dataset Ingestion System — Version 3.

Package providing the storage abstraction layer and streaming CSV validation
service for the enterprise dataset ingestion pipeline.

Public surface:
    storage_backend.StorageBackend          — Protocol (interface)
    storage_backend.LocalFileSystemBackend  — Local FS implementation (v2)
    storage_backend.StorageLocation         — Immutable result value object
    storage_backend.StorageError            — Persistence failure exception
    storage_backend.get_configured_backend  — Factory: reads settings.storage_backend (v3)
    minio_backend.MinIOStorageBackend       — MinIO/S3-compatible implementation (v3)
    csv_validator.validate_csv_file         — Streaming validation function
    csv_validator.generate_schema_fingerprint — SHA-256 schema fingerprint
    csv_validator.CSVValidationResult       — Validation result value object
    csv_validator.SchemaMetadata            — Schema descriptor for hashing

Backend selection (v3):
    Set STORAGE_BACKEND=local  (default) → LocalFileSystemBackend
    Set STORAGE_BACKEND=minio            → MinIOStorageBackend
    Application code never reads STORAGE_BACKEND directly.
    Only get_configured_backend() reads it.
"""
