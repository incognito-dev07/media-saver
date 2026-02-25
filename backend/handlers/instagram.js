const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const config = require('../config');
const logger = require('../utils/logger');

const execPromise = util.promisify(exec);

module.exports.download = async (url, outputPath) => {
  try {
    const command = `./yt-dlp -f "best" -o "${outputPath}" --quiet "${url}"`;
    await execPromise(command, { timeout: config.DOWNLOAD_TIMEOUT });
    
    logger.info(`Instagram download successful: ${url}`);
    
    return {
      filePath: outputPath,
      title: 'Instagram Video',
      platform: 'instagram'
    };
    
  } catch (error) {
    logger.error(`Instagram download failed: ${error.message}`);
    throw new Error('Instagram download failed');
  }
};