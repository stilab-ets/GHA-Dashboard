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
  const extDir = path.resolve(__dirname, '..', '..');
  const buildDir = path.join(extDir, 'build');

  // ensure build exists
  try {
    await fsp.access(buildDir);
  } catch (err) {
    console.error('build directory not found. Run `npm run build` first.');
    process.exit(1);
  }

  // files to copy into packaged extension root
  const fileMappings = [
    { src: 'manifest.json', dest: 'manifest.json' },
    { src: 'src/background.js', dest: 'background.js' },
    { src: 'src/api.js', dest: 'api.js' },
    { src: 'src/contentScript.js', dest: 'contentScript.js' },
    { src: 'src/popup/popup.css', dest: 'popup/popup.css' }
  ];

  for (const mapping of fileMappings) {
    const src = path.join(extDir, mapping.src);
    const dest = path.join(buildDir, mapping.dest);
    await ensureDir(path.dirname(dest));
    await copyIfExists(src, dest);
  }

  // update manifest paths for build
  const manifestPath = path.join(buildDir, 'manifest.json');
  let manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));

  // Update background service worker path
  if (manifest.background && manifest.background.service_worker) {
    manifest.background.service_worker = manifest.background.service_worker.replace('src/', '');
  }

  // Update content scripts paths
  if (manifest.content_scripts) {
    manifest.content_scripts = manifest.content_scripts.map(script => ({
      ...script,
      js: script.js.map(jsFile => jsFile.replace('src/', ''))
    }));
  }

  // Action popup path stays as src/popup/popup.html (Vite places it there)

  // Update web accessible resources
  if (manifest.web_accessible_resources) {
    manifest.web_accessible_resources = manifest.web_accessible_resources.map(resource => ({
      ...resource,
      resources: resource.resources.map(r => {
        if (r === 'src/styles/dashboardStyles.css') return 'dashboardStyles.css';
        if (r === 'src/assets/dashboard.png') return 'assets/dashboard.png';
        // Keep src/dashboard/dashboard.html as is (Vite places it there)
        // Keep react_page/* as is
        return r;
      })
    }));
  }

  // Update action icon paths
  if (manifest.action && manifest.action.default_icon) {
    for (let size in manifest.action.default_icon) {
      manifest.action.default_icon[size] = manifest.action.default_icon[size].replace('src/', '');
    }
  }

  await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('updated manifest paths for build');

  // copy styles/dashboardStyles.css to build root as manifest referenced it
  const stylesSrc = path.join(extDir, 'src', 'styles', 'dashboardStyles.css');
  const stylesDest = path.join(buildDir, 'dashboardStyles.css');
  await copyIfExists(stylesSrc, stylesDest);

  // copy any files from extension/assets into build/assets (merge)
  const assetsSrc = path.join(extDir, 'src', 'assets');
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
