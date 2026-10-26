// Tiny static preview server for the solo export. Serves dist-solo/ only:
// no game simulation, no server API, no WebSocket — just local static files.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.ktx2': 'image/ktx2',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.md': 'text/markdown; charset=utf-8',
};

export function createSoloServer(directory = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist-solo')) {
  const root = resolve(directory);
  return createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    } catch {
      response.writeHead(400).end('Bad request');
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const target = resolve(root, `.${pathname}`);
    if (target !== root && !target.startsWith(root + sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(target).catch(() => null);
    if (!info?.isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'content-length': info.size,
      'cache-control': 'no-cache',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(target).pipe(response);
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT) || 4173;
  createSoloServer().listen(port, 'localhost', () => {
    console.log(`Solo export preview: http://localhost:${port}/ (serving dist-solo/, Ctrl+C to stop)`);
  });
}
