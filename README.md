# GHA-Dashboard

## Overview

GHA-Dashboard is a comprehensive dashboard for analyzing GitHub Actions workflows and builds. The project consists of two main components:

- **Backend**: A Python Flask API that extracts, analyzes, and serves GitHub Actions data from repositories
- **Frontend**: A Browser extension built with React that provides a user-friendly interface to visualize the data

The system uses local JSON storage for data persistence and supports real-time data extraction via WebSocket connections.

📺 **Installation Guide Video**: [Watch on YouTube](https://youtu.be/jxfAHsRjxsQ)

## 1) Setup (GHA Dashboard)

### Step 1: Install prerequisites (Only if you don't already have them)

- **Python**: https://www.python.org/downloads/

### Step 2: Clone the project repository

```bash
git clone https://github.com/stilab-ets/GHA-Dashboard.git
```

**Note**: If you don't have Git installed, you can download the project directly from [https://github.com/stilab-ets/GHA-Dashboard](https://github.com/stilab-ets/GHA-Dashboard) by clicking the green "Code" button and selecting "Download ZIP", then unzip the downloaded file.

### Step 3: Install backend dependencies

```bash
cd GHA-Dashboard/backend
pip install -r requirements.txt
```

### Step 4: Run the backend server

If you want to use GitHub OAuth, create `backend/.env` from `backend/.env.example` and set:

```bash
GITHUB_CLIENT_ID=your_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_oauth_app_client_secret
```

Restart the backend after changing these values. If you do not configure OAuth, you can still paste a personal access token in the extension popup.

```bash
python app.py
```

### Step 5: Load the extension 

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

### Step 6: Add your GitHub access token

#### Option #1: Use GitHub OAuth (recommended)

1. **Connect using your GitHub credentials**
   - Click the GHA Dashboard extension icon in the top right (puzzle icon)
   - Click **Authenticate with GitHub**
   - Click **Authorize**
   - Enter your GitHub password

#### Option #2: Use your own GitHub token

1. **Generate a GitHub token** (in case you don't have one)
   - Go to: https://github.com/settings/tokens
   - Click **Generate new token → Classic token**
   - Select `repo` (or `public_repos` if not working with a private repo)
   - Generate the token and copy it

2. **Add the token to the extension**
   - Click the GHA Dashboard extension icon in the top right (puzzle icon)
   - Paste your GitHub token into the token input field
   - Click **Save**

## 2) Data Collection & Navigation

### Step 7: Open the target repository

Go to: https://github.com/AUTOMATIC1111/stable-diffusion-webui

### Step 8: Open the GHA Dashboard

From the repository's middle menu, click on the **GHA Dashboard** tab added by the extension.

### Step 9: Start data collection

Click **Start Data Collection** and wait until the process completes.

### Step 10: Submit your honest feedback

After using GHA-Dashboard, please fill out this short form (2-3 miniutes) to submit your feedback
https://docs.google.com/forms/d/e/1FAIpQLSc6Von65ZCGnbB91yq0Ry8Fi6xpsxnja86ILuKIqqWU9w--jA/viewform?usp=dialog

## Tests

### Extension 

1. Go to the backend folder via `cd backend` 
2. Execute `python app.py --e2e`
1. Go to the extension folder via `cd ../extension` 
2. Execute `npm run test:e2e`

> [!NOTE]
> As playwright do not support extension for firefox, all E2E tests use chromium

### Backend

1. Go to the backend folder via `cd backend` 
2. Execute `pytest`

## Contributing

### Development Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Test both backend and frontend
4. Submit a pull request

### Code Structure

- `backend/`: Flask API and data processing
- `extension/`: React Browser extension
- `doc/`: Documentation and architecture diagrams

### Key Technologies

- **Backend**: Python, Flask, WebSocket, local JSON persistence
- **Frontend**: React, Vite, Browser Extension APIs
- **Data Processing**: Pandas, GitHub API integration

## Troubleshooting

### Backend Issues

- Check backend logs in the terminal running `python app.py`
- Verify ports: Ensure 3000 is available
- Data storage: Check `backend/data/storage/` if cached repository data looks stale

### Extension Issues

- Reload extension in browser after updates
- Check browser console for errors

### Common Problems

- **Port conflicts**: Stop other services using port 3000
- **GitHub rate limits**: Provide a valid GitHub token
- **Extension not loading**: Ensure manifest.json is valid and build/ is complete

For more detailed documentation, see the `doc/` folder.
