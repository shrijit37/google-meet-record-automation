# Google Meet Automation Bot

A Node.js automation bot that joins Google Meet meetings via API and starts the built-in recording.

## Features

- 🔐 **Persistent Login**: Log in once, sessions are saved for future use
- 🚀 **API-driven**: Join meetings and control recording via REST API
- 📹 **Recording Control**: Start/stop Google Meet's built-in recording
- 📋 **Job Queue**: Queue multiple meetings, process one at a time
- ⏰ **Scheduling**: Schedule meetings for a specific time

## Quick Start

### 1. Install Dependencies

```bash
npm install
npx playwright install chromium
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings (optional - credentials only needed for automated login)
```

### 3. Login to Google (First Time Only)

```bash
npm run login
```

This opens a browser window where you manually log into Google. The session is saved and reused.

### 4. Start the Bot

```bash
npm run dev
```

The API server starts on port 3000 (configurable via `PORT` env variable).

## API Endpoints

### Check Status
```bash
curl http://localhost:3000/api/status
```

### Join a Meeting
```bash
curl -X POST http://localhost:3000/api/join-meeting \
  -H "Content-Type: application/json" \
  -d '{
    "meetingUrl": "https://meet.google.com/xxx-xxxx-xxx",
    "startRecording": true
  }'
```

### Schedule a Meeting
```bash
curl -X POST http://localhost:3000/api/join-meeting \
  -H "Content-Type: application/json" \
  -d '{
    "meetingUrl": "https://meet.google.com/xxx-xxxx-xxx",
    "startRecording": true,
    "scheduledTime": "2024-12-11T14:00:00Z"
  }'
```

### Stop Recording
```bash
curl -X POST http://localhost:3000/api/stop-recording
```

### Leave Meeting
```bash
curl -X POST http://localhost:3000/api/leave-meeting
```

### Get Job Status
```bash
curl http://localhost:3000/api/job/{jobId}
```

### List All Jobs
```bash
curl http://localhost:3000/api/jobs
```

## Project Structure

```
google-meet-automation/
├── src/
│   ├── index.ts              # Main entry point
│   ├── server.ts             # Express API server
│   ├── browser/
│   │   ├── browserManager.ts # Playwright browser lifecycle
│   │   └── sessionManager.ts # Cookie/session persistence
│   ├── meet/
│   │   ├── loginHandler.ts   # Google login automation
│   │   ├── meetJoiner.ts     # Join meeting logic
│   │   └── recordingHandler.ts # Start/stop recording
│   ├── queue/
│   │   └── jobQueue.ts       # Meeting request queue
│   └── config/
│       └── config.ts         # Configuration management
├── sessions/                 # Stored session data (gitignored)
└── recordings/               # Downloaded recordings (gitignored)
```

## Important Notes

### Recording Permissions

To start recordings, the Google account must have:
- **Google Workspace** with recording enabled, OR
- Be the **meeting host**

Personal Gmail accounts without Workspace may not have recording access.

### Bot Detection

Google actively blocks automated logins. To avoid detection:
- Use `npm run login` for manual login (recommended)
- Sessions are saved and reused automatically
- The bot uses realistic browser fingerprints

### Headless Mode

By default, the bot runs headless after initial login. Set `HEADLESS=false` in `.env` to see the browser.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | API server port |
| `GOOGLE_EMAIL` | - | Google email (for automated login only) |
| `GOOGLE_PASSWORD` | - | Google password (for automated login only) |
| `SESSION_DIR` | ./sessions | Where to store session data |
| `HEADLESS` | true | Run browser headlessly |

## Development

```bash
# Watch mode
npm run dev

# Build for production
npm run build

# Run production build
npm start
```
