import * as http from 'http';
import * as url from 'url';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { parseFlags } from '../utils/cli-flags.js';

dotenv.config();

const DEFAULT_PORT = 8081;
const DEFAULT_ROOT_FALLBACK = path.resolve(process.cwd(), 'images');

const { port: PORT, root: IMAGE_ROOT_DIR } = parseFlags(
  Number(process.env.IMAGE_SERVER_PORT) || DEFAULT_PORT,
  process.env.IMAGE_ROOT_DIR,
  DEFAULT_ROOT_FALLBACK
);

const PREFERRED_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.gif'];
const UI_ICON_NAMES = ['Users', 'Home', 'Desktop', 'Documents', 'resources'];

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const serveStaticFile = async (baseName, res) => {
  for (const ext of PREFERRED_EXTENSIONS) {
    try {
      const filePath = path.join(IMAGE_ROOT_DIR, `${baseName}${ext}`);
      await fs.access(filePath);
      const data = await fs.readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(data);
      return true;
    } catch {}
  }
  return false;
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const parsed = url.parse(req.url ?? '', true);
  const parts = (parsed.pathname ?? '').split('/').filter(Boolean);

  if (parts.length === 0) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  try {
    const [endpoint, ...params] = parts;
    let served = false;

    if (endpoint === 'ui') {
      const name = decodeURIComponent(params[0] || '').toLowerCase();
      if (UI_ICON_NAMES.map(n => n.toLowerCase()).includes(name)) {
        served = await serveStaticFile(path.join('ui', name), res);
      }
    } else if (endpoint === 'name' || endpoint === 'ext') {
      const name = decodeURIComponent(params[0] || '').toLowerCase();
      served = await serveStaticFile(name, res);
    }

    if (!served) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  } catch (err) {
    console.error(err);
    res.writeHead(500).end('Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`🖼️ Image server listening on http://localhost:${PORT}`);
  console.log(`Serving static images from: ${IMAGE_ROOT_DIR}`);
});
