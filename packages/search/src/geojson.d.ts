// GeoJSON files imported by tests arrive untyped; each test casts to the shape it needs.
declare module '*.geojson' {
  const value: unknown;
  export default value;
}
