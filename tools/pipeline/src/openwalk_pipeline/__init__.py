"""Build-time data preparation for OpenWalk sites.

Reads ``sites/<site-id>/site.yaml``, ``places.yaml`` and the raw downloads under
``sites/<site-id>/raw/``; writes ``places.geojson``, ``walkways.geojson`` and
``graph.json`` beside them.
"""

__version__ = "0.1.0"
