// Custom Next.js server — used as the "startup file" for the Hostinger Node.js
// app (Passenger/LiteSpeed provide the port via process.env.PORT). Requires a
// production build first:  npm run build
const { createServer } = require('http');
const next = require('next');

const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`> Celestile-TaskManager ready on port ${port}`);
  });
}).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
