require('dotenv').config();
const path = require('path');

module.exports = {
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 50,
  MAX_REQUESTS_PER_USER: parseInt(process.env.MAX_REQUESTS_PER_USER) || 15,
  TIME_WINDOW: parseInt(process.env.TIME_WINDOW) || 3600,
  MAX_QUALITY: parseInt(process.env.MAX_QUALITY) || 720,
  DOWNLOAD_TIMEOUT: parseInt(process.env.DOWNLOAD_TIMEOUT) || 180000,
  CLEANUP_INTERVAL: parseInt(process.env.CLEANUP_INTERVAL) || 3600000,
  
  PATHS: {
    DOWNLOADS: path.join(__dirname, 'database', 'downloads'),
    LOGS: path.join(__dirname, 'logs'),
    COOKIES: path.join(__dirname, 'database', 'cookies.json')
  }
};