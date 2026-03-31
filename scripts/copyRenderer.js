const fs = require('fs');
const path = require('path');

const sourceDir = path.resolve(__dirname, '..', 'renderer', 'dist');
const targetDir = path.resolve(__dirname, '..', 'dist', 'renderer');
const manifestKey = 'index.html';

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
const rewriteIndexHtml = () => {
  const manifestPath = path.join(sourceDir, '.vite', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.warn('Renderer manifest not found at', manifestPath);
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const entry = manifest[manifestKey];

  if (!entry || !entry.file) {
    throw new Error(`Renderer manifest missing bundle information for ${manifestKey}`);
  }

  const toRelative = (filePath) => {
    if (filePath.startsWith('./')) {
      return `./${filePath.slice(2)}`;
    }

    if (filePath.startsWith('/')) {
      return `./${filePath.slice(1)}`;
    }

    return `./${filePath}`;
  };
  const scriptPath = toRelative(entry.file);
  const cssPaths = (entry.css ?? []).map((cssFile) => toRelative(cssFile));

  const indexPath = path.join(targetDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error('Renderer index.html was not copied to the build output.');
  }

  const removeTags = (html, pattern) => html.replace(pattern, '');
  const scriptPattern = /<script\b[^>]*src="[^"]+"[^>]*><\/script>\s*/gi;
  const stylesheetPattern = /<link\b[^>]*rel=["']stylesheet["'][^>]*>\s*/gi;

  let html = fs.readFileSync(indexPath, 'utf-8');
  html = removeTags(html, scriptPattern);
  html = removeTags(html, stylesheetPattern);

  const assetTags = [
    ...cssPaths.map((href) => `    <link rel="stylesheet" href="${href}">`),
    `    <script type="module" src="${scriptPath}"></script>`
  ].join('\n');

  if (!html.includes('</head>')) {
    throw new Error('Renderer index.html is missing a </head> tag.');
  }

  html = html.replace('</head>', `\n${assetTags}\n  </head>`);
  fs.writeFileSync(indexPath, html, 'utf-8');
};

rewriteIndexHtml();

console.log('Copied renderer bundle to', targetDir);
