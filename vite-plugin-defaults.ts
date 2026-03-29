/**
 * Vite plugin that serves files from `defaults/` as a fallback static directory.
 *
 * - Dev server: middleware serves from `defaults/` when not found in `static/`.
 * - Build: copies `defaults/` contents to `dist/` after adapter-static finishes,
 *   without overwriting files already placed by `static/` overrides.
 */

import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const MIME_TYPES: Record<string, string> = {
	'.html': 'text/html',
	'.js': 'application/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.svg': 'image/svg+xml',
	'.txt': 'text/plain',
	'.ico': 'image/x-icon'
};

function copyDir(src: string, dest: string) {
	if (!fs.existsSync(src)) return;
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			fs.mkdirSync(destPath, { recursive: true });
			copyDir(srcPath, destPath);
		} else if (entry.isFile() && !fs.existsSync(destPath)) {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

export default function defaultsPlugin(): Plugin {
	let defaultsDir: string;
	let publicDir: string;

	return {
		name: 'vite-plugin-defaults',

		configResolved(config) {
			defaultsDir = path.resolve(config.root, 'defaults');
			publicDir = config.publicDir;
		},

		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				if (req.method !== 'GET' && req.method !== 'HEAD') return next();

				const urlPath = decodeURIComponent(new URL(req.url!, 'http://localhost').pathname);
				if (urlPath.startsWith('/@') || urlPath.startsWith('/__')) return next();

				const relPath = urlPath.slice(1);
				if (!relPath) return next();

				// Let Vite's built-in static middleware handle files in static/
				const publicFile = path.join(publicDir, relPath);
				if (fs.existsSync(publicFile) && fs.statSync(publicFile).isFile()) return next();

				// Serve from defaults/ as fallback
				const defaultsFile = path.join(defaultsDir, relPath);
				if (fs.existsSync(defaultsFile) && fs.statSync(defaultsFile).isFile()) {
					const ext = path.extname(defaultsFile).toLowerCase();
					const contentType = MIME_TYPES[ext] || 'application/octet-stream';
					const content = fs.readFileSync(defaultsFile);
					res.setHeader('Content-Type', contentType);
					res.setHeader('Content-Length', content.length);
					res.end(content);
					return;
				}

				next();
			});
		},

		closeBundle: {
			sequential: true,
			order: 'post',
			handler() {
				const distDir = path.resolve(defaultsDir, '..', 'dist');
				// Only run after adapter-static has written dist/index.html
				if (!fs.existsSync(path.join(distDir, 'index.html'))) return;
				copyDir(defaultsDir, distDir);
			}
		}
	};
}
