#!/bin/bash

# ============================================================
#   AlphaLearn IDE — Mac/Linux Installer
# ============================================================

set -e

DOCKER_HUB_USER="realmegtnoet"
IMAGE="$DOCKER_HUB_USER/alphalearnide:latest"
CONTAINER_NAME="alphalearn-ide"
LAUNCHER_NAME="alphalearn-ide"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${RED}╔══════════════════════════════════════════════╗${NC}"
echo -e "${RED}║      🅐  AlphaLearn IDE — Installer          ║${NC}"
echo -e "${RED}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── Step 1: Check Node.js ─────────────────────────────────
echo -e "${CYAN}[1/6] Checking Node.js...${NC}"
if ! command -v node &>/dev/null; then
  echo -e "${YELLOW}  Node.js not found. Installing...${NC}"
  if command -v brew &>/dev/null; then
    brew install node
  elif command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y nodejs
  else
    echo -e "${RED}  ❌ Cannot auto-install Node.js.${NC}"
    echo "     Install from: https://nodejs.org"
    exit 1
  fi
else
  echo -e "${GREEN}  ✓ Node.js $(node -v)${NC}"
fi

# ── Step 2: Check Docker ──────────────────────────────────
echo -e "${CYAN}[2/6] Checking Docker...${NC}"
if ! command -v docker &>/dev/null; then
  echo -e "${RED}  ❌ Docker Desktop not found.${NC}"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo ""
    read -p "     Open Docker Desktop download page? (y/n): " yn
    [[ "$yn" == "y" ]] && open "https://docker.com/products/docker-desktop"
  else
    echo "     Install: https://docs.docker.com/engine/install/ubuntu/"
  fi
  echo "     After installing Docker, run this script again."
  exit 1
fi
echo -e "${GREEN}  ✓ Docker found${NC}"

# ── Step 3: Auto-start Docker on login ───────────────────
echo -e "${CYAN}[3/6] Configuring Docker to auto-start on login...${NC}"
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS — add Docker to Login Items
  osascript -e 'tell application "System Events" to make login item at end with properties \
    {path:"/Applications/Docker.app", hidden:true}' 2>/dev/null || true
  echo -e "${GREEN}  ✓ Docker Desktop set to auto-start on login (macOS)${NC}"

elif [[ "$OSTYPE" == "linux"* ]]; then
  # Linux — enable Docker service
  sudo systemctl enable docker 2>/dev/null || true
  sudo systemctl start  docker 2>/dev/null || true
  echo -e "${GREEN}  ✓ Docker service enabled on boot (Linux)${NC}"
fi

# Ensure Docker is running right now
if ! docker info &>/dev/null; then
  echo -e "${YELLOW}  Docker not running. Starting now...${NC}"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    open -a Docker
    echo -e "${CYAN}  Waiting for Docker to start (up to 60s)...${NC}"
    for i in $(seq 1 60); do
      docker info &>/dev/null && break
      sleep 1; printf "."
    done
    echo ""
  fi
  if ! docker info &>/dev/null; then
    echo -e "${RED}  ❌ Docker failed to start. Please open Docker Desktop manually and re-run.${NC}"
    exit 1
  fi
fi
echo -e "${GREEN}  ✓ Docker is running${NC}"

# ── Step 4: Pull IDE image ────────────────────────────────
echo ""
echo -e "${CYAN}[4/6] Downloading AlphaLearn IDE image...${NC}"
echo "     (First time ~500MB — subsequent runs are instant)"
echo ""
docker pull "$IMAGE"
echo -e "${GREEN}  ✓ IDE image ready${NC}"

# ── Step 5: Install launcher ──────────────────────────────
echo ""
echo -e "${CYAN}[5/6] Installing launcher...${NC}"

LAUNCHER_PATH="/usr/local/bin/$LAUNCHER_NAME"

sudo tee "$LAUNCHER_PATH" > /dev/null << LAUNCHER_EOF
#!/bin/bash

IMAGE="$IMAGE"
CONTAINER_NAME="$CONTAINER_NAME"

RED='\033[0;31m'; GREEN='\033[0;32m'
YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

ASSIGN_ID="\$1"
TOKEN="\$2"

echo ""
echo -e "\${RED}╔══════════════════════════════╗\${NC}"
echo -e "\${RED}║   🅐  AlphaLearn IDE          ║\${NC}"
echo -e "\${RED}╚══════════════════════════════╝\${NC}"
echo ""

# ── Auto-start Docker if not running ─────────────────────
if ! docker info &>/dev/null; then
  echo -e "\${YELLOW}⚙️  Docker not running. Starting automatically...\${NC}"
  if [[ "\$OSTYPE" == "darwin"* ]]; then
    open -a Docker
  else
    sudo systemctl start docker 2>/dev/null || true
  fi
  echo -e "\${CYAN}  Waiting for Docker (up to 60s)...\${NC}"
  for i in \$(seq 1 60); do
    docker info &>/dev/null && break
    sleep 1; printf "."
  done
  echo ""
  if ! docker info &>/dev/null; then
    echo -e "\${RED}❌ Docker failed to start. Open Docker Desktop manually and retry.\${NC}"
    exit 1
  fi
  echo -e "\${GREEN}  ✓ Docker started\${NC}"
fi

# ── Check if container already running ───────────────────
IS_RUNNING=\$(docker inspect -f '{{.State.Running}}' "\$CONTAINER_NAME" 2>/dev/null || echo "false")

if [ "\$IS_RUNNING" != "true" ]; then
  echo -e "\${CYAN}⬇️  Checking for updates...\${NC}"
  docker pull "\$IMAGE" --quiet 2>/dev/null || true

  docker rm "\$CONTAINER_NAME" 2>/dev/null || true

  echo -e "\${CYAN}🚀 Starting IDE...\${NC}"
  docker run -d \
    --name "\$CONTAINER_NAME" \
    -p 80:80 \
    -p 3001:3001 \
    -v alphalearn-workspaces:/home/coder/workspaces \
    -v alphalearn-auth:/root/.alpha \
    --restart no \
    "\$IMAGE"
else
  echo -e "\${YELLOW}♻️  IDE already running — reopening browser...\${NC}"
fi

# ── Wait for IDE to be ready ──────────────────────────────
echo -e "\${CYAN}⏳ Waiting for IDE to be ready...\${NC}"
for i in \$(seq 1 40); do
  STATUS=\$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/health 2>/dev/null || echo "000")
  if [ "\$STATUS" = "200" ]; then break; fi
  sleep 1; printf "."
done
echo ""

# ── Save auth token if provided ───────────────────────────
if [ -n "\$TOKEN" ]; then
  echo -e "\${CYAN}🔐 Saving authentication...\${NC}"
  docker exec "\$CONTAINER_NAME" sh -c \
    "mkdir -p /root/.alpha && node /alpha-cli/index.js authenticate '\$TOKEN'" 2>/dev/null || true
fi

# ── Open IDE in browser ───────────────────────────────────
if [ -n "\$ASSIGN_ID" ]; then
  URL="http://localhost/alpha-init/?assignmentId=\$ASSIGN_ID"
else
  URL="http://localhost"
fi

echo -e "\${GREEN}✅ Opening IDE → \$URL\${NC}"
if command -v xdg-open &>/dev/null; then xdg-open "\$URL"
elif command -v open &>/dev/null;    then open "\$URL"
else echo "     Open manually: \$URL"; fi

echo ""
echo -e "  IDE     → http://localhost"
echo -e "  Preview → http://localhost:3001"
echo ""

# ── Background watchdog — stop Docker when IDE closes ─────
# Polls every 60s; if container stopped, quits Docker Desktop
(
  while true; do
    sleep 60
    IS_RUNNING=\$(docker inspect -f '{{.State.Running}}' "\$CONTAINER_NAME" 2>/dev/null || echo "false")
    if [ "\$IS_RUNNING" != "true" ]; then
      echo -e "\${YELLOW}IDE container stopped. Quitting Docker Desktop...\${NC}"
      if [[ "\$OSTYPE" == "darwin"* ]]; then
        osascript -e 'quit app "Docker Desktop"' 2>/dev/null || true
      else
        sudo systemctl stop docker 2>/dev/null || true
      fi
      break
    fi
  done
) &

LAUNCHER_EOF

sudo chmod +x "$LAUNCHER_PATH"
echo -e "${GREEN}  ✓ Launcher installed → $LAUNCHER_PATH${NC}"

# ── Step 6: Register alphalearn:// protocol ───────────────
echo ""
echo -e "${CYAN}[6/6] Registering alphalearn:// protocol handler...${NC}"

if [[ "$OSTYPE" == "darwin"* ]]; then
  APP_DIR="$HOME/Applications/AlphaLearn.app/Contents"
  mkdir -p "$APP_DIR/MacOS"

  cat > "$APP_DIR/Info.plist" << 'PLIST_EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>com.alphalearn.ide</string>
  <key>CFBundleName</key><string>AlphaLearn IDE</string>
  <key>CFBundleDisplayName</key><string>AlphaLearn IDE</string>
  <key>CFBundleVersion</key><string>1.0.0</string>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>LSMinimumSystemVersion</key><string>10.14</string>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key><string>AlphaLearn IDE Protocol</string>
      <key>CFBundleURLSchemes</key>
      <array><string>alphalearn</string></array>
    </dict>
  </array>
  <key>LSBackgroundOnly</key><false/>
</dict>
</plist>
PLIST_EOF

  cat > "$APP_DIR/MacOS/launcher" << 'MACOS_EOF'
#!/bin/bash
RAW_URL="$1"
ASSIGN=$(echo "$RAW_URL" | sed 's|alphalearn://||' | sed 's|?.*||' | sed 's|/||g')
TOKEN=$(echo "$RAW_URL"  | grep -o 'token=[^&]*' | cut -d= -f2)
/usr/local/bin/alphalearn-ide "$ASSIGN" "$TOKEN"
MACOS_EOF

  chmod +x "$APP_DIR/MacOS/launcher"
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
    -f "$HOME/Applications/AlphaLearn.app" 2>/dev/null || true
  echo -e "${GREEN}  ✓ alphalearn:// registered (macOS)${NC}"

elif [[ "$OSTYPE" == "linux"* ]]; then
  DESKTOP_DIR="$HOME/.local/share/applications"
  mkdir -p "$DESKTOP_DIR"
  cat > "$DESKTOP_DIR/alphalearn-ide.desktop" << DESKTOP_EOF
[Desktop Entry]
Name=AlphaLearn IDE
Exec=/usr/local/bin/alphalearn-ide %u
Type=Application
MimeType=x-scheme-handler/alphalearn;
NoDisplay=true
DESKTOP_EOF
  xdg-mime default alphalearn-ide.desktop x-scheme-handler/alphalearn 2>/dev/null || true
  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
  echo -e "${GREEN}  ✓ alphalearn:// registered (Linux)${NC}"
fi

# ── Done ──────────────────────────────────────────────────
echo ""
echo -e "${RED}╔══════════════════════════════════════════════╗${NC}"
echo -e "${RED}║   ✅  AlphaLearn IDE Installed Successfully! ║${NC}"
echo -e "${RED}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Click 'Launch IDE' on alphalearn.com${NC}"
echo -e "  ${BOLD}— everything starts automatically.${NC}"
echo ""
echo -e "  Or run manually: ${CYAN}alphalearn-ide${NC}"
echo ""
echo -e "  IDE     → http://localhost"
echo -e "  Preview → http://localhost:3001"
echo ""