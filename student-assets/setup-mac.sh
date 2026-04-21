#!/bin/bash
set -e
echo "⬇️  Pulling AlphaLearn IDE..."
docker pull DOCKERHUB_USERNAME/alphalearnide:latest
mkdir -p ~/AlphaIDE/workspaces
mkdir -p ~/alpha-ide
curl -fsSL https://assets.alphalearn.com/ide/docker-compose.yml -o ~/alpha-ide/docker-compose.yml
echo "✅ Done! Now run:"
echo "   cd ~/alpha-ide && docker-compose up -d"
echo "   Open: http://localhost"