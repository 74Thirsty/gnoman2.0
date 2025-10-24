const fs = require('fs');
const path = require('path');

const sourceDir = path.resolve(__dirname, '..', 'renderer', 'dist');
const targetDir = path.resolve(__dirname, '..', 'dist', 'renderer');

if (!fs.existsSync(sourceDir)) {
  console.warn('Renderer build output not found at', sourceDir);
  process.exit(0);
}

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });

const copyRecursive = (src, dest) => {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

copyRecursive(sourceDir, targetDir);
console.log('Copied renderer bundle to', targetDir);
