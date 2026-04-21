#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const open = require('open');
const net  = require('net');

const IMAGE          = 'realmegtnoet/alphalearnide:latest';
const CONTAINER_NAME = 'alphalearn-ide';

// Parse args: alphalearn-ide [assignmentId] [token]
const assignmentId = process.argv[2] || '';
const token        = process.argv[3] || '';

async function isPortOpen(port) {
  return new Promise(resolve => {
    const s = net.createConnection({ port, host: '127.0.0.1' });
    s.setTimeout(500);
    s.on('connect', () => { s.destroy(); resolve(true);  });
    s.on('error',   () => { s.destroy(); resolve(false); });
    s.on('timeout', () => { s.destroy(); resolve(false); });
  });
}

async function isDockerRunning() {
  try { execSync('docker info', { stdio: 'ignore' }); return true; }
  catch { return false; }
}

async function isContainerRunning() {
  try {
    const out = execSync(`docker inspect -f "{{.State.Running}}" ${CONTAINER_NAME} 2>/dev/null`).toString().trim();
    return out === 'true';
  } catch { return false; }
}

async function main() {
  console.log('\n🅐 AlphaLearn IDE Launcher\n');

  // Check Docker
  if (!await isDockerRunning()) {
    console.error('❌ Docker Desktop is not running.\n   Start Docker Desktop and try again.');
    process.exit(1);
  }

  const alreadyRunning = await isContainerRunning();

  if (!alreadyRunning) {
    // Pull latest if not present
    console.log('⬇️  Checking for updates...');
    try { execSync(`docker pull ${IMAGE}`, { stdio: 'inherit' }); } catch {}

    // Remove old stopped container
    try { execSync(`docker rm ${CONTAINER_NAME}`, { stdio: 'ignore' }); } catch {}

    console.log('🚀 Starting AlphaLearn IDE...');
    execSync(
      `docker run -d ` +
      `--name ${CONTAINER_NAME} ` +
      `-p 80:80 -p 3001:3001 ` +
      `-v alphalearn-workspaces:/home/coder/workspaces ` +
      `-v alphalearn-auth:/root/.alpha ` +
      `--restart no ` +
      `${IMAGE}`,
      { stdio: 'inherit' }
    );
  } else {
    console.log('♻️  IDE already running — opening...');
  }

  // Wait for IDE to be ready
  console.log('⏳ Waiting for IDE to be ready...');
  for (let i = 0; i < 30; i++) {
    if (await isPortOpen(80)) break;
    await new Promise(r => setTimeout(r, 1000));
    process.stdout.write('.');
  }
  console.log(' ready!\n');

  // Build URL — go directly to assignment if provided
  let url = 'http://localhost';
  if (assignmentId) {
    url = `http://localhost/alpha-init/?assignmentId=${assignmentId}`;
  }

  // If token provided, write auth first
  if (token) {
    execSync(`docker exec ${CONTAINER_NAME} sh -c "mkdir -p /root/.alpha && node /alpha-cli/index.js authenticate ${token}"`, { stdio: 'inherit' });
  }

  console.log(`✅ Opening IDE → ${url}`);
  await open(url);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
