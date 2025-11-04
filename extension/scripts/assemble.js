const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function copyIfExists(src, dest) {
  try {
    await fsp.copyFile(src, dest);
    console.log(`copied ${src} -> ${dest}`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // ignore missing
    } else {
      throw err;
    }
  }
}

async function main() {
  const extDir = path.resolve(__dirname, '..');
  const buildDir = path.join(extDir, 'build');

  // ensure build exists
  try {
    await fsp.access(buildDir);
  } catch (err) {
    console.error('build directory not found. Run `npm run build` first.');
    process.exit(1);
  }

  // files to copy into packaged extension root
  const files = [
    'manifest.json',
    'background.js',
    'api.js',
    'apiService.js',
    'contentScript.js',
    'popup.css'
  ];

  for (const f of files) {
    const src = path.join(extDir, f);
    const dest = path.join(buildDir, f);
    await copyIfExists(src, dest);
  }

  // copy styles/dashboardStyles.css to build root as manifest referenced it
  const stylesSrc = path.join(extDir, 'styles', 'dashboardStyles.css');
  const stylesDest = path.join(buildDir, 'dashboardStyles.css');
  await copyIfExists(stylesSrc, stylesDest);

  // copy any files from extension/assets into build/assets (merge)
  const assetsSrc = path.join(extDir, 'assets');
  const assetsDest = path.join(buildDir, 'assets');
  try {
    await ensureDir(assetsDest);
    // use recursive copy if available
    if (fs.cp) {
      await fsp.cp(assetsSrc, assetsDest, { recursive: true });
      console.log(`recursively copied ${assetsSrc} -> ${assetsDest}`);
    } else {
      // fallback: copy files one by one
      const items = await fsp.readdir(assetsSrc);
      for (const item of items) {
        const s = path.join(assetsSrc, item);
        const d = path.join(assetsDest, item);
        await copyIfExists(s, d);
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  console.log('\nExtension assembled into build/ — you can load it as an unpacked extension:');
  console.log(' - In Chrome/Edge: Extensions -> Load unpacked -> select the build/ folder');
  console.log(' - In Firefox: about:debugging -> This Firefox -> Load Temporary Add-on -> select build/manifest.json');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
