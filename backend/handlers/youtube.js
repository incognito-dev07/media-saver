const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const config = require('../config');
const logger = require('../utils/logger');

const execPromise = util.promisify(exec);

module.exports.download = async (url, outputPath) => {
  try {
    const command = `./yt-dlp -f "best[height<=${config.MAX_QUALITY}]" -o "${outputPath}" --quiet "${url}"`;
    await execPromise(command, { timeout: config.DOWNLOAD_TIMEOUT });
    
    logger.info(`YouTube download successful: ${url}`);
    
    return {
      filePath: outputPath,
      title: 'YouTube Video',
      platform: 'youtube'
    };
    
  } catch (error) {
    logger.error(`YouTube download failed: ${error.message}`);
    throw new Error('YouTube download failed');
  }
};