# GHA-Dashboard Extension

This folder contains a browser extension that provides a GitHub Actions dashboard built with React and Vite.

Contents
- `package.json` - build & packaging scripts
- `scripts/assemble.js` - assembles runtime files into `build/` after Vite build
- `build/` - produced by `npm run pack`, ready to load as an unpacked extension

Quick start (development)
1. Install dependencies:
   ```powershell
   npm install
   ```
2. Run dev server (Vite):
   ```powershell
   npm run dev
   ```

Build & package (produce ready-to-load `build/`)
1. Build and assemble the extension into `build/`:
   ```powershell
   npm run pack
   ```
   This runs `vite build` and copies manifest, background scripts and other runtime files into `build/`.

2. Load the extension in Chrome/Edge (no server required):
   - Open `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `build/` folder

3. (Optional) Create a distributable ZIP (Windows PowerShell):
   ```powershell
   npm run dist
   ```
   This runs the pack step and then compresses the `build/` folder into `gha-dashboard.zip` at the repo root. The `dist` script uses PowerShell's `Compress-Archive` and therefore works on Windows.
