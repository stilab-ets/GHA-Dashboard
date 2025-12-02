# GHA-Dashboard

## Overview

GHA-Dashboard is a comprehensive dashboard for analyzing GitHub Actions workflows and builds. The project consists of two main components:

- **Backend**: A Python Flask API that extracts, analyzes, and serves GitHub Actions data from repositories
- **Frontend**: A Chrome browser extension built with React that provides a user-friendly interface to visualize the data

The system uses PostgreSQL for data persistence and supports real-time data extraction via WebSocket connections.

## Prerequisites

Before contributing, ensure you have the following installed:

- **Docker and Docker Compose** (for running the backend services)
- **Node.js and npm** (for the frontend extension)
- **Git** (for version control)
- **A GitHub Personal Access Token** (for API access to GitHub repositories)

## Backend Setup

The backend is containerized using Docker. It includes a Flask API, PostgreSQL database, and optional pgAdmin for database management.

### 1. Clone the Repository

```bash
git clone https://github.com/stilab-ets/GHA-Dashboard.git
cd GHA-Dashboard
```

### 2. Environment Configuration

For easier development, you can copy the provided `.env.example` file to `.env` and add your GitHub token (optional, as tokens can also be provided via the Chrome extension popup):

```bash
cp .env.example .env
```

Then edit `.env` to include your GitHub token:

```env
GITHUB_TOKEN=ghp_your_github_token_here
```

**Note**: The `.env` file is optional. Users can alternatively enter their GitHub token directly in the Chrome extension popup for each session.

### 3. Start Backend Services

```bash
# Start all services (PostgreSQL + Flask API)
docker-compose up -d --build
```

### 4. Verify Backend is Running

```bash
# Health check
curl http://localhost:3000/health

# Test data extraction (replace with a real repo)
curl "http://localhost:3000/api/extraction?repo=facebook/react"
```

### Backend Services

- **Flask API**: http://localhost:3000
- **PostgreSQL**: localhost:5432

### Useful Backend Commands

```bash
# View logs
docker-compose logs -f backend

# Access PostgreSQL CLI
docker-compose exec postgres psql -U postgres -d gha_dashboard

# Stop services
docker-compose down

# Reset everything (including data)
docker-compose down -v
docker-compose up -d --build
```

## Frontend Setup (Chrome Extension)

The frontend is a React-based Chrome extension built with Vite.

### 1. Install Dependencies

```bash
cd extension
npm install
```

### 2. Development

```bash
# Start development server
npm run dev
```

### 3. Build and Package

```bash
# Build and assemble extension
npm run pack

# Create distributable ZIP (Windows)
npm run dist
```

### 4. Load Extension in Browser

1. Open Chrome/Edge and go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `build/` folder

## Running the Full Application

1. **Start Backend**: Follow backend setup above
2. **Build Extension**: Follow frontend setup above
3. **Load Extension**: Load the built extension in your browser
4. **Use the Dashboard**: Navigate to any GitHub repository page and use the extension popup to access the dashboard

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

### Testing

```bash
# Backend tests
cd backend
python -m pytest

# Full system test
./test-docker.sh

# Manual API testing
curl http://localhost:3000/health
curl "http://localhost:3000/api/extraction?repo=facebook/react"
```

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

- Rebuild after changes: `npm run pack`
- Reload extension in browser after updates
- Check browser console for errors

### Common Problems

- **Port conflicts**: Stop other services using ports 3000, 5432, 5050
- **GitHub rate limits**: Provide a valid GitHub token
- **Extension not loading**: Ensure manifest.json is valid and build/ is complete

For more detailed documentation, see the `doc/` folder.
