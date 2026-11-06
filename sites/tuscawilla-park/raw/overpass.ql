[out:json][timeout:90];
way(462341602)->.boundary;
.boundary map_to_area->.a;
(
  way["building"](area.a);
  relation["building"](area.a);
  way["highway"](area.a);
  way["amenity"](area.a);
  way["leisure"](area.a);
  node["amenity"](area.a);
  node["emergency"](area.a);
  node["entrance"](area.a);
);
out geom;
