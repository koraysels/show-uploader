import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // Split the stable vendor libraries out of the app chunk so a code
        // change doesn't invalidate the whole ~550 kB bundle — the vendor
        // chunks stay cached across deploys. (Rolldown-native `codeSplitting`;
        // vite 8 rejects the old object-form manualChunks.)
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'tanstack', test: /node_modules[\\/]@tanstack[\\/]/ },
            { name: 'auth', test: /node_modules[\\/]oidc-client-ts[\\/]/ },
            { name: 'mui', test: /node_modules[\\/](@mui|@emotion)[\\/]/ },
            { name: 'editor', test: /node_modules[\\/](@tiptap|prosemirror)[^\\/]*[\\/]/ },
          ],
        },
      },
    },
  },
});
