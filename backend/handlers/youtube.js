const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const config = require('../config');
const logger = require('../utils/logger');

const execPromise = util.promisify(exec);

module.exports.download = async (url, outputPath) => {
  try {
    // YouTube needs specific format selection
    const command = `./yt-dlp -f "best[height<=${config.MAX_QUALITY}][ext=mp4]" --no-check-certificate -o "${outputPath}" --quiet "${url}"`;
    await execPromise(command, { timeout: config.DOWNLOAD_TIMEOUT });
    
    // Check if file was created
    if (!await fs.pathExists(outputPath)) {
      throw new Error('File not created');
    }
    
    logger.info(`YouTube download successful: ${url}`);
    
    return {
      filePath: outputPath,
      title: 'YouTube Video',
      platform: 'youtube'
    };
    
  } catch (error) {
    logger.error(`YouTube download failed: ${error.message}`);
    
    // Try alternative format
    try {
      logger.info('Trying alternative format for YouTube...');
      const altCommand = `./yt-dlp -f "best" --no-check-certificate -o "${outputPath}" --quiet "${url}"`;
      await execPromise(altCommand, { timeout: config.DOWNLOAD_TIMEOUT });
      
      if (!await fs.pathExists(outputPath)) {
        throw new Error('File not created with alternative format');
      }
      
      return {
        filePath: outputPath,
        title: 'YouTube Video',
        platform: 'youtube'
      };
    } catch (altError) {
      logger.error(`YouTube alternative format failed: ${altError.message}`);
      
      // Try one more time with different approach
      try {
        logger.info('Trying final method for YouTube...');
        const finalCommand = `./yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --no-check-certificate -o "${outputPath}" --quiet "${url}"`;
        await execPromise(finalCommand, { timeout: config.DOWNLOAD_TIMEOUT });
        
        if (!await fs.pathExists(outputPath)) {
          throw new Error('File not created with final method');
        }
        
        return {
          filePath: outputPath,
          title: 'YouTube Video',
          platform: 'youtube'
        };
      } catch (finalError) {
        logger.error(`YouTube final method failed: ${finalError.message}`);
        throw new Error('YouTube download failed. The video might be age-restricted or unavailable.');
      }
    }
  }
};