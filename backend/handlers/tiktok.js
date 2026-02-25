const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

const execPromise = util.promisify(exec);

module.exports.download = async (url, outputPath) => {
  try {
    const command = `./yt-dlp -f "best" -o "${outputPath}" --quiet "${url}"`;
    await execPromise(command, { timeout: config.DOWNLOAD_TIMEOUT });
    
    logger.info(`TikTok download successful: ${url}`);
    
    return {
      filePath: outputPath,
      title: 'TikTok Video',
      platform: 'tiktok'
    };
    
  } catch (error) {
    logger.error(`TikTok method 1 failed: ${error.message}`);
    
    try {
      const apiUrl = `https://tikwm.com/api?url=${encodeURIComponent(url)}`;
      
      const response = await axios.get(apiUrl, { timeout: 30000 });
      const data = response.data;
      
      if (data.code === 0 && data.data && data.data.play) {
        const videoResponse = await axios({
          method: 'GET',
          url: data.data.play,
          responseType: 'stream',
          timeout: 60000
        });

        const writer = fs.createWriteStream(outputPath);
        videoResponse.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });
        
        logger.info(`TikTok API download successful: ${url}`);
        
        return {
          filePath: outputPath,
          title: data.data.title || 'TikTok Video',
          platform: 'tiktok'
        };
      } else {
        throw new Error('No video found');
      }
    } catch (apiError) {
      logger.error(`TikTok API failed: ${apiError.message}`);
      throw new Error('TikTok download failed');
    }
  }
};