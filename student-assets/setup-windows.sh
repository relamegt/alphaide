#!/bin/bash
set -e
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   AlphaLearn IDE — Windows Setup         ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "⬇️  Pulling AlphaLearn IDE image..."
docker pull DOCKERHUB_USERNAME/alphalearnide:latest
mkdir -p ~/AlphaIDE/workspaces
mkdir -p /alpha-ide
curl -fsSL https://assets.alphalearn.com/ide/docker-compose.yml -o /alpha-ide/docker-compose.yml
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅ Setup Complete!                       ║"
echo "║                                          ║"
echo "║  1. RESTART your PC                      ║"
echo "║  2. Open Ubuntu terminal → run:          ║"
echo "║     cd /alpha-ide                        ║"
echo "║     docker-compose up -d                 ║"
echo "║  3. Open: http://localhost               ║"
echo "╚══════════════════════════════════════════╝"