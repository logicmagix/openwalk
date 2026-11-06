import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      // Site data is GeoJSON, which Vite does not recognise as JSON by extension.
      // Wrapping the file as a module lets tests import it like any JSON file.
      name: 'geojson-as-json',
      transform(code, id) {
        if (!id.endsWith('.geojson')) return null;
        return { code: `export default ${code};`, map: null };
      },
    },
  ],
  test: {
    name: 'search',
    environment: 'node',
  },
});
