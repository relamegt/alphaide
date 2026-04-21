FROM codercom/code-server:4.91.0

USER root

RUN rm -f /etc/nginx/sites-enabled/default \
    && rm -f /etc/nginx/sites-available/default

RUN apt-get update && apt-get install -y \
    curl git unzip nginx python3 build-essential \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g nodemon concurrently live-server vite typescript ts-node \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Disable Extensions Gallery
RUN node -e "\
  const fs=require('fs');\
  const p='/usr/lib/code-server/lib/vscode/product.json';\
  const j=JSON.parse(fs.readFileSync(p,'utf8'));\
  delete j.extensionsGallery;\
  j.linkProtectionTrustedDomains=[];\
  fs.writeFileSync(p,JSON.stringify(j,null,2));\
  console.log('Extensions gallery removed');\
"

# Hide Extensions button — Node.js avoids all shell escaping issues
RUN node -e "\
  const fs=require('fs');\
  const {execSync}=require('child_process');\
  try{\
    const files=execSync('find /usr/lib/code-server -name workbench.html 2>/dev/null').toString().trim().split('\n').filter(Boolean);\
    if(!files.length){console.log('workbench.html not found, skipping');process.exit(0);}\
    const r=files[0];\
    let h=fs.readFileSync(r,'utf8');\
    const style='<style>'\
      +'[aria-label=\"Extensions (Ctrl+Shift+X)\"],'\
      +'[title=\"Extensions (Ctrl+Shift+X)\"],'\
      +'li[id*=\"workbench.view.extensions\"],'\
      +'.composite-bar li[aria-label*=\"Extensions\"]'\
      +'{display:none!important;width:0!important;height:0!important;overflow:hidden!important}'\
      +'</style></head>';\
    h=h.replace('</head>',style);\
    fs.writeFileSync(r,h);\
    console.log('Workbench HTML patched at: '+r);\
  }catch(e){console.log('Patch skipped: '+e.message);}\
"

# AlphaLearn extension
COPY alpha-extension/alpha-lms-0.0.1.vsix /tmp/alpha-lms.vsix
RUN code-server --install-extension /tmp/alpha-lms.vsix && rm /tmp/alpha-lms.vsix

# Curated extensions
RUN code-server --install-extension esbenp.prettier-vscode \
    && code-server --install-extension dbaeumer.vscode-eslint \
    && code-server --install-extension formulahendry.auto-close-tag \
    && code-server --install-extension formulahendry.auto-rename-tag \
    && code-server --install-extension PKief.material-icon-theme

# Config
COPY config/config.yaml   /root/.config/code-server/config.yaml
COPY config/settings.json /root/.local/share/code-server/User/settings.json

# Init server
COPY init-server/ /alpha-init/
RUN  cd /alpha-init && npm install --production

# Alpha CLI
COPY alpha-cli/ /alpha-cli/
RUN  cd /alpha-cli && npm install --production && npm link

# Nginx
COPY nginx/nginx.conf /etc/nginx/nginx.conf
RUN  nginx -t

RUN mkdir -p /root/.alpha /home/coder/workspaces /var/log/nginx \
    && chmod -R 777 /home/coder/workspaces

COPY start.sh /start.sh
RUN  chmod +x /start.sh

EXPOSE 80
EXPOSE 3001
ENTRYPOINT []
CMD ["/start.sh"]