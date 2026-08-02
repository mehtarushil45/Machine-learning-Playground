"""Dataset Ingestion System — Version 2.

Package providing the storage abstraction layer and streaming CSV validation
service for the enterprise dataset ingestion pipeline.

Public surface:
    storage_backend.StorageBackend          — Protocol (interface)
    storage_backend.LocalFileSystemBackend  — Local FS implementation
    storage_backend.StorageLocation         — Immutable result value object
    storage_backend.StorageError            — Persistence failure exception
    csv_validator.validate_csv_file         — Streaming validation function
    csv_validator.generate_schema_fingerprint — SHA-256 schema fingerprint
    csv_validator.CSVValidationResult       — Validation result value object
    csv_validator.SchemaMetadata            — Schema descriptor for hashing
"""
