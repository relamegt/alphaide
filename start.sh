#!/bin/bash
set -e

export NODE_OPTIONS="--dns-result-order=ipv4first"

echo "================================================"
echo "  🅐 AlphaLearn IDE Starting..."
echo "================================================"

# Patch existing vite configs
find /home/coder/workspaces -name "vite.config.*" 2>/dev/null | while read cfg; do
  if ! grep -q "__alpha_start" "$cfg" 2>/dev/null; then
    node -e "
      const fs = require('fs');
      let c = fs.readFileSync('$cfg','utf8');
      const b = \`
  // __alpha_start
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: 'all',
    hmr: { host: 'localhost', clientPort: 3001 },
  },
  // __alpha_end\`;
      c = c.replace(/\\s*server\\s*:\\s*\\{[^}]*\\},?/gs, '');
      if (c.includes('defineConfig({')) c = c.replace('defineConfig({', 'defineConfig({'+b);
      fs.writeFileSync('$cfg', c);
    " 2>/dev/null || true
  fi
done

echo "[1/3] Starting code-server..."
NODE_OPTIONS="--dns-result-order=ipv4first" code-server \
  --bind-addr 127.0.0.1:8080 \
  --auth none \
  --user-data-dir /root/.local/share/code-server \
  --extensions-dir /root/.local/share/code-server/extensions \
  /home/coder/workspaces > /var/log/code-server.log 2>&1 &

for i in $(seq 1 30); do
  curl -s http://127.0.0.1:8080 > /dev/null 2>&1 && echo "  code-server ready ✓" && break
  sleep 1
done

echo "[2/3] Starting init server..."
NODE_OPTIONS="--dns-result-order=ipv4first" node /alpha-init/server.js \
  > /var/log/init-server.log 2>&1 &
sleep 1
echo "  Init server ready ✓"

echo "[3/3] Starting nginx..."
echo "================================================"
echo "  IDE     → http://localhost"
echo "  Preview → http://localhost:3001"
echo "================================================"
exec nginx -g "daemon off;"