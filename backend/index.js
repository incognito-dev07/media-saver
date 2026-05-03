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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

global.downloadStatus = new Map();

setInterval(() => {
  helpers.cleanupOldFiles();
}, config.CLEANUP_INTERVAL);


app.get('/api/ping', (req, res) => {
  res.json({ status: 'alive', time: Date.now() });
});

if (process.env.NODE_ENV === 'production') {
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL || 'https://media-downloader-7ovf.onrender.com';
  
  setInterval(() => {
    axios.get(`${RENDER_URL}/api/ping`, { timeout: 10000 })
      .then(() => console.log('Keep-alive ping sent'))
      .catch(() => {});
  }, 4 * 60 * 1000);
  
  console.log('✅ Keep-alive started - pinging every 4 minutes');
}

app.get('/', (req, res) => {
  res.json({ 
    status: 'active', 
    message: 'Video Downloader API',
    version: '1.0.0'
  });
});

app.post('/api/download', async (req, res) => {
  try {
    const { url } = req.body;
    
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

    const downloadId = Date.now() + '_' + Math.random().toString(36).substring(7);

    res.json({ 
      status: 'processing', 
      message: 'Download started',
      platform,
      downloadId
    });

    processDownload(url, platform, downloadId).catch(console.error);

  } catch (error) {
    console.error(`API Error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/status/:downloadId', (req, res) => {
  const { downloadId } = req.params;
  const status = global.downloadStatus.get(downloadId) || { 
    status: 'not_found',
    downloadId: downloadId
  };
  res.json(status);
});

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
    
    console.log(`Serving file: ${matchingFile}`);
    
    setTimeout(async () => {
      await helpers.safeDelete(filePath);
    }, 60000);
    
  } catch (error) {
    console.error(`Error serving file: ${error.message}`);
    res.status(500).json({ error: 'Error serving file' });
  }
});

async function processDownload(url, platform, downloadId) {
  const filename = `${downloadId}.mp4`;
  const downloadPath = path.join(config.PATHS.DOWNLOADS, filename);
  
  global.downloadStatus.set(downloadId, { 
    status: 'downloading', 
    progress: 0,
    downloadId: downloadId
  });
  
  try {
    global.downloadStatus.set(downloadId, { 
      status: 'downloading', 
      progress: 30,
      downloadId: downloadId 
    });
    
    const handler = require(`./handlers/${platform}`);
    const result = await handler.download(url, downloadPath);
    
    global.downloadStatus.set(downloadId, { 
      status: 'downloading', 
      progress: 70,
      downloadId: downloadId 
    });
    
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
      
      console.log(`Download completed: ${downloadId}`);
      
      setTimeout(async () => {
        await helpers.safeDelete(downloadPath);
        global.downloadStatus.delete(downloadId);
      }, 30 * 60 * 1000);
      
    } else {
      throw new Error('File was not created');
    }
    
  } catch (error) {
    console.error(`Download failed: ${error.message}`);
    global.downloadStatus.set(downloadId, { 
      status: 'failed', 
      error: error.message,
      downloadId: downloadId 
    });
    
    await helpers.safeDelete(downloadPath);
  }
}

app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});

fs.ensureDirSync(config.PATHS.DOWNLOADS);
fs.ensureDirSync(config.PATHS.LOGS);