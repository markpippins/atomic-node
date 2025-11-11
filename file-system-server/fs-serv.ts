// This is a Node.js server file. The triple-slash directive below ensures that Node.js type definitions are available to the TypeScript compiler.
// FIX: Removed the line '''/// <reference types="node" />''' because the build environment cannot resolve node types, causing an error.

// FIX: Add declarations for Node.js globals to work around a build environment
// issue where the triple-slash directive for node types is not being resolved correctly.
declare const __dirname: string;
declare const process: {
    env: { [key: string]: string | undefined };
    cwd(): string;
    exit(code?: number): never;
    argv: string[];
};

import * as http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env file in the project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PORT = process.env.FS_SERVER_PORT || 4040;

// --- NEW: Allow command-line override for root directory ---
// Usage: node server.js [rootDir]
const cliRootArg = process.argv[2];
const effectiveRoot = cliRootArg || process.env.FS_ROOT_DIR;

// Ensure FS_ROOT_DIR is an absolute path for security.
const FS_ROOT_DIR = effectiveRoot
    ? path.resolve(effectiveRoot)
    : path.resolve(process.cwd(), 'fs_root');

interface RequestModel {
    alias: string;
    path: string[];
    operation: string;
    newName?: string;
    filename?: string;
    sourcePath?: string[];
    toAlias?: string;
    toPath?: string[];
    destPath?: string[];
    items?: { name: string; type: 'file' | 'folder' }[];
}

/**
 * Ensures that a resolved path is safely within a specified root directory.
 * @param rootDir The absolute path to the root directory.
 * @param parts An array of path segments to join.
 * @returns The resolved, validated absolute path.
 * @throws An error if the path is outside the root directory.
 */
function ensurePathExists(rootDir: string, parts: string[]): string {
    const resolvedPath = path.resolve(rootDir, ...parts);
    if (!resolvedPath.startsWith(rootDir)) {
        // Security check to prevent path traversal attacks.
        throw new Error('Invalid path traversal attempted');
    }
    return resolvedPath;
}

const server = http.createServer(async (req, res) => {
    // Handle CORS pre-flight requests and set CORS headers for all responses.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Handle health check endpoint
    if (req.url === '/health' && req.method === 'GET') {
        try {
            // Check if the file system root directory is accessible
            await fs.access(FS_ROOT_DIR);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'UP',
                service: 'file-system-server',
                timestamp: new Date().toISOString(),
                details: {
                    fsRootDir: FS_ROOT_DIR,
                    port: PORT
                }
            }));
        } catch (error) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'DOWN',
                service: 'file-system-server',
                timestamp: new Date().toISOString(),
                error: 'File system root directory not accessible'
            }));
        }
        return;
    }

    if (req.url === '/fs' && req.method === 'POST') {
        try {
            let body = '';
            for await (const chunk of req) {
                body += chunk;
            }
            const requestData: RequestModel = JSON.parse(body);

            const userRoot = FS_ROOT_DIR;
            await fs.mkdir(userRoot, { recursive: true });

            let responseData: object;

            switch (requestData.operation) {
                case 'ls': {
                    const targetPath = ensurePathExists(userRoot, requestData.path);
                    const stats = await fs.stat(targetPath);
                    if (!stats.isDirectory()) {
                        throw new Error('Path is not a directory');
                    }
                    const items = [];
                    for (const itemName of await fs.readdir(targetPath)) {
                        const itemPath = path.join(targetPath, itemName);
                        const itemStats = await fs.stat(itemPath);
                        items.push({
                            name: itemName,
                            type: itemStats.isDirectory() ? 'directory' : 'file',
                            size: itemStats.size,
                            last_modified: itemStats.mtimeMs,
                        });
                    }
                    responseData = { path: requestData.path, items };
                    break;
                }
                case 'cd': {
                    const targetPath = ensurePathExists(userRoot, requestData.path);
                    const stats = await fs.stat(targetPath);
                    if (!stats.isDirectory()) {
                        throw new Error('Path is not a directory');
                    }
                    responseData = { path: requestData.path };
                    break;
                }
                case 'mkdir': {
                    const targetPath = ensurePathExists(userRoot, requestData.path);
                    await fs.mkdir(targetPath, { recursive: true });
                    responseData = { created: targetPath };
                    break;
                }
                case 'rmdir': {
                    const targetPath = ensurePathExists(userRoot, requestData.path);
                    await fs.rm(targetPath, { recursive: true, force: true });
                    responseData = { deleted: targetPath };
                    break;
                }
                case 'newfile': {
                    if (!requestData.filename) {
                        throw new Error('Filename is required for newfile operation');
                    }
                    const parentDirPath = ensurePathExists(userRoot, requestData.path);
                    await fs.mkdir(parentDirPath, { recursive: true });
                    const newFilePath = path.join(parentDirPath, requestData.filename);
                    await fs.writeFile(newFilePath, '');
                    responseData = { created_file: newFilePath };
                    break;
                }
                case 'deletefile': {
                    if (!requestData.filename) {
                         throw new Error('Filename is required for deletefile operation');
                    }
                    const targetPath = ensurePathExists(userRoot, [...requestData.path, requestData.filename]);
                    await fs.unlink(targetPath);
                    responseData = { deleted_file: targetPath };
                    break;
                }
                case 'rename': {
                    if (!requestData.newName) {
                        throw new Error('New name is required for rename operation');
                    }
                    const sourcePath = ensurePathExists(userRoot, requestData.path);
                    const newPath = path.join(path.dirname(sourcePath), requestData.newName);
                    await fs.rename(sourcePath, newPath);
                    responseData = { renamed: sourcePath, to: newPath };
                    break;
                }
                case 'copy': {
                    const sourcePath = ensurePathExists(userRoot, requestData.path);
                    const destPath = ensurePathExists(userRoot, requestData.toPath as string[]);
                    await fs.cp(sourcePath, destPath, { recursive: true });
                    responseData = { copied: sourcePath, to: destPath };
                    break;
                }
                case 'move': {
                    const sourcePath = ensurePathExists(userRoot, requestData.path);
                    const destPath = ensurePathExists(userRoot, requestData.toPath as string[]);
                    await fs.rename(sourcePath, destPath);
                    responseData = { moved: sourcePath, to: destPath };
                    break;
                }
                default:
                    throw new Error(`Unknown operation: ${requestData.operation}`);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(responseData));
        } catch (error: any) {
            let statusCode = 500;
            let message = error.message || 'Internal Server Error';

            if (error.code === 'ENOENT' || error.message.includes('not a directory')) {
                statusCode = 404;
                message = 'Not Found';
            } else if (error.message.includes('required for')) {
                statusCode = 400;
            }

            res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ detail: message }));
        }
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ detail: 'Not Found' }));
    }
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`File system root is ${FS_ROOT_DIR}`);
});
