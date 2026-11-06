"""A single-file map page for checking a site's generated data by eye.

The page draws the walkways, the routing graph, the places and any overlay over
satellite imagery with Leaflet, so a maintainer can see whether the data lines up with
the ground. It is a maintenance tool, not part of the application: it loads Leaflet
and imagery from third-party hosts, which the application never does.
"""

from __future__ import annotations

import json
from pathlib import Path
from string import Template
from typing import Any

from openwalk_pipeline.site import Site

JsonObject = dict[str, Any]

LEAFLET_VERSION = "1.9.4"
ROTATED_OVERLAY_VERSION = "0.2.1"


def island_edges(graph: JsonObject) -> list[int]:
    """Indices of the edges that are not part of the largest connected piece."""
    count = len(graph["nodes"])
    parent = list(range(count))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for a, b, _, _ in graph["edges"]:
        parent[find(a)] = find(b)
    sizes: dict[int, int] = {}
    for i in range(count):
        root = find(i)
        sizes[root] = sizes.get(root, 0) + 1
    if not sizes:
        return []
    main = max(sizes, key=lambda root: sizes[root])
    return [index for index, (a, _, _, _) in enumerate(graph["edges"]) if find(a) != main]


def _read_json(path: Path) -> JsonObject | None:
    if not path.exists():
        return None
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def render(site: Site) -> str:
    """Return the page HTML for a site whose generated files exist."""
    walkways = _read_json(site.walkways_path) or {"type": "FeatureCollection", "features": []}
    places = _read_json(site.places_path) or {"type": "FeatureCollection", "features": []}
    graph = _read_json(site.graph_path) or {"nodes": [], "edges": [], "places": {}}
    overlays = (_read_json(site.overlays_path) or {"overlays": []})["overlays"]
    view = site.config.get("view", {})
    data = {
        "name": site.name,
        "center": view.get("center"),
        "zoom": view.get("zoom", 16),
        "walkways": walkways,
        "places": places,
        "graph": graph,
        "islands": island_edges(graph),
        "overlays": overlays,
    }
    return PAGE.substitute(
        title=site.name,
        leaflet=LEAFLET_VERSION,
        rotated=ROTATED_OVERLAY_VERSION,
        data=json.dumps(data, ensure_ascii=False).replace("</", "<\\/"),
    )


def write(site: Site, out: Path | None = None) -> Path:
    path = out or site.directory / "debug.html"
    path.write_text(render(site), encoding="utf-8")
    return path


PAGE = Template(
    r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>$title: data check</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@$leaflet/dist/leaflet.css">
<style>
  html, body, #map { height: 100%; margin: 0; }
  #panel { position: absolute; top: 10px; left: 50px; z-index: 1000; background: #fff; padding: 8px 12px;
           font: 13px/1.5 system-ui, sans-serif; border-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,.4); max-width: 320px; }
  #panel code { user-select: all; }
  .num { background: #fff; border: 1px solid #333; border-radius: 3px; padding: 0 3px; font: bold 11px system-ui; white-space: nowrap; }
  .legend span { display: inline-block; width: 14px; height: 4px; margin-right: 4px; vertical-align: middle; }
</style>
</head>
<body>
<div id="map"></div>
<div id="panel">
  <div><strong id="title"></strong></div>
  <div id="stats"></div>
  <div class="legend">
    <span style="background:#2c7fb8"></span>walkway
    <span style="background:#f5a623"></span>steps
    <span style="background:#41ab5d"></span>area
    <span style="background:#d53ef2"></span>connector
    <span style="background:#e31a1c;height:6px"></span>island
  </div>
  <div>Overlay opacity <input id="opacity" type="range" min="0" max="100" value="60"></div>
  <div>Clicked: <code id="clicked">(click the map)</code></div>
  <div id="warnings"></div>
</div>
<script src="https://unpkg.com/leaflet@$leaflet/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet-imageoverlay-rotated@$rotated/Leaflet.ImageOverlay.Rotated.js"></script>
<script>
const DATA = $data;
const map = L.map('map');
const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 20, maxNativeZoom: 19, attribution: 'Imagery © Esri'
}).addTo(map);
const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 20, maxNativeZoom: 19, attribution: '© OpenStreetMap contributors'
});
document.getElementById('title').textContent = DATA.name;

// Walkways, coloured by kind.
const walkwayStyle = f => {
  const steps = f.properties.highway === 'steps';
  const area = f.geometry.type === 'Polygon';
  return { color: steps ? '#f5a623' : area ? '#41ab5d' : '#2c7fb8', weight: steps ? 4 : 3, fillOpacity: area ? 0.2 : 0 };
};
const walkways = L.geoJSON(DATA.walkways, {
  style: walkwayStyle,
  onEachFeature: (f, layer) => layer.bindTooltip(Object.entries(f.properties).map(([k, v]) => k + '=' + v).join('<br>'))
}).addTo(map);

// Graph edges and nodes.
const nodes = DATA.graph.nodes;
const latlng = i => [nodes[i][1], nodes[i][0]];
const islands = new Set(DATA.islands);
const edgeLines = [], connectorLines = [], islandLines = [];
DATA.graph.edges.forEach(([a, b, m, kind], index) => {
  const line = L.polyline([latlng(a), latlng(b)]);
  line.bindTooltip(kind + ' ' + m + ' m');
  if (islands.has(index)) { line.setStyle({ color: '#e31a1c', weight: 7, opacity: 0.8 }); islandLines.push(line); }
  if (kind === 'connector') { line.setStyle({ color: '#d53ef2', weight: 3, dashArray: '4 4' }); connectorLines.push(line); }
  else { line.setStyle({ color: '#ffffff', weight: 1, opacity: 0.7 }); edgeLines.push(line); }
});
const graphEdges = L.layerGroup(edgeLines);
const connectors = L.layerGroup(connectorLines).addTo(map);
const islandLayer = L.layerGroup(islandLines).addTo(map);
const graphNodes = L.layerGroup(nodes.map((n, i) => L.circleMarker([n[1], n[0]], { radius: 2, color: '#fff', weight: 1, fillOpacity: 1 }).bindTooltip('node ' + i)));

// Places: numbered buildings get a label, call boxes a yellow dot, the rest a white dot.
const places = L.geoJSON(DATA.places, {
  pointToLayer: (f, ll) => {
    const p = f.properties;
    if (p.category === 'call_box') return L.circleMarker(ll, { radius: 6, color: '#000', weight: 1, fillColor: '#ffd700', fillOpacity: 1 });
    if (p.number) return L.marker(ll, { icon: L.divIcon({ className: 'num', html: p.number, iconSize: null }) });
    return L.circleMarker(ll, { radius: 5, color: '#000', weight: 1, fillColor: '#fff', fillOpacity: 1 });
  },
  onEachFeature: (f, layer) => layer.bindPopup('<b>' + f.id + '</b><br>' + Object.entries(f.properties).map(([k, v]) => k + ': ' + JSON.stringify(v)).join('<br>'))
}).addTo(map);

// Overlays as rotated images: top-left, top-right, bottom-left corners.
const overlayLayers = {};
const overlayObjects = [];
DATA.overlays.forEach(o => {
  const [tl, tr, , bl] = o.corners.map(c => L.latLng(c[1], c[0]));
  const layer = L.imageOverlay.rotated(o.image, tl, tr, bl, { opacity: 0.6, attribution: o.attribution || '' });
  overlayLayers[o.name + ' (rms ' + o.fit.rms_m + ' m)'] = layer;
  overlayObjects.push(layer);
  layer.addTo(map);
});
document.getElementById('opacity').addEventListener('input', e => overlayObjects.forEach(l => l.setOpacity(e.target.value / 100)));

L.control.layers({ 'Satellite': satellite, 'Streets': streets }, Object.assign({
  'Walkways': walkways, 'Graph edges': graphEdges, 'Graph nodes': graphNodes, 'Connectors': connectors,
  'Islands': islandLayer, 'Places': places
}, overlayLayers), { collapsed: false }).addTo(map);

map.on('click', e => {
  document.getElementById('clicked').textContent = '[' + e.latlng.lng.toFixed(6) + ', ' + e.latlng.lat.toFixed(6) + ']';
});

const bounds = walkways.getBounds();
if (DATA.center) map.setView([DATA.center[1], DATA.center[0]], DATA.zoom);
else if (bounds.isValid()) map.fitBounds(bounds);
else map.setView([0, 0], 2);

document.getElementById('stats').textContent =
  DATA.walkways.features.length + ' walkways, ' + DATA.places.features.length + ' places, ' +
  nodes.length + ' nodes, ' + DATA.graph.edges.length + ' edges, ' + DATA.islands.length + ' island edges';
</script>
</body>
</html>
"""
)
