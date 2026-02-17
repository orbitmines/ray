import {defineConfig} from 'vite';
import path from 'path';
import fs from 'fs';

// Ether filesystem plugin — intercepts /**/ paths during dev to serve
// the real filesystem, mirroring what the production server does.
//
// URL mapping:
//   /**/           → .ether/      (metadata root)
//   /**/@ether/... → Ether/...    (@ether user's repository)
function etherFsPlugin() {
  const projectRoot = path.resolve(__dirname, '../..');

  return {
    name: 'ether-fs',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Decode URI and match /**/...
        const decoded = decodeURIComponent(req.url || '');
        const match = decoded.match(/^\/\*\*\/(.*)/);
        if (!match) return next();

        const relative = match[1].replace(/\/$/, '') // strip trailing slash
          .split('/').map(seg => seg.startsWith('!') ? seg.slice(1) : seg).join('/'); // strip ! escape prefix

        // Route: empty path → .ether/
        // Route: @ether/... → Ether/...
        // Route: @<other>/... → .ether/... (local player's root)
        let fsPath;
        if (relative === '' || relative === '.') {
          fsPath = path.resolve(projectRoot, '.ether');
        } else if (relative === '@ether') {
          fsPath = path.resolve(projectRoot, 'Ether');
        } else if (relative.startsWith('@ether/')) {
          fsPath = path.resolve(projectRoot, 'Ether', relative.slice('@ether/'.length));
        } else if (relative.match(/^@[^/]+$/)) {
          // @<user> with no subpath → .ether/
          fsPath = path.resolve(projectRoot, '.ether');
        } else if (relative.match(/^@[^/]+\//)) {
          // @<user>/subpath → .ether/subpath
          const subpath = relative.replace(/^@[^/]+\//, '');
          fsPath = path.resolve(projectRoot, '.ether', subpath);
        } else {
          fsPath = path.resolve(projectRoot, relative);
        }

        // Path traversal protection
        if (!fsPath.startsWith(projectRoot)) {
          res.statusCode = 403;
          res.end('Path traversal not allowed');
          return;
        }

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');

        try {
          const stat = fs.statSync(fsPath);

          if (stat.isDirectory()) {
            // Return JSON directory listing
            const entries = fs.readdirSync(fsPath, { withFileTypes: true });
            const json = entries.map(e => ({
              name: e.name,
              isDirectory: e.isDirectory(),
              ...(e.isFile() ? { size: fs.statSync(path.join(fsPath, e.name)).size } : {}),
            }));
            json.sort((a, b) => a.name.localeCompare(b.name));
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(json));
          } else if (stat.isFile()) {
            // Serve raw file with MIME type
            const ext = path.extname(fsPath).toLowerCase();
            const mimeTypes = {
              '.html': 'text/html; charset=utf-8',
              '.css': 'text/css; charset=utf-8',
              '.js': 'application/javascript; charset=utf-8',
              '.mjs': 'application/javascript; charset=utf-8',
              '.json': 'application/json; charset=utf-8',
              '.svg': 'image/svg+xml',
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.gif': 'image/gif',
              '.webp': 'image/webp',
              '.ico': 'image/x-icon',
              '.woff': 'font/woff',
              '.woff2': 'font/woff2',
              '.txt': 'text/plain; charset=utf-8',
              '.md': 'text/plain; charset=utf-8',
              '.ray': 'text/plain; charset=utf-8',
              '.ts': 'text/plain; charset=utf-8',
              '.rs': 'text/plain; charset=utf-8',
              '.py': 'text/plain; charset=utf-8',
              '.sh': 'text/plain; charset=utf-8',
              '.toml': 'text/plain; charset=utf-8',
              '.yaml': 'text/plain; charset=utf-8',
              '.yml': 'text/plain; charset=utf-8',
            };
            res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
            const data = fs.readFileSync(fsPath);
            res.end(data);
          } else {
            res.statusCode = 404;
            res.end('Not Found');
          }
        } catch (e) {
          res.statusCode = 404;
          res.end('Not Found');
        }
      });
    },
  };
}

export default defineConfig({
  base: '/',
  appType: 'spa',
  plugins: [etherFsPlugin()],
  build: {
    outDir: './dist'
  },
});
