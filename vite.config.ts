import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app: React 19 around a PixiJS 8 scene (DR-007). The engine is bundled from
// src/engine/ like any other module; it imports nothing from the app (AGENTS.md rule 5).
export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the build also works from a sub-path such as GitHub Pages.
  base: './',
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  // PixiJS is most of the bundle (about 170 KB gzipped, docs/research/rendering.md); split it once art loads lazily.
  build: { outDir: 'dist', sourcemap: true, chunkSizeWarningLimit: 800 },
});
