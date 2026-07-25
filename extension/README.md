# GHA-Dashboard Extension

This folder contains a browser extension that provides a GitHub Actions dashboard built with React and Vite.

Contents
- `package.json` - build & packaging scripts
- `scripts/assemble.js` - assembles runtime files into `build/` after Vite build
- `build/` - produced by `npm run pack`, ready to load as an unpacked extension
- `tests/` - contains PlayWright tests (e2e) used by the CI pipeline

Quick start (development)
1. Install dependencies:
   ```powershell
   npm install
   ```
2. Run dev server (Vite):
   ```powershell
   npm run dev
   ```



Build and load the extension :

#### Option #1: Chromium

1. Go to the extension folder via `cd extension` 
2. Execute `npm run pack` or `npm run pack chromium`
3. Open Chrome/Brave/etc.. and go to `chrome://extensions/`
4. Enable **Developer mode** (top right)
5. Click **Load unpacked**
6. Select the folder: `GHA-Dashboard/extension/build/`

#### Option #2: Firefox

1. Go to the extension folder via `cd extension` 
2. Execute `npm run pack firefox`
3. Open Firefox and go to `about:debugging#/runtime/this-firefox`
4. Click **Load Temporary Add-on...**
5. Select the manifest: `GHA-Dashboard/extension/build/manifest.json`
   This runs `vite build` and copies manifest, background scripts and other runtime files into `build/`.

(Optional) Create a distributable ZIP (Windows PowerShell):
   ```powershell
   npm run dist
   ```
   This runs the pack step and then compresses the `build/` folder into `gha-dashboard.zip` at the repo root. The `dist` script uses PowerShell's `Compress-Archive` and therefore works on Windows.

Run PlayWright tests:

1. Create and fill .env file from .env.example in the `backend` folder

2. Launch the backend in the `e2e` mode:
   ```powershell
   python app.py --e2e
   ```

3. Install `Chromium` for PlayWright:
   ```powershell
   npx playwright install chromium
   ```

4. Run the PlayWright tests:
   ```powershell
   npm run test:e2e
   ```

5. Run the Unit tests:
   ```powershell
   npm run test:unit
   ```
