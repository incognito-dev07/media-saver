const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const axios = require('axios');
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

// No-cache headers
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Global status tracking
global.downloadStatus = new Map();
global.userStats = new Map();

// Cleanup interval
setInterval(() => {
  helpers.cleanupOldFiles();
}, config.CLEANUP_INTERVAL);

// ==================== KEEP ALIVE MECHANISM (FIXED FOR RENDER) ====================

// Ping endpoint for keep-alive
app.get('/api/ping', (req, res) => {
  res.json({ 
    status: 'alive', 
    timestamp: Date.now(),
    uptime: process.uptime(),
    memory: process.memoryUsage().heapUsed / 1024 / 1024 + 'MB'
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    uptime: process.uptime(),
    downloads: global.downloadStatus.size,
    users: global.userStats.size,
    timestamp: Date.now()
  });
});

// Self-ping mechanism that actually works on Render
if (process.env.NODE_ENV === 'production') {
  // Get your Render URL from environment variable (SET THIS IN RENDER DASHBOARD)
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
  
  if (!RENDER_URL) {
    logger.warn('RENDER_EXTERNAL_URL not set. Keep-alive may not work properly!');
  }

  // Function to ping the service
  async function keepAlive() {
    // Try multiple URLs to ensure one works
    const urlsToTry = [];
    
    // Add the Render URL if available (this is the one that actually works)
    if (RENDER_URL) {
      urlsToTry.push(`${RENDER_URL}/api/ping`);
    }
    
    // Add localhost as fallback (might work, might not)
    urlsToTry.push(`http://localhost:${PORT}/api/ping`);
    urlsToTry.push(`http://127.0.0.1:${PORT}/api/ping`);
    
    for (const url of urlsToTry) {
      try {
        const response = await axios.get(url, { 
          timeout: 10000,
          headers: { 
            'User-Agent': 'Render-KeepAlive/1.0',
            'Cache-Control': 'no-cache'
          }
        });
        
        if (response.status === 200) {
          logger.debug(`Keep-alive successful via: ${url}`);
          return true;
        }
      } catch (error) {
        logger.debug(`Keep-alive failed for ${url}: ${error.message}`);
        // Continue to next URL
      }
    }
    
    logger.error('All keep-alive attempts failed');
    return false;
  }

  // Run keep-alive every 4 minutes (Render free tier sleeps after 15 mins)
  setInterval(keepAlive, 4 * 60 * 1000);
  
  // Run immediately on startup (after 10 seconds)
  setTimeout(keepAlive, 10000);
  
  // Additional: Keep event loop active with file operations
  setInterval(() => {
    try {
      // Touch a file in /tmp (always writable on Render)
      const tempFile = path.join('/tmp', 'render-keepalive.txt');
      fs.writeFileSync(tempFile, Date.now().toString());
    } catch (error) {
      // Ignore file errors
    }
  }, 60000); // Every minute
  
  logger.info(`🚀 Keep-alive system activated! Pinging every 4 minutes`);
  if (RENDER_URL) {
    logger.info(`📡 Using Render URL: ${RENDER_URL}`);
  }
}
// ==================== END KEEP ALIVE ====================

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

    if (!helpers.isValidUrl(url)) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const platform = helpers.checkPlatform(url);
    if (!platform) {
      return res.status(400).json({ error: 'Platform not supported' });
    }

    const rateLimitCheck = await helpers.checkRateLimit(userId);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
    }

    const downloadId = Date.now() + '_' + Math.random().toString(36).substring(7);

    res.json({ 
      status: 'processing', 
      message: 'Download started',
      platform,
      downloadId
    });

    processDownload(url, userId, platform, downloadId).catch(console.error);

  } catch (error) {
    logger.error(`API Error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check status endpoint
app.get('/api/status/:downloadId', (req, res) => {
  const { downloadId } = req.params;
  const status = global.downloadStatus.get(downloadId) || { 
    status: 'not_found',
    downloadId: downloadId
  };
  res.json(status);
});

// Get user limits
app.get('/api/limits/:userId', (req, res) => {
  const { userId } = req.params;
  const stats = global.userStats.get(userId) || { downloads: 0 };
  const remaining = Math.max(0, config.MAX_REQUESTS_PER_USER - (stats.downloads || 0));
  
  res.json({
    remaining,
    total: config.MAX_REQUESTS_PER_USER,
    resetTime: config.TIME_WINDOW
  });
});

// Serve downloaded files
app.get('/api/file/:downloadId', async (req, res) => {
  const { downloadId } = req.params;
  
  try {
    const files = await fs.readdir(config.PATHS.DOWNLOADS);
    const matchingFile = files.find(f => f.startsWith(downloadId));
    
    if (!matchingFile) {
      return res.status(404).json({ error: 'File not found or expired' });
    }
    
    const filePath = path.join(config.PATHS.DOWNLOADS, matchingFile);
    const stats = await fs.stat(filePath);
    
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="video-${downloadId}.mp4"`);
    res.setHeader('Content-Length', stats.size);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    logger.info(`Serving file: ${matchingFile}`);
    
    setTimeout(async () => {
      await helpers.safeDelete(filePath);
    }, 60000);
    
  } catch (error) {
    logger.error(`Error serving file: ${error.message}`);
    res.status(500).json({ error: 'Error serving file' });
  }
});

// Download processing function
async function processDownload(url, userId, platform, downloadId) {
  const filename = `${downloadId}.mp4`;
  const downloadPath = path.join(config.PATHS.DOWNLOADS, filename);
  
  global.downloadStatus.set(downloadId, { 
    status: 'downloading', 
    progress: 0,
    downloadId: downloadId
  });
  
  try {
    const stats = global.userStats.get(userId) || { downloads: 0 };
    stats.downloads = (stats.downloads || 0) + 1;
    global.userStats.set(userId, stats);

    global.downloadStatus.set(downloadId, { 
      status: 'downloading', 
      progress: 30,
      downloadId: downloadId 
    });
    
    const handler = require(`./handlers/${platform}`);
    const result = await handler.download(url, downloadPath);
    
    if (await fs.pathExists(downloadPath)) {
      const fileStats = await fs.stat(downloadPath);
      
      global.downloadStatus.set(downloadId, { 
        status: 'completed', 
        progress: 100, 
        file: {
          ...result,
          filePath: downloadPath,
          filename: filename,
          size: fileStats.size
        },
        downloadId: downloadId
      });
      
      logger.info(`Download completed: ${downloadId}`);
      
      setTimeout(async () => {
        await helpers.safeDelete(downloadPath);
        global.downloadStatus.delete(downloadId);
      }, 30 * 60 * 1000);
      
    } else {
      throw new Error('File was not created');
    }
    
  } catch (error) {
    logger.error(`Download failed: ${error.message}`);
    global.downloadStatus.set(downloadId, { 
      status: 'failed', 
      error: error.message,
      downloadId: downloadId 
    });
    
    await helpers.safeDelete(downloadPath);
    
    const stats = global.userStats.get(userId);
    if (stats && stats.downloads > 0) {
      stats.downloads--;
      global.userStats.set(userId, stats);
    }
  }
}

app.listen(PORT, () => {
  logger.info(`✅ Backend API running on port ${PORT}`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Create required directories
fs.ensureDirSync(config.PATHS.DOWNLOADS);
fs.ensureDirSync(config.PATHS.LOGS);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down');
  process.exit(0);
});