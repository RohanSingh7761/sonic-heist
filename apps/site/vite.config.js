import { defineConfig } from 'vite';

// The phones run the game's real screens from apps/web, using this site's copy of React.
export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { fs: { allow: ['..'] } },
});
