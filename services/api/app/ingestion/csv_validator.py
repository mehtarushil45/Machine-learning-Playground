"""Streaming CSV validation and deterministic schema fingerprinting.

All public functions are pure with respect to system state: they read
already-persisted files but have no other side effects.

Schema fingerprinting rationale
---------------------------------
The fingerprint is computed from schema *metadata* only:

    - column names (sorted for order-independence)
    - inferred column types (via the existing ``infer_column_type`` profiler logic)
    - detected field delimiter
    - detected character encoding
    - schema algorithm version tag (``"v1"`` — bump when the algorithm changes)

This means two datasets with identical schemas produce the same fingerprint
regardless of their filenames, row counts, or file content — which enables
schema deduplication, change detection, and evolution tracking.

Column-type inference reuses ``app.services.profiler.infer_column_type`` so
there is exactly one type-inference implementation across the whole platform.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
import os
from dataclasses import dataclass, field

from app.services.profiler import infer_column_type  # single source of truth

logger = logging.getLogger("apex_ingestion.csv_validator")

# ---------------------------------------------------------------------------
# Module-level constants
# ---------------------------------------------------------------------------

_CHUNK_SIZE: int = 65_536       # 64 KB — streaming read chunk
_SNIFFER_SAMPLE: int = 4_096    # bytes fed to csv.Sniffer for delimiter detection
_TYPE_SAMPLE_LIMIT: int = 200   # max rows sampled for column type inference
_SCHEMA_ALGORITHM_VERSION: str = "v1"  # bump → different version_id prefix

_SUPPORTED_ENCODINGS: tuple[str, ...] = ("utf-8-sig", "utf-8", "iso-8859-1")


# ---------------------------------------------------------------------------
# Value objects
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SchemaMetadata:
    """Structured descriptor of a CSV file's schema.

    Used as the sole input to ``generate_schema_fingerprint`` so the
    fingerprint is independent of file path, content, or upload context.

    Attributes:
        column_names:    Column names in their original CSV header order.
        column_types:    ``{column_name: inferred_type}`` mapping.
                         Types follow the profiler vocabulary:
                         ``"numeric"`` | ``"categorical"`` | ``"boolean"``
                         | ``"datetime"`` | ``"identifier"`` | ``"text"``.
        delimiter:       Detected field separator character.
        encoding:        Normalised encoding label (e.g. ``"utf-8"``).
        schema_version:  Algorithm version tag.  Changing this tag produces
                         a different fingerprint for the same schema data,
                         allowing versioned migration of the algorithm.
    """

    column_names: tuple[str, ...]
    column_types: dict[str, str]
    delimiter: str
    encoding: str
    schema_version: str = _SCHEMA_ALGORITHM_VERSION


@dataclass
class CSVValidationResult:
    """Result of a full streaming CSV validation pass.

    Attributes:
        is_valid:    ``True`` when all validation checks pass.
        columns:     Parsed header column names (original order).
        row_count:   Total data row count (header excluded).
        encoding:    Normalised encoding label detected.
        delimiter:   Field separator character detected.
        schema:      Populated ``SchemaMetadata`` (only when ``is_valid=True``).
        errors:      Human-readable error messages (empty when ``is_valid=True``).
    """

    is_valid: bool
    columns: list[str] = field(default_factory=list)
    row_count: int = 0
    encoding: str = "utf-8"
    delimiter: str = ","
    schema: SchemaMetadata | None = None
    errors: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def validate_csv_file(file_path: str, max_size_bytes: int) -> CSVValidationResult:
    """Validate a persisted CSV file through a full streaming pass.

    Reads the file in ``_CHUNK_SIZE``-byte chunks so the full file content
    is never loaded into memory simultaneously.  Performs the following
    checks in order:

    1. File accessibility and size guard.
    2. Character encoding detection (UTF-8 BOM → UTF-8 → ISO-8859-1).
    3. Field delimiter detection via ``csv.Sniffer``.
    4. Header row presence and non-blankness.
    5. Minimum one data row beyond the header.
    6. Column type inference from the first ``_TYPE_SAMPLE_LIMIT`` rows.
    7. Construction of a ``SchemaMetadata`` ready for fingerprinting.

    Args:
        file_path:       Absolute path to the stored CSV file.
        max_size_bytes:  Maximum permitted file size in bytes.

    Returns:
        ``CSVValidationResult`` with ``is_valid=True`` and a populated
        ``schema`` on success; ``is_valid=False`` with ``errors`` on failure.
    """
    # ── 1. File size check ─────────────────────────────────────────────────
    try:
        actual_size = os.path.getsize(file_path)
    except OSError as exc:
        return CSVValidationResult(is_valid=False, errors=[f"File not accessible: {exc}"])

    if actual_size == 0:
        return CSVValidationResult(is_valid=False, errors=["CSV file is empty (0 bytes)."])

    if actual_size > max_size_bytes:
        max_mb = max_size_bytes // (1024 * 1024)
        return CSVValidationResult(
            is_valid=False,
            errors=[
                f"File size {actual_size:,} bytes exceeds the {max_mb} MB maximum."
            ],
        )

    # ── 2. Encoding detection ──────────────────────────────────────────────
    detected_encoding = _detect_encoding(file_path)
    if detected_encoding is None:
        return CSVValidationResult(
            is_valid=False,
            errors=["Cannot decode file with UTF-8-BOM, UTF-8, or ISO-8859-1."],
        )

    # ── 3. Delimiter detection ─────────────────────────────────────────────
    detected_delimiter = _detect_delimiter(file_path, detected_encoding)

    # ── 4 & 5. Header + row streaming pass ────────────────────────────────
    columns: list[str] = []
    row_count: int = 0
    sample_rows: list[list[str]] = []

    try:
        with open(
            file_path,
            encoding=detected_encoding,
            errors="replace",
            newline="",
        ) as fh:
            reader = csv.reader(fh, delimiter=detected_delimiter)

            # Header
            header = next(reader, None)
            if not header or not any(col.strip() for col in header):
                return CSVValidationResult(
                    is_valid=False,
                    encoding=_normalise_encoding(detected_encoding),
                    delimiter=detected_delimiter,
                    errors=["CSV is missing a valid header row."],
                )

            columns = [col.strip() for col in header if col.strip()]
            if not columns:
                return CSVValidationResult(
                    is_valid=False,
                    encoding=_normalise_encoding(detected_encoding),
                    delimiter=detected_delimiter,
                    errors=["Header row contains only blank column names."],
                )

            # Data rows — streaming count + limited sample collection
            for row in reader:
                row_count += 1
                if len(sample_rows) < _TYPE_SAMPLE_LIMIT:
                    sample_rows.append(row)

    except csv.Error as exc:
        return CSVValidationResult(
            is_valid=False,
            encoding=_normalise_encoding(detected_encoding),
            delimiter=detected_delimiter,
            errors=[f"Malformed CSV structure: {exc}"],
        )

    if row_count == 0:
        return CSVValidationResult(
            is_valid=False,
            columns=columns,
            encoding=_normalise_encoding(detected_encoding),
            delimiter=detected_delimiter,
            errors=["CSV has a valid header but zero data rows."],
        )

    # ── 6. Column type inference (reuses profiler — single implementation) ─
    column_types = _infer_column_types(columns, sample_rows)
    normalised_encoding = _normalise_encoding(detected_encoding)

    # ── 7. Build SchemaMetadata ────────────────────────────────────────────
    schema = SchemaMetadata(
        column_names=tuple(columns),
        column_types=column_types,
        delimiter=detected_delimiter,
        encoding=normalised_encoding,
    )

    logger.info(
        "CSV validated — path='%s' rows=%d columns=%d encoding=%s delimiter=%r",
        file_path,
        row_count,
        len(columns),
        normalised_encoding,
        detected_delimiter,
    )

    return CSVValidationResult(
        is_valid=True,
        columns=columns,
        row_count=row_count,
        encoding=normalised_encoding,
        delimiter=detected_delimiter,
        schema=schema,
    )


def generate_schema_fingerprint(schema: SchemaMetadata) -> tuple[str, str]:
    """Compute a deterministic SHA-256 fingerprint from schema metadata.

    The canonical payload (serialised as compact sorted JSON) is:

    .. code-block:: json

        {
            "columns": [
                {"name": "age",    "type": "numeric"},
                {"name": "gender", "type": "categorical"}
            ],
            "delimiter": ",",
            "encoding":  "utf-8",
            "schema_version": "v1"
        }

    Columns are sorted by name so that column ordering in the CSV does
    not affect the fingerprint.  Two schemas that differ only in row count
    or filename will produce the same fingerprint.

    Args:
        schema: A fully populated ``SchemaMetadata`` instance.

    Returns:
        A ``(version_id, sha256_hex)`` tuple where:
        - ``version_id`` has the form ``"v1-{first8hexchars}"``
          (e.g. ``"v1-a3f2b1c4"``).
        - ``sha256_hex`` is the full 64-character lowercase hex digest.
    """
    canonical_columns = sorted(
        [
            {"name": col, "type": schema.column_types.get(col, "unknown")}
            for col in schema.column_names
        ],
        key=lambda entry: entry["name"],
    )

    payload: dict = {
        "columns": canonical_columns,
        "delimiter": schema.delimiter,
        "encoding": schema.encoding,
        "schema_version": schema.schema_version,
    }

    canonical_str = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    sha256_hex = hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()
    version_id = f"{schema.schema_version}-{sha256_hex[:8]}"

    logger.debug(
        "Schema fingerprint generated — version_id=%s sha256=%s",
        version_id,
        sha256_hex,
    )

    return version_id, sha256_hex


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _detect_encoding(file_path: str) -> str | None:
    """Try each supported encoding on the first 4 KB of the file.

    Returns the first encoding that successfully decodes the sample,
    or ``None`` if no encoding works.
    """
    try:
        with open(file_path, "rb") as fb:
            sample = fb.read(4_096)
    except OSError:
        return None

    for enc in _SUPPORTED_ENCODINGS:
        try:
            sample.decode(enc)
            return enc
        except (UnicodeDecodeError, LookupError):
            continue

    return None


def _detect_delimiter(file_path: str, encoding: str) -> str:
    """Use ``csv.Sniffer`` on the first ``_SNIFFER_SAMPLE`` characters.

    Falls back to a comma if sniffing fails or produces an unexpected result.
    """
    try:
        with open(file_path, encoding=encoding, errors="replace", newline="") as fh:
            sample = fh.read(_SNIFFER_SAMPLE)
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        return dialect.delimiter
    except csv.Error:
        return ","


def _infer_column_types(
    columns: list[str],
    sample_rows: list[list[str]],
) -> dict[str, str]:
    """Map each column name to its inferred type.

    Delegates to ``infer_column_type`` from ``app.services.profiler`` so
    there is a single type-inference implementation across the entire platform.

    Args:
        columns:     List of column names in header order.
        sample_rows: Parsed data rows (each row is a list of cell strings).

    Returns:
        ``{column_name: type_string}`` mapping.
    """
    result: dict[str, str] = {}
    for idx, col_name in enumerate(columns):
        col_values = [row[idx] if idx < len(row) else "" for row in sample_rows]
        result[col_name] = infer_column_type(col_name, col_values)
    return result


def _normalise_encoding(encoding: str) -> str:
    """Map raw encoding strings to a canonical lowercase short-form label."""
    enc = encoding.lower().replace("-", "").replace("_", "")
    _normalisation_map = {
        "utf8sig": "utf-8-bom",
        "utf8bom": "utf-8-bom",
        "utf8": "utf-8",
        "iso88591": "iso-8859-1",
        "latin1": "iso-8859-1",
    }
    return _normalisation_map.get(enc, encoding.lower())
