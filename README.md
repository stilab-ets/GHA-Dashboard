# GHA-Dashboard

## Overview

GHA-Dashboard is a comprehensive dashboard for analyzing GitHub Actions workflows and builds. The project consists of two main components:

- **Backend**: A Python Flask API that extracts, analyzes, and serves GitHub Actions data from repositories
- **Frontend**: A Chrome browser extension built with React that provides a user-friendly interface to visualize the data

The system uses PostgreSQL for data persistence and supports real-time data extraction via WebSocket connections.

📺 **Installation Guide Video**: [Watch on YouTube](https://youtu.be/fYK8SyZ0yLc)

## 1) Setup (GHA Dashboard)

### Step 1: Install prerequisites (Only if you don't already have them)

- **Python**: https://www.python.org/downloads/

### Step 2: Clone the project repository

```bash
git clone https://github.com/stilab-ets/GHA-Dashboard.git
```

**Note**: If you don't have Git installed, you can download the project directly from [https://github.com/stilab-ets/GHA-Dashboard](https://github.com/stilab-ets/GHA-Dashboard) by clicking the green "Code" button and selecting "Download ZIP", then unzip the downloaded file.

### Step 3: Run the backend server

```bash
cd GHA-Dashboard/backend
python app.py
```

### Step 4: Load the extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the folder: `GHA-Dashboard/extension/build/`

### Step 5: Add your GitHub access token

1. **Generate a GitHub token** (in case you don't have one)
   - Go to: https://github.com/settings/tokens
   - Click **Generate new token → Classic token**
   - Select `repo` (or `public_repos` if not working with a private repo)
   - Generate the token and copy it

2. **Add the token to the extension**
   - Click the GHA Dashboard extension icon in Chrome top right (puzzle icon)
   - Paste your GitHub token into the token input field
   - Click **Save**

## 2) Data Collection & Navigation

### Step 6: Open the target repository

Go to: https://github.com/AUTOMATIC1111/stable-diffusion-webui

### Step 7: Open the GHA Dashboard

From the repository's middle menu, click on the **GHA Dashboard** tab added by the extension.

### Step 8: Start data collection

Click **Start Data Collection** and wait until the process completes.

## Contributing

### Development Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Test both backend and frontend
4. Submit a pull request

### Code Structure

- `backend/`: Flask API and data processing
- `extension/`: React Chrome extension
- `doc/`: Documentation and architecture diagrams
- `docker-compose.yml`: Service orchestration

### Key Technologies

- **Backend**: Python, Flask, SQLAlchemy, PostgreSQL, WebSocket
- **Frontend**: React, Vite, Chrome Extension APIs
- **Data Processing**: Pandas, GitHub API integration
- **Containerization**: Docker, Docker Compose

## Troubleshooting

### Backend Issues

- Check logs: `docker-compose logs backend`
- Verify ports: Ensure 3000, 5432 are available
- Database connection: Check PostgreSQL health

### Extension Issues

- Reload extension in browser after updates
- Check browser console for errors

### Common Problems

- **Port conflicts**: Stop other services using ports 3000, 5432, 5050
- **GitHub rate limits**: Provide a valid GitHub token
- **Extension not loading**: Ensure manifest.json is valid and build/ is complete

For more detailed documentation, see the `doc/` folder.
