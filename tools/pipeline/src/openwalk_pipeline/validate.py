"""Validation of pipeline inputs and outputs against the shared JSON Schemas.

The schema files live in ``packages/schema/schemas/`` so the TypeScript side reads the
same contract. They are located relative to this source tree, which is why the pipeline
is installed in editable mode.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError

JsonObject = dict[str, Any]

DEFAULT_SCHEMA_DIR = Path(__file__).resolve().parents[4] / "packages" / "schema" / "schemas"


class SchemaError(ValueError):
    """An instance does not satisfy its schema. The message names the offending path."""


def load_schema(name: str, schema_dir: Path = DEFAULT_SCHEMA_DIR) -> JsonObject:
    """Load ``<name>.schema.json`` and check that it is itself a valid schema."""
    path = schema_dir / f"{name}.schema.json"
    with path.open(encoding="utf-8") as handle:
        schema: JsonObject = json.load(handle)
    Draft202012Validator.check_schema(schema)
    return schema


def validate(instance: Any, name: str, schema_dir: Path = DEFAULT_SCHEMA_DIR) -> None:
    """Raise :class:`SchemaError` if ``instance`` does not match the named schema."""
    validator = Draft202012Validator(load_schema(name, schema_dir))
    # jsonschema's own annotations are loose here; the values are ValidationError objects.
    errors: list[ValidationError] = list(validator.iter_errors(instance))  # pyright: ignore[reportUnknownMemberType]
    if not errors:
        return
    # Report the error closest to the root; it is usually the one worth reading.
    error = min(errors, key=lambda item: item.json_path)
    raise SchemaError(f"{name}: {error.json_path}: {error.message}")
