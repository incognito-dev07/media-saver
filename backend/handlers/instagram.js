const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const config = require('../config');
const logger = require('../utils/logger');

const execPromise = util.promisify(exec);

module.exports.download = async (url, outputPath) => {
  try {
    // Instagram often needs cookies and specific format
    const command = `./yt-dlp -f "best[height<=${config.MAX_QUALITY}]" --cookies cookies.txt --no-check-certificate -o "${outputPath}" --quiet "${url}"`;
    await execPromise(command, { timeout: config.DOWNLOAD_TIMEOUT });
    
    // Check if file was actually created
    if (!await fs.pathExists(outputPath)) {
      throw new Error('File not created');
    }
    
    logger.info(`Instagram download successful: ${url}`);
    
    return {
      filePath: outputPath,
      title: 'Instagram Video',
      platform: 'instagram'
    };
    
  } catch (error) {
    logger.error(`Instagram download failed: ${error.message}`);
    
    // Try alternative method
    try {
      logger.info('Trying alternative method for Instagram...');
      const altCommand = `./yt-dlp -f "mp4" --no-check-certificate -o "${outputPath}" --quiet "${url}"`;
      await execPromise(altCommand, { timeout: config.DOWNLOAD_TIMEOUT });
      
      if (!await fs.pathExists(outputPath)) {
        throw new Error('File not created with alternative method');
      }
      
      return {
        filePath: outputPath,
        title: 'Instagram Video',
        platform: 'instagram'
      };
    } catch (altError) {
      logger.error(`Instagram alternative method failed: ${altError.message}`);
      throw new Error('Instagram download failed. The video might be unavailable.');
    }
  }
};