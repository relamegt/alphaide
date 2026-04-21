#!/usr/bin/env node

const fs   = require('fs-extra');
const path = require('path');
const net  = require('net');
const axios = require('axios');

const AUTH_FILE  = '/root/.alpha/auth.json';
const WORKSPACES = '/home/coder/workspaces';
const API        = process.env.ALPHA_BACKEND || 'https://api.alphalearn.com';

const [,, cmd, arg] = process.argv;

// ── Helpers ───────────────────────────────────────────────
function getAuth() {
  if (!fs.existsSync(AUTH_FILE)) {
    console.error('\n❌ Not authenticated.\n   Run: alpha authenticate <TOKEN>\n');
    process.exit(1);
  }
  return fs.readJsonSync(AUTH_FILE);
}

function getRC() {
  const p = path.join(process.cwd(), '.alpharc');
  if (!fs.existsSync(p)) {
    console.error('\n❌ No assignment open.\n   Run: alpha start <ASSIGNMENT_ID>\n');
    process.exit(1);
  }
  return fs.readJsonSync(p);
}

async function detectRunningPort(ports) {
  for (const port of ports) {
    const open = await new Promise(resolve => {
      const s = net.createConnection({ port, host: '127.0.0.1' });
      s.setTimeout(400);
      s.on('connect', () => { s.destroy(); resolve(true);  });
      s.on('error',   () => { s.destroy(); resolve(false); });
      s.on('timeout', () => { s.destroy(); resolve(false); });
    });
    if (open) return port;
  }
  return null;
}

function patchViteConfig(wsPath) {
  const configs = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'];

  for (const cf of configs) {
    const cfPath = path.join(wsPath, cf);
    if (!fs.existsSync(cfPath)) continue;

    let content = fs.readFileSync(cfPath, 'utf8');

    // Remove any previous alphalearn patch
    content = content.replace(/\/\/ __alpha_start[\s\S]*?\/\/ __alpha_end\n?/g, '');

    const patch = `
  // __alpha_start
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: 'all',
    hmr: { host: 'localhost', clientPort: 3001 },
  },
  // __alpha_end`;

    // Remove existing server block if present before injecting
    content = content.replace(/\s*server\s*:\s*\{[^}]*\},?/gs, '');

    if (content.includes('defineConfig({')) {
      content = content.replace('defineConfig({', `defineConfig({${patch}`);
    } else if (content.includes('export default {')) {
      content = content.replace('export default {', `export default {${patch}`);
    }

    fs.writeFileSync(cfPath, content);
    console.log('✅ vite.config.js patched');
    return;
  }

  // Create vite.config.js if none exists
  const pkgPath = path.join(wsPath, 'package.json');
  if (!fs.existsSync(pkgPath)) return;
  const pkg = fs.readJsonSync(pkgPath);
  const deps = JSON.stringify({ ...pkg.dependencies, ...pkg.devDependencies });
  if (!deps.includes('vite')) return;

  const hasReact = deps.includes('"react"');
  fs.writeFileSync(path.join(wsPath, 'vite.config.js'), [
    `import { defineConfig } from 'vite'`,
    hasReact ? `import react from '@vitejs/plugin-react'` : '',
    ``,
    `export default defineConfig({`,
    hasReact ? `  plugins: [react()],` : '',
    `  server: {`,
    `    host: '0.0.0.0',`,
    `    port: 5173,`,
    `    strictPort: false,`,
    `    allowedHosts: 'all',`,
    `    hmr: { host: 'localhost', clientPort: 3001 },`,
    `  },`,
    `})`,
  ].filter(Boolean).join('\n') + '\n');
  console.log('✅ vite.config.js created');
}

// ── Commands ──────────────────────────────────────────────
const commands = {

  // ── authenticate ────────────────────────────────────────
  async authenticate(token) {
    if (!token) {
      console.error('\nUsage: alpha authenticate <TOKEN>\n');
      process.exit(1);
    }
    console.log('\n🔐 Authenticating with AlphaLearn...\n');

    let data;
    try {
      const res = await axios.post(`${API}/api/ide/authenticate`, { token }, { timeout: 10000 });
      data = res.data;
    } catch (e) {
      console.error('❌ Server unreachable. Check your internet connection.');
      process.exit(1);
    }

    if (!data.valid) {
      console.error('❌ Invalid token. Get a new one: alphalearn.com/ide-token');
      process.exit(1);
    }

    fs.mkdirpSync('/root/.alpha');
    fs.writeJsonSync(AUTH_FILE, {
      token,
      userId:   data.userId,
      username: data.username
    }, { spaces: 2 });

    console.log('╔══════════════════════════════════════════╗');
    console.log(`║  ✅ Authenticated as: ${data.username.padEnd(18)} ║`);
    console.log('║                                          ║');
    console.log('║  Next: alpha start <ASSIGNMENT_ID>       ║');
    console.log('╚══════════════════════════════════════════╝\n');
  },

  // ── start ────────────────────────────────────────────────
  async start(assignmentId) {
    if (!assignmentId) {
      console.error('\nUsage: alpha start <ASSIGNMENT_ID>\n');
      process.exit(1);
    }

    const auth   = getAuth();
    const wsName = `${auth.username}-${assignmentId}`;
    const wsPath = path.join(WORKSPACES, wsName);

    console.log(`\n📂 Assignment: ${assignmentId}\n`);

    if (!fs.existsSync(wsPath)) {
      console.log('⬇️  Downloading template...');

      let templateData;
      try {
        const res = await axios.get(
          `${API}/api/assignments/${assignmentId}/template`,
          { params: { token: auth.token }, responseType: 'arraybuffer', timeout: 30000 }
        );
        templateData = res.data;
      } catch (e) {
        console.error('❌ Assignment not found or access denied.');
        process.exit(1);
      }

      fs.mkdirpSync(wsPath);
      const zipPath = `/tmp/${wsName}-${Date.now()}.zip`;
      fs.writeFileSync(zipPath, templateData);
      await require('extract-zip')(zipPath, { dir: wsPath });
      fs.removeSync(zipPath);

      // Patch package.json
      const pkgPath = path.join(wsPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = fs.readJsonSync(pkgPath);
        pkg.scripts = { ...pkg.scripts, evaluate: 'alpha evaluate', submit: 'alpha submit' };
        fs.writeJsonSync(pkgPath, pkg, { spaces: 2 });
      }

      // Patch vite config for proxy
      patchViteConfig(wsPath);

      // Write .alpharc
      fs.writeJsonSync(path.join(wsPath, '.alpharc'), {
        assignmentId,
        token:    auth.token,
        userId:   auth.userId,
        username: auth.username
      });

      console.log('✅ Workspace ready!\n');
    } else {
      console.log('♻️  Resuming existing workspace...\n');
      // Re-patch vite config in case it was missing
      patchViteConfig(wsPath);
    }

    // Signal IDE to open folder
    fs.writeJsonSync('/root/.alpha/open-request.json', {
      wsPath, timestamp: Date.now()
    });

    console.log(`📁 ${wsPath}`);
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Start app  :  npm install && npm run dev');
    console.log('  Preview    :  http://localhost/proxy/5173/');
    console.log('               (check terminal for actual port)');
    console.log('  HTML proj  :  alpha preview');
    console.log('  Evaluate   :  alpha evaluate');
    console.log('  Submit     :  alpha submit');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  },

  // ── preview ──────────────────────────────────────────────
  async preview() {
    const wsPath  = process.cwd();
    const hasFile = f => fs.existsSync(path.join(wsPath, f));
    const isHTML  = hasFile('index.html') && !hasFile('package.json');

    if (isHTML) {
      console.log('\n🌐 Starting Live Server for HTML/CSS/JS...');
      console.log('   Preview → http://localhost/proxy/8181/\n');
      const { spawn } = require('child_process');
      spawn('live-server', [
        wsPath,
        '--port=8181',
        '--host=0.0.0.0',
        '--no-browser',
        '--quiet'
      ], { stdio: 'inherit' });
      return;
    }

    // Node/Vite — scan for running port
    const port = await detectRunningPort([5173, 5174, 3000, 3001, 4000, 8080, 8000]);

    if (port) {
      console.log(`\n✅ App running on port ${port}`);
      console.log(`   Open → http://localhost/proxy/${port}/\n`);
    } else {
      // Auto start dev server
      console.log('\n⚠️  No app running. Starting now...\n');
      patchViteConfig(wsPath);

      const pkg    = hasFile('package.json') ? fs.readJsonSync(path.join(wsPath, 'package.json')) : {};
      const devCmd = pkg.scripts?.dev ? 'npm run dev -- --host 0.0.0.0' : 'npm start';

      const { spawn } = require('child_process');
      spawn('bash', ['-c', devCmd], {
        stdio: 'inherit',
        cwd:   wsPath,
        env:   { ...process.env }
      });

      // Wait then tell user the URL
      await new Promise(r => setTimeout(r, 3000));
      const newPort = await detectRunningPort([5173, 5174, 3000, 3001, 4000]);
      if (newPort) {
        console.log(`\n✅ App started on port ${newPort}`);
        console.log(`   Open → http://localhost/proxy/${newPort}/\n`);
      } else {
        console.log('\n   Open → http://localhost/proxy/5173/ once ready\n');
      }
    }
  },

  // ── evaluate ─────────────────────────────────────────────
  async evaluate() {
    const rc = getRC();
    console.log('\n🧪 AlphaLearn — Running Evaluation...\n');

    let testOutput = '';
    try {
      testOutput = require('child_process').execSync(
        'npm test -- --forceExit 2>&1',
        { encoding: 'utf8', cwd: process.cwd(), timeout: 60000 }
      );
    } catch (e) {
      testOutput = (e.stdout || '') + (e.stderr || '') + e.message;
    }

    let data;
    try {
      const res = await axios.post(`${API}/api/evaluate`, {
        token: rc.token, testOutput
      }, { timeout: 30000 });
      data = res.data;
    } catch (e) {
      console.error('❌ Failed to submit evaluation. Check connection.');
      process.exit(1);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Score  : ${data.score}/100`);
    console.log(`  Result : ${data.passed ? '✅ PASSED' : '❌ FAILED'}`);
    if (data.testResults?.length) {
      console.log('  Tests  :');
      data.testResults.forEach(t =>
        console.log(`    ${t.passed ? '✅' : '❌'} ${t.name}`)
      );
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  },

  // ── submit ───────────────────────────────────────────────
  async submit() {
    const skipConfirm = process.argv.includes('--confirm');
    const rc          = getRC();

    if (!skipConfirm) {
      const rl = require('readline').createInterface({
        input: process.stdin, output: process.stdout
      });
      const confirmed = await new Promise(resolve => {
        rl.question('🚀 Submit this assignment? (yes/no): ', ans => {
          rl.close();
          resolve(ans.trim().toLowerCase() === 'yes');
        });
      });
      if (!confirmed) { console.log('\nCancelled.\n'); process.exit(0); }
    }

    console.log('\n📦 Packaging workspace...');
    const zipPath = `/tmp/submit-${Date.now()}.zip`;
    const out     = require('fs').createWriteStream(zipPath);
    const archive = require('archiver')('zip', { zlib: { level: 9 } });

    archive.pipe(out);
    archive.glob('**/*', {
      cwd:    process.cwd(),
      ignore: ['node_modules/**', '.git/**', '*.log', 'dist/**', '.cache/**']
    });
    await archive.finalize();
    await new Promise(r => out.on('close', r));

    console.log('🚀 Uploading submission...');
    const FormData = require('form-data');
    const form     = new FormData();
    form.append('file',  require('fs').createReadStream(zipPath));
    form.append('token', rc.token);

    let data;
    try {
      const res = await axios.post(`${API}/api/submit`, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength:    Infinity,
        timeout:          60000
      });
      data = res.data;
    } catch (e) {
      console.error('❌ Upload failed:', e.message);
      process.exit(1);
    }

    fs.removeSync(zipPath);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Score   : ${data.score}/100`);
    console.log(`  Status  : ${data.passed ? '✅ SUBMITTED & PASSED' : '⚠️  SUBMITTED — Under Review'}`);
    console.log(`  View at : https://alphalearn.com/s/${data.submissionId}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
};

// ── Entry point ───────────────────────────────────────────
(async () => {
  const fn = commands[cmd];
  if (!fn) {
    console.log('\nAlphaLearn CLI — Commands:\n');
    console.log('  alpha authenticate <TOKEN>    — Login with your token');
    console.log('  alpha start <ASSIGNMENT_ID>   — Open/download assignment');
    console.log('  alpha preview                 — Start app preview');
    console.log('  alpha evaluate                — Run tests & get score');
    console.log('  alpha submit                  — Submit assignment\n');
    return;
  }
  await fn(arg).catch(e => {
    console.error('\n❌ Error:', e.message, '\n');
    process.exit(1);
  });
})();