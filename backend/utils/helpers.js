// helpers.js - Removed rate limiter
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

module.exports = {
  checkPlatform(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return 'youtube';
      if (hostname.includes('tiktok.com')) return 'tiktok';
      if (hostname.includes('instagram.com')) return 'instagram';
      if (hostname.includes('facebook.com') || hostname.includes('fb.watch')) return 'facebook';
      
      return null;
    } catch {
      return null;
    }
  },

  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },

  getFileSizeInMB(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return stats.size / (1024 * 1024);
    } catch {
      return 0;
    }
  },

  async safeDelete(filePath) {
    try {
      if (await fs.pathExists(filePath)) {
        await fs.unlink(filePath);
      }
    } catch {}
  },

  async cleanupOldFiles() {
    try {
      const files = await fs.readdir(config.PATHS.DOWNLOADS);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(config.PATHS.DOWNLOADS, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtimeMs > maxAge) {
          await fs.unlink(filePath);
        }
      }
    } catch {}
  }
};