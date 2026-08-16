"""Shared dataset-file location helpers for API and worker processes."""

import os

UPLOADS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "api", "uploads")
)


def find_dataset_path(dataset_id: str) -> str:
    """Find CSV file path in uploads directory corresponding to dataset_id.

    Searches both the root upload directory and organisation-scoped subdirectories.

    Raises:
        FileNotFoundError: If no matching CSV dataset file is found for dataset_id.
    """
    if os.path.exists(dataset_id) and dataset_id.endswith(".csv"):
        return dataset_id

    if os.path.exists(UPLOADS_DIR):
        # 1. Search root upload directory
        for fname in os.listdir(UPLOADS_DIR):
            fpath = os.path.join(UPLOADS_DIR, fname)
            if os.path.isfile(fpath) and (dataset_id in fname and fname.endswith(".csv")):
                return fpath
            # 2. Search organisation-scoped subdirectories
            if os.path.isdir(fpath):
                for sub_fname in os.listdir(fpath):
                    if dataset_id in sub_fname and sub_fname.endswith(".csv"):
                        return os.path.join(fpath, sub_fname)

    raise FileNotFoundError(
        f"No dataset file found for dataset_id='{dataset_id}'. "
        "Please upload a valid CSV dataset before training."
    )
