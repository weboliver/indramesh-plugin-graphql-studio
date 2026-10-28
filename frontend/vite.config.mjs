// Plugin-local REGISTRATION build (Phase 304, GQL-05; Phase-303 D-13/D-14 model).
//
// Produces `plugins/graphql-studio/static/graphql-studio.js`: a single ES file
// that registers the plugin's page and Tools nav item. Every host singleton is
// externalized BY IDENTITY so the bundle shares the host's one React, Router,
// QueryClient and authenticated api client (the import map in frontend/index.html
// resolves those bare specifiers at runtime).
//
// The heavy GraphiQL/Monaco editor lives in the separate heavy payload
// (`vite.heavy.config.mjs`, plan 304-05) and is never pulled in here, so the
// registration bundle stays light.
export default {
  root: import.meta.dirname,
  build: {
    lib: {
      entry: 'index.jsx',
      formats: ['es'],
      fileName: () => 'graphql-studio.js',
    },
    outDir: '../static',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      external: [
        'react',
        'react/jsx-runtime',
        'react-dom',
        'react-dom/client',
        'react-router',
        'react-router-dom',
        '@tanstack/react-query',
        '@indramesh/plugin-api',
      ],
    },
  },
}