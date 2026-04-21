const { execSync } = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const launcherPath = path.resolve(__dirname, 'index.js');

if (process.platform === 'win32') {
  // Windows — write registry keys for alphalearn:// protocol
  const regContent = `Windows Registry Editor Version 5.00

[HKEY_CLASSES_ROOT\\alphalearn]
@="AlphaLearn IDE"
"URL Protocol"=""

[HKEY_CLASSES_ROOT\\alphalearn\\shell]

[HKEY_CLASSES_ROOT\\alphalearn\\shell\\open]

[HKEY_CLASSES_ROOT\\alphalearn\\shell\\open\\command]
@="\\"node\\" \\"${launcherPath.replace(/\\/g, '\\\\')}\\" \\"%1\\""
`;
  const regFile = path.join(os.tmpdir(), 'alphalearn-protocol.reg');
  fs.writeFileSync(regFile, regContent);
  try {
    execSync(`regedit /s "${regFile}"`, { stdio: 'inherit' });
    console.log('✅ alphalearn:// protocol registered (Windows)');
  } catch {
    console.log('ℹ️  Run as Administrator to register protocol automatically.');
    console.log(`   Or manually import: ${regFile}`);
  }

} else if (process.platform === 'darwin') {
  // macOS — create .app handler
  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>com.alphalearn.ide</string>
  <key>CFBundleName</key><string>AlphaLearn IDE</string>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key><string>AlphaLearn IDE</string>
      <key>CFBundleURLSchemes</key>
      <array><string>alphalearn</string></array>
    </dict>
  </array>
  <key>CFBundleExecutable</key><string>launcher</string>
</dict>
</plist>`;
  const appDir = `${os.homedir()}/Applications/AlphaLearn.app/Contents`;
  fs.mkdirSync(`${appDir}/MacOS`, { recursive: true });
  fs.writeFileSync(`${appDir}/Info.plist`, plistContent);
  fs.writeFileSync(`${appDir}/MacOS/launcher`,
    `#!/bin/bash\nURL="$1"\nASSIGN=$(echo "$URL" | sed 's/alphalearn:\\/\\///;s/?.*$//')\nTOKEN=$(echo "$URL" | grep -o 'token=[^&]*' | cut -d= -f2)\nnode "${launcherPath}" "$ASSIGN" "$TOKEN"`,
    { mode: 0o755 });
  try {
    execSync(`/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "${os.homedir()}/Applications/AlphaLearn.app"`);
    console.log('✅ alphalearn:// protocol registered (macOS)');
  } catch {
    console.log('ℹ️  Protocol handler created at ~/Applications/AlphaLearn.app');
  }

} else {
  // Linux — .desktop file
  const desktopContent = `[Desktop Entry]
Name=AlphaLearn IDE
Exec=node "${launcherPath}" %u
Type=Application
MimeType=x-scheme-handler/alphalearn;
`;
  const desktopPath = `${os.homedir()}/.local/share/applications/alphalearn-ide.desktop`;
  fs.mkdirSync(path.dirname(desktopPath), { recursive: true });
  fs.writeFileSync(desktopPath, desktopContent);
  try {
    execSync(`xdg-mime default alphalearn-ide.desktop x-scheme-handler/alphalearn`);
    execSync(`update-desktop-database ~/.local/share/applications`);
    console.log('✅ alphalearn:// protocol registered (Linux)');
  } catch {
    console.log('ℹ️  Desktop file created. Protocol handler may need manual registration.');
  }
}