import json
from pathlib import Path
from typing import Any

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def overpass_small() -> dict[str, Any]:
    with (FIXTURES / "overpass_small.json").open(encoding="utf-8") as handle:
        return json.load(handle)


@pytest.fixture
def site_dir(tmp_path: Path) -> Path:
    """A minimal valid site directory named after its id."""
    directory = tmp_path / "demo-site"
    directory.mkdir()
    (directory / "site.yaml").write_text(
        "id: demo-site\nname: Demo Site\nboundary:\n  osm_way: 42\n", encoding="utf-8"
    )
    return directory
