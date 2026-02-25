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
    
    logger.info(`Facebook download successful: ${url}`);
    
    return {
      filePath: outputPath,
      title: 'Facebook Video',
      platform: 'facebook'
    };
    
  } catch (error) {
    logger.error(`Facebook download failed: ${error.message}`);
    throw new Error('Facebook download failed');
  }
};