import { defineConfig, type PreviewServer, type ViteDevServer } from 'vite';

// Keep the preserved directory route reachable before Vite's SPA fallback.
function pondRoute(server: ViteDevServer | PreviewServer) {
  server.middlewares.use((request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== '/github') return next();
    response.statusCode = 308;
    response.setHeader('Location', `/github/${url.search}`);
    response.end();
  });
}

export default defineConfig({
  plugins: [{ name: 'pond-directory-route', configureServer: pondRoute, configurePreviewServer: pondRoute }],
});
