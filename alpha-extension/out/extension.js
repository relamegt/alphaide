"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const AUTH_FILE = '/root/.alpha/auth.json';
function getRC() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders)
        return null;
    const p = path.join(folders[0].uri.fsPath, '.alpharc');
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}
function getAuth() {
    return fs.existsSync(AUTH_FILE)
        ? JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'))
        : null;
}
function getTerminal(name) {
    const t = vscode.window.terminals.find(x => x.name === name);
    if (t) {
        t.show();
        return t;
    }
    const nt = vscode.window.createTerminal(name);
    nt.show();
    return nt;
}
// Detect project type by checking files in workspace
function detectProjectType(wsPath) {
    const has = (f) => fs.existsSync(path.join(wsPath, f));
    if (has('vite.config.js') || has('vite.config.ts'))
        return 'vite';
    if (has('src/App.jsx') || has('src/App.tsx'))
        return 'react';
    if (has('index.html') && !has('package.json'))
        return 'html';
    if (has('index.html') && has('package.json'))
        return 'vite';
    if (has('package.json'))
        return 'node';
    return 'html';
}
function activate(context) {
    const logoPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'logo.png');
    // ── Status bar buttons ──────────────────────────────────
    const evalBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 102);
    evalBtn.text = '$(beaker) Evaluate';
    evalBtn.command = 'alpha.evaluate';
    evalBtn.tooltip = 'Run tests and get score';
    evalBtn.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    evalBtn.show();
    const submitBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
    submitBtn.text = '$(cloud-upload) Submit';
    submitBtn.command = 'alpha.submit';
    submitBtn.tooltip = 'Submit this assignment';
    submitBtn.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    submitBtn.show();
    const previewBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    previewBtn.text = '$(browser) Preview';
    previewBtn.command = 'alpha.preview';
    previewBtn.tooltip = 'Preview your app';
    previewBtn.show();
    const authBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    const auth = getAuth();
    authBtn.text = auth ? `$(account) ${auth.username}` : '$(warning) Not Authenticated';
    if (!auth)
        authBtn.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    authBtn.show();
    context.subscriptions.push(evalBtn, submitBtn, previewBtn, authBtn);
    // ── Sidebar ─────────────────────────────────────────────
    const provider = new SidebarProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('alphalearn.panel', provider));
    // ── EVALUATE ────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('alpha.evaluate', () => {
        const rc = getRC();
        if (!rc) {
            vscode.window.showErrorMessage('No assignment open. Run: alpha start <ID> in terminal');
            return;
        }
        const t = getTerminal('AlphaLearn');
        const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;
        t.sendText(`cd "${ws}" && alpha evaluate`);
    }));
    // ── SUBMIT ──────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('alpha.submit', async () => {
        const rc = getRC();
        if (!rc) {
            vscode.window.showErrorMessage('No assignment open.');
            return;
        }
        const ans = await vscode.window.showWarningMessage(`Submit Assignment: ${rc.assignmentId}?`, { modal: true }, 'Yes, Submit', 'Cancel');
        if (ans !== 'Yes, Submit')
            return;
        const t = getTerminal('AlphaLearn');
        const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;
        t.sendText(`cd "${ws}" && alpha submit --confirm`);
    }));
    // ── PREVIEW — FIXED, no false "not running" check ───────
    context.subscriptions.push(vscode.commands.registerCommand('alpha.preview', async () => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {
            vscode.window.showErrorMessage('No workspace open.');
            return;
        }
        const wsPath = folders[0].uri.fsPath;
        const type = detectProjectType(wsPath);
        const t = getTerminal('AlphaLearn');
        if (type === 'html') {
            // Pure HTML — start live-server then open
            t.sendText(`live-server "${wsPath}" --port=8181 --host=0.0.0.0 --no-browser --quiet`);
            await new Promise(r => setTimeout(r, 2000));
            vscode.env.openExternal(vscode.Uri.parse('http://localhost/proxy/8181/'));
            vscode.window.showInformationMessage('🌐 HTML Live Server started at /proxy/8181/ — auto-reloads on save!');
        }
        else if (type === 'vite' || type === 'react') {
            // Vite/React — ensure vite runs with host flag
            t.sendText(`cd "${wsPath}" && npm run dev -- --host 0.0.0.0 --port 3000`);
            await new Promise(r => setTimeout(r, 3000));
            vscode.env.openExternal(vscode.Uri.parse('http://localhost/proxy/3000/'));
            vscode.window.showInformationMessage('⚡ Vite dev server started — preview at /proxy/3000/');
        }
        else {
            // Node/Express — just open port 3000
            vscode.env.openExternal(vscode.Uri.parse('http://localhost/proxy/3000/'));
            vscode.window.showInformationMessage('🌐 Opening preview at port 3000. Make sure your server is running.');
        }
    }));
}
// ── Sidebar Webview ────────────────────────────────────────
class SidebarProvider {
    constructor(extUri) {
        this.extUri = extUri;
    }
    resolveWebviewView(view) {
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extUri] // allow local resources (logo)
        };
        view.webview.html = this.getHtml(view.webview);
        view.webview.onDidReceiveMessage(m => vscode.commands.executeCommand(`alpha.${m.cmd}`));
    }
    getHtml(webview) {
        const auth = getAuth();
        const rc = getRC();
        // FIXED logo loading — use webview.asWebviewUri for local resources
        const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extUri, 'resources', 'logo.png'));
        return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="
  default-src 'none';
  img-src ${webview.cspSource} https:;
  script-src 'unsafe-inline';
  style-src 'unsafe-inline';
">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    padding: 14px;
    background: var(--vscode-sideBar-background);
    color: var(--vscode-foreground);
  }
  .header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
  }
  .header img { width: 28px; height: 28px; border-radius: 4px; }
  .header .brand { font-size: 15px; font-weight: 700; color: #e94560; letter-spacing: 0.5px; }
  .card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 10px;
    font-size: 13px;
  }
  .warn {
    background: rgba(233,69,96,0.1);
    border: 1px solid rgba(233,69,96,0.4);
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 10px;
    font-size: 12px;
    line-height: 1.6;
  }
  .label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
  .val   { font-size: 13px; font-weight: 600; color: #e94560; }
  code {
    background: rgba(0,0,0,0.4);
    padding: 2px 6px;
    border-radius: 4px;
    color: #e94560;
    font-size: 11px;
    font-family: monospace;
  }
  .divider { border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 12px 0; }
  .btn-group { display: flex; flex-direction: column; gap: 7px; }
  button {
    width: 100%;
    padding: 9px 12px;
    border: none;
    border-radius: 7px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.3px;
    transition: opacity 0.15s;
  }
  button:hover  { opacity: 0.82; }
  button:active { opacity: 0.65; }
  .ev { background: #e6a817; color: #000; }
  .su { background: #e94560; color: #fff; }
  .pr { background: #1a7a34; color: #fff; }
</style>
</head>
<body>

  <div class="header">
    <img src="${logoUri}" alt="AlphaLearn" />
    <span class="brand">AlphaLearn IDE</span>
  </div>

  ${auth
            ? `<div class="card"><div class="label">Logged in as</div><div class="val">👤 ${auth.username}</div></div>`
            : `<div class="warn">
         ⚠️ Not authenticated<br>
         Open terminal and run:<br>
         <code>alpha authenticate TOKEN</code><br><br>
         Get token from:<br>
         <code>alphalearn.com/ide-token</code>
       </div>`}

  <hr class="divider" />

  ${rc
            ? `<div class="card">
         <div class="label">Assignment</div>
         <div class="val">${rc.assignmentId}</div>
       </div>`
            : `<div class="warn">
         No assignment open.<br>
         In terminal run:<br>
         <code>alpha start ASSIGNMENT_ID</code>
       </div>`}

  <hr class="divider" />

  <div class="btn-group">
    <button class="ev" onclick="s('evaluate')">🧪 Evaluate</button>
    <button class="su" onclick="s('submit')">🚀 Submit Assignment</button>
    <button class="pr" onclick="s('preview')">👁 Preview App</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function s(cmd) { vscode.postMessage({ cmd }); }
  </script>
</body>
</html>`;
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map