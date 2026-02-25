const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const config = require('./config');
const helpers = require('./utils/helpers');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Telegram Bot (optional - can send notifications)
let bot = null;
if (process.env.BOT_TOKEN) {
  bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });
}

// Rate limiting store
const rateLimit = new Map();

// Cleanup old files
setInterval(() => {
  helpers.cleanupOldFiles();
}, config.CLEANUP_INTERVAL);

// API Routes
app.get('/', (req, res) => {
  res.json({ 
    status: 'active', 
    message: 'Video Downloader API',
    version: '1.0.0'
  });
});

// Download video endpoint
app.post('/api/download', async (req, res) => {
  try {
    const { url, userId = 'anonymous' } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL
    if (!helpers.isValidUrl(url)) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Check platform support
    const platform = helpers.checkPlatform(url);
    if (!platform) {
      return res.status(400).json({ error: 'Platform not supported' });
    }

    // Rate limiting
    const rateLimitCheck = await helpers.checkRateLimit(userId);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
    }

    // Send initial response
    res.json({ 
      status: 'processing', 
      message: 'Download started',
      platform 
    });

    // Process download asynchronously
    processDownload(url, userId, platform).catch(console.error);

  } catch (error) {
    logger.error(`API Error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check status endpoint
app.get('/api/status/:downloadId', (req, res) => {
  const { downloadId } = req.params;
  const status = global.downloadStatus?.get(downloadId) || { status: 'not_found' };
  res.json(status);
});

// Get user limits
app.get('/api/limits/:userId', (req, res) => {
  const { userId } = req.params;
  const stats = global.userStats?.get(userId) || { downloads: 0 };
  const remaining = Math.max(0, config.MAX_REQUESTS_PER_USER - stats.downloads);
  
  res.json({
    remaining,
    total: config.MAX_REQUESTS_PER_USER,
    resetTime: config.TIME_WINDOW
  });
});

// Download processing function
async function processDownload(url, userId, platform) {
  const downloadId = Date.now().toString();
  const downloadPath = path.join(config.PATHS.DOWNLOADS, `${downloadId}.mp4`);
  
  // Initialize status tracking
  if (!global.downloadStatus) global.downloadStatus = new Map();
  if (!global.userStats) global.userStats = new Map();
  
  global.downloadStatus.set(downloadId, { status: 'downloading', progress: 0 });
  
  try {
    // Update user stats
    const stats = global.userStats.get(userId) || { downloads: 0 };
    stats.downloads = (stats.downloads || 0) + 1;
    global.userStats.set(userId, stats);

    // Load appropriate handler
    const handler = require(`./handlers/${platform}`);
    
    global.downloadStatus.set(downloadId, { status: 'downloading', progress: 30 });
    
    // Download video
    const result = await handler.download(url, downloadPath);
    
    global.downloadStatus.set(downloadId, { status: 'completed', progress: 100, file: result });
    
    // Optional: Send notification via Telegram
    if (bot) {
      bot.sendMessage(process.env.ADMIN_CHAT_ID || userId, 
        `✅ Download completed: ${platform}\n${url}`);
    }
    
    // Schedule file deletion after 1 hour
    setTimeout(async () => {
      await helpers.safeDelete(downloadPath);
      global.downloadStatus.delete(downloadId);
    }, 3600000);
    
  } catch (error) {
    logger.error(`Download failed: ${error.message}`);
    global.downloadStatus.set(downloadId, { status: 'failed', error: error.message });
    
    // Decrement user stats on failure
    const stats = global.userStats.get(userId);
    if (stats && stats.downloads > 0) {
      stats.downloads--;
      global.userStats.set(userId, stats);
    }
  }
}

// Serve downloaded files (temporary)
app.get('/api/file/:downloadId', async (req, res) => {
  const { downloadId } = req.params;
  const filePath = path.join(config.PATHS.DOWNLOADS, `${downloadId}.mp4`);
  
  try {
    if (await fs.pathExists(filePath)) {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="video-${downloadId}.mp4"`);
      
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
      
      // Don't delete immediately - let the scheduled cleanup handle it
    } else {
      res.status(404).json({ error: 'File not found or expired' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error serving file' });
  }
});

app.listen(PORT, () => {
  logger.info(`Backend API running on port ${PORT}`);
});

// Create required directories
fs.ensureDirSync(path.join(__dirname, 'database', 'downloads'));
fs.ensureDirSync(path.join(__dirname, 'logs'));