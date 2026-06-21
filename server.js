// Custom Node.js server for Hostinger deployment.
// Hostinger sets PORT automatically — next start doesn't pick it up,
// so we create an HTTP server that binds to whatever PORT is assigned.
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev  = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);

const app    = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      await handle(req, res, parse(req.url, true));
    } catch (err) {
      console.error('[server]', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  }).listen(port, () => {
    console.log(`> Ready on port ${port} [${dev ? 'dev' : 'production'}]`);
  });
});
