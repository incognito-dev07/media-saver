const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

fs.ensureDirSync(config.PATHS.LOGS);

class Logger {
  constructor() {
    this.logFile = path.join(config.PATHS.LOGS, 'bot.log');
  }

  log(level, message) {
    const logMessage = `${level.toUpperCase()}: ${message}`;
    console.log(logMessage);
    
    fs.appendFileSync(this.logFile, logMessage + '\n');
  }

  info(message) {
    this.log('info', message);
  }

  error(message) {
    this.log('error', message);
  }

  warn(message) {
    this.log('warn', message);
  }
}

module.exports = new Logger();
