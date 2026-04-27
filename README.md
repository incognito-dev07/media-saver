# Media Saver

Download videos from TikTok, Instagram, Facebook, and YouTube without watermarks.

## Setup

### Backend

```bash
cd backend
npm install
npm start
```

### Frontend

· Update API_BASE_URL in script.js
· Deploy to Vercel or serve locally

## API Endpoints

Method Endpoint Description
- POST /api/download Start download
- GET /api/status/:id Check status
- GET /api/file/:id Get video file

## How It Works

Paste a link, backend downloads via yt-dlp, file gets served back. Files auto-delete after 30 minutes.

## Notes

· yt-dlp binary auto-downloads on install
· Rate limited per user
· Personal use only. Respect copyright.
