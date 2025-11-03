// To run this server, you will need Node.js installed.
// Execute the following command in your terminal:
// node serv/image-serv.js [imageRootDir]
// Note: If you have a TypeScript runner like ts-node, you can use:
// ts-node serv/image-serv.ts [imageRootDir]
// For this environment, we will assume it's compiled to JS and run.

import * as http from 'http';
import * as url from 'url';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const PORT = process.env.IMAGE_SERVER_PORT || 8081;

// --- NEW: Allow command-line override for image root directory ---
// Usage: node serv/image-serv.js [imageRootDir]
const cliRootArg = process.argv[2];
const effectiveRoot = cliRootArg || process.env.IMAGE_ROOT_DIR;

// Ensure IMAGE_ROOT_DIR is an absolute path for security and consistency.
const IMAGE_ROOT_DIR = effectiveRoot
  ? path.resolve(effectiveRoot)
  : path.resolve(process.cwd(), 'images'); // fallback default

// Array of folder locations to search in
const FOLDER_LOCATIONS = [
  IMAGE_ROOT_DIR, // default root location
  // path.join(IMAGE_ROOT_DIR, 'ui', "neon"),
  path.join(IMAGE_ROOT_DIR, 'device'),
  path.join(IMAGE_ROOT_DIR, 'logo'),
  path.join(IMAGE_ROOT_DIR, 'ui', 'shared'),
  path.join(IMAGE_ROOT_DIR, 'ui', '3d-fluency')
  // Add more folder locations here as needed
];

const PREFERRED_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.gif'];
const UI_ICON_NAMES = ['Users', 'Home', 'Desktop', 'Documents', 'resources'];

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

// --- Server Logic ---

// Helper to serve a static file if it exists
const serveStaticFile = async (baseName: string, res: http.ServerResponse, searchLocations: string[] = [IMAGE_ROOT_DIR]): Promise<boolean> => {
  // Check if the basename already has an extension
  const hasExtension = PREFERRED_EXTENSIONS.some(ext => baseName.toLowerCase().endsWith(ext));
  
  if (hasExtension) {
    // If it already has an extension, look for that specific file
    for (const location of searchLocations) {
      try {
        const filePath = path.join(location, baseName);
        await fs.access(filePath); // Check for existence

        // Determine content type from extension
        const ext = path.extname(baseName).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        const fileContent = await fs.readFile(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(fileContent);
        return true; // File found and served
      } catch {
        // Try next location
      }
    }
  } else {
    // If it doesn't have an extension, try adding all supported extensions
    for (const location of searchLocations) {
      for (const ext of PREFERRED_EXTENSIONS) {
        try {
          const fileName = `${baseName}${ext}`;
          const filePath = path.join(location, fileName);

          await fs.access(filePath); // Check for existence

          const fileContent = await fs.readFile(filePath);
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';

          res.writeHead(200, { 'Content-Type': contentType });
          res.end(fileContent);
          return true; // File found and served
        } catch {
          // Try next extension/location
        }
      }
    }
  }
  return false; // No matching file found
};

const server = http.createServer(async (req, res) => {
  console.log(`[${new Date().toISOString()}] Request: ${req.method} ${req.url}`);
  res.setHeader('Access-Control-Allow-Origin', '*');

  const parsedUrl = url.parse(req.url ?? '', true);
  const pathParts = (parsedUrl.pathname ?? '').split('/').filter(p => p);

  // Handle default route (no prefix) - search through all folder locations
  if (pathParts.length === 0) {
    if (req.url === '/' || req.url === '/favicon.ico') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Image Server is running');
      return;
    }
  }

  try {
    let fileServed = false;
    
    if (pathParts.length > 0) {
      const [endpoint, ...params] = pathParts;
      
      // Check if this is a special endpoint (ui, name, ext)
      if (endpoint === 'ui') {
        const name = decodeURIComponent(params[0] || '');
        const lowerCaseName = name.toLowerCase();
        const isAllowed = UI_ICON_NAMES.some(n => n.toLowerCase() === lowerCaseName);

        if (isAllowed) {
          // For UI route, also search through all folder locations
          // Try looking for the file directly or in ui subfolder
          fileServed = await serveStaticFile(lowerCaseName, res, FOLDER_LOCATIONS);
        }
      } else if (endpoint === 'name') {
        const name = decodeURIComponent(params[0] || '').toLowerCase();
        fileServed = await serveStaticFile(name, res);
      } else if (endpoint === 'ext') {
        const ext = decodeURIComponent(params[0] || '').toLowerCase();
        fileServed = await serveStaticFile(ext, res);
      } else {
        // Default route - treat the entire path as a filename and search through all folder locations
        const filePath = pathParts.join('/');
        fileServed = await serveStaticFile(filePath, res, FOLDER_LOCATIONS);
      }
    }

    if (!fileServed) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  } catch (e) {
    console.error('Error processing request:', e);
    res.writeHead(500).end('Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`Image server listening on http://localhost:${PORT}`);
  console.log(`Serving static images from: ${IMAGE_ROOT_DIR}`);
  console.log(`Additional search locations: ${FOLDER_LOCATIONS.slice(1).join(', ') || 'none'}`);
});
