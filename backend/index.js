const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
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

// Global status tracking
global.downloadStatus = new Map();
global.userStats = new Map();

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

    // Generate download ID
    const downloadId = Date.now().toString();

    // Send initial response with downloadId
    res.json({ 
      status: 'processing', 
      message: 'Download started',
      platform,
      downloadId
    });

    // Process download asynchronously
    processDownload(url, userId, platform, downloadId).catch(console.error);

  } catch (error) {
    logger.error(`API Error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check status endpoint
app.get('/api/status/:downloadId', (req, res) => {
  const { downloadId } = req.params;
  const status = global.downloadStatus.get(downloadId) || { status: 'not_found' };
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
  
  // Try different possible file extensions
  const possiblePaths = [
    path.join(config.PATHS.DOWNLOADS, `${downloadId}.mp4`),
    path.join(config.PATHS.DOWNLOADS, `${downloadId}.mkv`),
    path.join(config.PATHS.DOWNLOADS, `${downloadId}.webm`),
    path.join(config.PATHS.DOWNLOADS, downloadId)
  ];
  
  // Also try to find any file that starts with the downloadId
  try {
    const files = await fs.readdir(config.PATHS.DOWNLOADS);
    const matchingFile = files.find(f => f.startsWith(downloadId));
    if (matchingFile) {
      possiblePaths.push(path.join(config.PATHS.DOWNLOADS, matchingFile));
    }
  } catch (err) {
    // Ignore read error
  }
  
  // Try each possible path
  for (const filePath of possiblePaths) {
    try {
      if (await fs.pathExists(filePath)) {
        const stats = await fs.stat(filePath);
        
        // Set proper headers
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="video-${downloadId}.mp4"`);
        res.setHeader('Content-Length', stats.size);
        
        // Stream the file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
        logger.info(`Serving file: ${filePath}`);
        return;
      }
    } catch (err) {
      logger.error(`Error serving ${filePath}: ${err.message}`);
    }
  }
  
  // If we get here, no file was found
  logger.error(`File not found for downloadId: ${downloadId}`);
  res.status(404).json({ error: 'File not found or expired' });
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
    // Update user stats
    const stats = global.userStats.get(userId) || { downloads: 0 };
    stats.downloads = (stats.downloads || 0) + 1;
    global.userStats.set(userId, stats);

    // Load appropriate handler
    const handler = require(`./handlers/${platform}`);
    
    global.downloadStatus.set(downloadId, { 
      status: 'downloading', 
      progress: 30,
      downloadId: downloadId 
    });
    
    // Download video
    const result = await handler.download(url, downloadPath);
    
    // Verify file exists
    if (await fs.pathExists(downloadPath)) {
      global.downloadStatus.set(downloadId, { 
        status: 'completed', 
        progress: 100, 
        file: {
          ...result,
          filePath: downloadPath,
          filename: filename
        },
        downloadId: downloadId
      });
      
      logger.info(`Download completed: ${downloadId}`);
      
      // Schedule file deletion after 1 hour
      setTimeout(async () => {
        await helpers.safeDelete(downloadPath);
        global.downloadStatus.delete(downloadId);
        logger.info(`Deleted file: ${downloadId}`);
      }, 3600000);
      
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
    
    // Decrement user stats on failure
    const stats = global.userStats.get(userId);
    if (stats && stats.downloads > 0) {
      stats.downloads--;
      global.userStats.set(userId, stats);
    }
  }
}

app.listen(PORT, () => {
  logger.info(`Backend API running on port ${PORT}`);
});

// Create required directories
fs.ensureDirSync(config.PATHS.DOWNLOADS);
fs.ensureDirSync(config.PATHS.LOGS);