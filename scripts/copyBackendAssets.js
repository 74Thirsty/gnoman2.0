const fs = require('fs');
const path = require('path');

const assets = [
  {
    source: path.join(__dirname, '../backend/licenses/license_public.pem'),
    target: path.join(__dirname, '../dist/backend/backend/licenses/license_public.pem')
  }
];

const copyAsset = ({ source, target }) => {
  if (!fs.existsSync(source)) {
    console.warn(`Skipping missing backend asset: ${source}`);
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`Copied ${source} -> ${target}`);
};

for (const asset of assets) {
  copyAsset(asset);
}
