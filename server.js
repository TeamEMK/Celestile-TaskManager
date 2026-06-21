// Hostinger Node.js startup file.
// Hostinger assigns a dynamic PORT — next start ignores it, so we use a
// custom HTTP server that respects process.env.PORT.
'use strict';

// Force production mode if not explicitly set.
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';

// Ensure we run from the directory this file lives in (Hostinger sometimes
// starts the process from a different cwd).
process.chdir(__dirname);

const { createServer } = require('http');
const { parse }        = require('url');
const next             = require('next');
const path             = require('path');
const fs               = require('fs');

const dev  = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);

// Guard: if the .next build folder is missing, log a clear error instead of
// crashing silently (which makes Hostinger show a generic 503).
const buildDir = path.join(__dirname, '.next');
if (!dev && !fs.existsSync(buildDir)) {
  console.error('\n[server] ERROR: .next folder not found.');
  console.error('[server] Run  npm run build  before starting the app.\n');
  process.exit(1);
}

const app    = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare()
  .then(() => {
    createServer(async (req, res) => {
      try {
        await handle(req, res, parse(req.url, true));
      } catch (err) {
        console.error('[server] request error:', err);
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    }).listen(port, '0.0.0.0', () => {
      console.log(`> Ready on port ${port} (${process.env.NODE_ENV})`);
    });
  })
  .catch((err) => {
    console.error('[server] Failed to start Next.js:', err);
    process.exit(1);
  });
