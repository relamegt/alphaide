const express = require('express');
const fs      = require('fs-extra');
const path    = require('path');
const axios   = require('axios');
const extract = require('extract-zip');

const app        = express();
const WORKSPACES = '/home/coder/workspaces';
const API        = process.env.ALPHA_BACKEND || 'https://api.alphalearn.com';
const AUTH_FILE  = '/root/.alpha/auth.json';

app.use(express.json());

// ── Health check ──────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── Heartbeat — browser pings this to keep container alive ─
let lastPing = Date.now();
app.post('/ping', (req, res) => {
  lastPing = Date.now();
  res.json({ ok: true });
});

// Auto-shutdown after 15 min idle (no browser open)
setInterval(() => {
  if (Date.now() - lastPing > 15 * 60 * 1000) {
    console.log('No browser activity for 15 min — shutting down...');
    process.exit(0);
  }
}, 60 * 1000);

// ── Main route — triggered by LMS deep link ───────────────
app.get('/', async (req, res) => {
  const { assignmentId } = req.query;

  if (!assignmentId) {
    return res.send(`<!DOCTYPE html><html>
    <head><title>AlphaLearn IDE</title></head>
    <body style="background:#1a1a2e;color:#888;font-family:monospace;
                 display:flex;align-items:center;justify-content:center;
                 height:100vh;margin:0;text-align:center">
      <div>
        <div style="font-size:22px;color:#e94560;margin-bottom:10px;font-weight:700">
          🅐 AlphaLearn IDE
        </div>
        <div style="font-size:13px">Ready. Open an assignment from your LMS.</div>
      </div>
    </body></html>`);
  }

  if (!fs.existsSync(AUTH_FILE)) {
    return res.status(401).send(`<!DOCTYPE html><html>
    <head><title>AlphaLearn — Authenticate</title></head>
    <body style="background:#1a1a2e;color:#fff;font-family:monospace;
                 padding:40px;text-align:center">
      <h2 style="color:#e94560">🔐 Not Authenticated</h2>
      <p style="margin:16px 0;color:#aaa">Open the terminal in the IDE and run:</p>
      <div style="background:#0f0f1a;padding:15px 24px;border-radius:8px;
                  display:inline-block;margin:10px;border:1px solid #333">
        de style="color:#e94560;font-size:15px">alpha authenticate YOUR_TOKEN</code>
      </div>
      <p style="margin-top:20px;color:#666;font-size:13px">
        Get your token from:
        <a href="https://alphalearn.com/ide-token" style="color:#e94560">
          alphalearn.com/ide-token
        </a>
      </p>
    </body></html>`);
  }

  const auth   = fs.readJsonSync(AUTH_FILE);
  const wsName = `${auth.username}-${assignmentId}`;
  const wsPath = path.join(WORKSPACES, wsName);

  if (!fs.existsSync(wsPath)) {
    try {
      console.log(`Downloading template: assignment=${assignmentId}`);

      const response = await axios.get(
        `${API}/api/assignments/${assignmentId}/template`,
        { params: { token: auth.token }, responseType: 'arraybuffer', timeout: 30000 }
      );

      fs.mkdirpSync(wsPath);
      const zipPath = `/tmp/${wsName}-${Date.now()}.zip`;
      fs.writeFileSync(zipPath, response.data);
      await extract(zipPath, { dir: wsPath });
      fs.removeSync(zipPath);

      // Patch package.json
      const pkgPath = path.join(wsPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = fs.readJsonSync(pkgPath);
        pkg.scripts = { ...pkg.scripts, evaluate: 'alpha evaluate', submit: 'alpha submit' };
        fs.writeJsonSync(pkgPath, pkg, { spaces: 2 });
      }

      patchViteConfig(wsPath);

      fs.writeJsonSync(path.join(wsPath, '.alpharc'), {
        assignmentId, token: auth.token,
        userId: auth.userId, username: auth.username
      });

      console.log(`Workspace ready: ${wsPath}`);
    } catch (err) {
      console.error('Template download failed:', err.message);
      return res.status(500).send(`<!DOCTYPE html><html>
      <body style="background:#1a1a2e;color:#e94560;font-family:monospace;
                   padding:40px;text-align:center">
        <h2>❌ Failed to Load Assignment</h2>
        <p style="color:#888;margin-top:10px">${err.message}</p>
        <p style="color:#666;font-size:12px;margin-top:20px">Check internet and try again.</p>
      </body></html>`);
    }
  }

  return res.redirect(302, `/?folder=${encodeURIComponent(wsPath)}`);
});

// ── Vite config patcher ────────────────────────────────────
function patchViteConfig(wsPath) {
  const configs = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'];
  for (const cf of configs) {
    const cfPath = path.join(wsPath, cf);
    if (!fs.existsSync(cfPath)) continue;
    let content = fs.readFileSync(cfPath, 'utf8');
    if (content.includes('__alpha_start')) return;

    const block = `
  // __alpha_start
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: 'all',
    hmr: { host: 'localhost', clientPort: 3001 },
  },
  // __alpha_end`;

    content = content.replace(/\s*server\s*:\s*\{[^}]*\},?/gs, '');
    if (content.includes('defineConfig({')) {
      content = content.replace('defineConfig({', `defineConfig({${block}`);
    } else if (content.includes('export default {')) {
      content = content.replace('export default {', `export default {${block}`);
    }
    fs.writeFileSync(cfPath, content);
    console.log(`vite.config patched: ${cfPath}`);
    return;
  }

  // Create if it's a vite project but no config file
  const pkgPath = path.join(wsPath, 'package.json');
  if (!fs.existsSync(pkgPath)) return;
  const pkg = fs.readJsonSync(pkgPath);
  const deps = JSON.stringify({ ...pkg.dependencies, ...pkg.devDependencies });
  if (!deps.includes('vite')) return;
  const hasReact = deps.includes('"react"');
  fs.writeFileSync(path.join(wsPath, 'vite.config.js'),
    `import { defineConfig } from 'vite'\n` +
    (hasReact ? `import react from '@vitejs/plugin-react'\n` : '') +
    `\nexport default defineConfig({\n` +
    (hasReact ? `  plugins: [react()],\n` : '') +
    `  // __alpha_start\n` +
    `  server: {\n    host: '0.0.0.0',\n    port: 5173,\n    strictPort: false,\n` +
    `    allowedHosts: 'all',\n    hmr: { host: 'localhost', clientPort: 3001 },\n  },\n` +
    `  // __alpha_end\n})\n`
  );
  console.log('vite.config.js created');
}

app.listen(8081, '127.0.0.1', () => {
  console.log('AlphaLearn Init Server → 127.0.0.1:8081');
});