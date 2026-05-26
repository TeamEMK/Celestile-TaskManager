import net from 'net';

const HOST = '87.106.200.69';
const PORT = 5433;

console.log(`→ Opening raw TCP to ${HOST}:${PORT} ...`);
const sock = net.connect({ host: HOST, port: PORT });

sock.setTimeout(5000);

sock.on('connect', () => {
  console.log('✅ TCP connected. Waiting for server banner (5s) ...');
  // MySQL sends a greeting packet immediately
  // Postgres waits for client startup message — so it sends nothing
});

sock.on('data', (buf) => {
  console.log(`📦 Server sent ${buf.length} bytes:`);
  console.log('   Hex   :', buf.slice(0, 64).toString('hex'));
  console.log('   ASCII :', JSON.stringify(buf.slice(0, 64).toString('utf8').replace(/[^\x20-\x7e]/g, '.')));

  // MySQL greeting starts with: [4-byte header][1-byte protocol=10][version string + null]
  // Look for "5.7", "8.0", "10." (MariaDB) etc
  const ascii = buf.toString('utf8');
  if (ascii.includes('MySQL') || ascii.includes('MariaDB') || /\b\d+\.\d+\.\d+/.test(ascii)) {
    console.log('   → looks like MySQL/MariaDB');
  }
  sock.end();
});

sock.on('timeout', () => {
  console.log('⏰ 5s passed, server sent NO data (typical of Postgres, NOT MySQL)');
  sock.end();
});

sock.on('error', (e) => {
  console.log('❌ TCP error:', e.code, e.message);
});

sock.on('close', () => {
  console.log('— socket closed —');
  process.exit(0);
});
