"""Dataset Ingestion System — Version 4.

Package providing the storage abstraction layer, streaming CSV validation,
data quality validation, and dataset validation context for the enterprise
dataset ingestion pipeline.

Public surface (V2–V4):
    storage_backend.StorageBackend          — Protocol (interface)
    storage_backend.LocalFileSystemBackend  — Local FS implementation (v2)
    storage_backend.StorageLocation         — Immutable result value object
    storage_backend.StorageError            — Persistence failure exception
    storage_backend.get_configured_backend  — Factory: reads settings.storage_backend (v3)
    minio_backend.MinIOStorageBackend       — MinIO/S3-compatible implementation (v3)
    csv_validator.validate_csv_file         — Streaming structural validation (v2)
    csv_validator.generate_schema_fingerprint — SHA-256 schema fingerprint (v2)
    csv_validator.CSVValidationResult       — Structural validation result (v2)
    csv_validator.SchemaMetadata            — Schema descriptor for fingerprinting (v2)
    data_quality_validator.run_data_quality_validation — Deep quality validation (v4)
    data_quality_validator.ValidationReport — Quality validation result + score (v4)
    data_quality_validator.ValidationIssue  — Single validation finding (v4)
    validation_context.DatasetValidationContext — Canonical dataset validation record (v4)
    validation_context.store_validation_context — Persist context by dataset_id (v4)
    validation_context.get_validation_context   — Retrieve context by dataset_id (v4)
    validation_context.list_validation_contexts — List all stored contexts (v4)

Backend selection (v3+):
    Set STORAGE_BACKEND=local  (default) → LocalFileSystemBackend
    Set STORAGE_BACKEND=minio            → MinIOStorageBackend
    Application code never reads STORAGE_BACKEND directly.
    Only get_configured_backend() reads it.

Pipeline stages (v4):
    Stage 1:   csv_validator.validate_csv_file()        — structural CSV validation
    Stage 1.5: data_quality_validator.run_data_quality_validation() — quality + ML compat
    Stage 2:   csv_validator.generate_schema_fingerprint()          — schema fingerprinting
    Stage 3:   profiler_service.profile()               — statistical column profiling
    Stage 4:   _JOBS_STORE metadata commit              — job completion
"""
