// logger.js - Enhanced logging utility for the Solana Memecoin Trading Bot

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const winston = require('winston');
const { format } = winston;
const DailyRotateFile = require('winston-daily-rotate-file');
const Table = require('cli-table3');
const ora = require('ora');
const figlet = require('figlet');
const boxen = require('boxen');
const { BOT_CONFIG } = require('./config');

// Spinner for loading animations
let spinner = null;

// Ensure log directory exists
const logDir = BOT_CONFIG.LOG_DIR || './logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Log levels with colors
const LOG_LEVELS = {
  DEBUG: { value: 0, color: chalk.cyan, icon: '🔍' },
  INFO: { value: 1, color: chalk.blue, icon: 'ℹ️' },
  WARN: { value: 2, color: chalk.yellow, icon: '⚠️' },
  ERROR: { value: 3, color: chalk.red, icon: '❌' },
  TRADE: { value: 1, color: chalk.green, icon: '💰' },
  ANALYSIS: { value: 1, color: chalk.magenta, icon: '📊' },
  SYSTEM: { value: 1, color: chalk.gray, icon: '🔧' }
};

// Current log level from config
const CURRENT_LOG_LEVEL_VALUE = LOG_LEVELS[BOT_CONFIG.LOG_LEVEL?.toUpperCase()]?.value || LOG_LEVELS.INFO.value;

// Configure Winston format
const logFormat = format.printf(({ timestamp, level, message }) => {
  return `[${timestamp}] [${level}] ${message}`;
});

// Create Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({
      format: () => {
        return getESTTimestamp();
      }
    }),
    logFormat
  ),
  transports: [
    // Info log with daily rotation
    new DailyRotateFile({
      filename: path.join(logDir, 'info-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'info',
      maxSize: '20m',
      maxFiles: '14d'
    }),
    // Error log with daily rotation
    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d'
    }),
    // Debug log with daily rotation (only if debug is enabled)
    ...(CURRENT_LOG_LEVEL_VALUE <= LOG_LEVELS.DEBUG.value ? [
      new DailyRotateFile({
        filename: path.join(logDir, 'debug-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        level: 'debug',
        maxSize: '20m',
        maxFiles: '7d'
      })
    ] : []),
    // Special logs for trades and analysis
    new DailyRotateFile({
      filename: path.join(logDir, 'trades-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d'
    }),
    new DailyRotateFile({
      filename: path.join(logDir, 'analysis-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    })
  ]
});

/**
 * Clear all log files on startup
 */
function clearLogFiles() {
  const clearSpinner = ora('Clearing log files...').start();
  try {
    // Get all log files in the directory
    const files = fs.readdirSync(logDir);

    // Delete each log file
    files.forEach(file => {
      if (file.endsWith('.log')) {
        fs.unlinkSync(path.join(logDir, file));
      }
    });

    clearSpinner.succeed('Log files cleared successfully.');
  } catch (error) {
    clearSpinner.fail(`Failed to clear log files: ${error.message}`);
  }
}

// Clear log files on startup
clearLogFiles();

/**
 * Get current timestamp in EST timezone
 * @returns {string} - Formatted timestamp in EST
 */
function getESTTimestamp() {
  const date = new Date();

  // Format options for EST timezone
  const options = {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };

  // Format the date in EST
  const estTime = date.toLocaleString('en-US', options);

  // Convert to ISO-like format: YYYY-MM-DD HH:MM:SS EST
  const [datePart, timePart] = estTime.split(', ');
  const [month, day, year] = datePart.split('/');

  return `${year}-${month}-${day} ${timePart} EST`;
}

/**
 * Format a console message with color and icon
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @returns {string} - Formatted and colored log message
 */
function formatConsoleMessage(level, message) {
  const levelInfo = LOG_LEVELS[level];
  const timestamp = chalk.dim(getESTTimestamp());
  const levelText = levelInfo.color(`[${level}]`);
  const icon = levelInfo.icon;

  return `${timestamp} ${levelText} ${icon} ${message}`;
}

/**
 * Start a loading spinner with the given text
 * @param {string} text - Text to display with the spinner
 */
function startSpinner(text) {
  if (spinner) spinner.stop();
  spinner = ora(text).start();
}

/**
 * Update the spinner text
 * @param {string} text - New text for the spinner
 */
function updateSpinner(text) {
  if (spinner) spinner.text = text;
}

/**
 * Stop the spinner with success message
 * @param {string} text - Success message
 */
function succeedSpinner(text) {
  if (spinner) spinner.succeed(text);
  spinner = null;
}

/**
 * Stop the spinner with failure message
 * @param {string} text - Failure message
 */
function failSpinner(text) {
  if (spinner) spinner.fail(text);
  spinner = null;
}

/**
 * Display a boxed message
 * @param {string} message - Message to display in box
 * @param {string} title - Optional title for the box
 * @param {string} type - Type of box (info, warning, error, success)
 */
function displayBox(message, title = '', type = 'info') {
  let boxColor = 'blue';
  let textColor = chalk.blue;

  switch (type) {
    case 'warning':
      boxColor = 'yellow';
      textColor = chalk.yellow;
      break;
    case 'error':
      boxColor = 'red';
      textColor = chalk.red;
      break;
    case 'success':
      boxColor = 'green';
      textColor = chalk.green;
      break;
  }

  const boxTitle = title ? `${textColor(title)}\n\n` : '';
  const boxedMessage = boxen(`${boxTitle}${message}`, {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: boxColor,
    align: 'center'
  });

  console.log(boxedMessage);
}

/**
 * Display a figlet banner
 * @param {string} text - Text to display as banner
 * @param {string} color - Color for the banner
 */
function displayBanner(text, color = 'blue') {
  const colorFn = chalk[color] || chalk.blue;
  const banner = figlet.textSync(text, {
    font: 'Standard',
    horizontalLayout: 'default',
    verticalLayout: 'default'
  });

  console.log('\n' + colorFn(banner) + '\n');
}

/**
 * Log a debug message
 * @param {string} message - Message to log
 */
function debug(message) {
  if (CURRENT_LOG_LEVEL_VALUE <= LOG_LEVELS.DEBUG.value) {
    console.log(formatConsoleMessage('DEBUG', message));
    logger.debug(message);
  }
}

/**
 * Log an info message
 * @param {string} message - Message to log
 */
function info(message) {
  if (CURRENT_LOG_LEVEL_VALUE <= LOG_LEVELS.INFO.value) {
    console.log(formatConsoleMessage('INFO', message));
    logger.info(message);
  }
}

/**
 * Log a warning message
 * @param {string} message - Message to log
 */
function warn(message) {
  if (CURRENT_LOG_LEVEL_VALUE <= LOG_LEVELS.WARN.value) {
    console.log(formatConsoleMessage('WARN', message));
    logger.warn(message);
  }
}

/**
 * Log an error message
 * @param {string} message - Message to log
 * @param {Error} [error] - Optional error object
 */
function error(message, error) {
  if (CURRENT_LOG_LEVEL_VALUE <= LOG_LEVELS.ERROR.value) {
    const errorDetails = error ? `\n${error.stack || error.message || error}` : '';
    console.log(formatConsoleMessage('ERROR', message));
    if (errorDetails) {
      console.log(chalk.red(errorDetails));
    }
    logger.error(message + errorDetails);
  }
}

/**
 * Log a trade with enhanced formatting
 * @param {Object} tradeDetails - Details of the trade
 */
function trade(tradeDetails) {
  const { action, symbol, price, amount, profitLoss, txSignature, reason } = tradeDetails;

  // Create a table for trade details
  const table = new Table({
    chars: {
      'top': '═', 'top-mid': '╤', 'top-left': '╔', 'top-right': '╗',
      'bottom': '═', 'bottom-mid': '╧', 'bottom-left': '╚', 'bottom-right': '╝',
      'left': '║', 'left-mid': '╟', 'right': '║', 'right-mid': '╢',
      'mid': '─', 'mid-mid': '┼', 'middle': '│'
    },
    style: { head: ['cyan'], border: ['grey'] }
  });

  // Format profit/loss with color
  const plText = profitLoss
    ? (profitLoss > 0
        ? chalk.green(`+${profitLoss.toFixed(2)}%`)
        : chalk.red(`${profitLoss.toFixed(2)}%`))
    : chalk.grey('N/A');

  // Action color based on buy/sell
  const actionColor = action.toUpperCase() === 'BUY' ? chalk.green : chalk.red;

  // Add rows to the table
  table.push(
    [{ content: actionColor(`${action.toUpperCase()} ${symbol}`), colSpan: 2, hAlign: 'center' }],
    ['Price', `$${price}`],
    ['Amount', amount],
    ['Profit/Loss', plText],
    ['Reason', reason || 'N/A'],
    ['Transaction', txSignature ? chalk.blue(txSignature) : chalk.grey('N/A')]
  );

  // Log to console with enhanced formatting
  console.log('\n' + formatConsoleMessage('TRADE', `${action.toUpperCase()} ${symbol} at $${price}`));
  console.log(table.toString());

  // Log to file
  const logEntry = `[${getESTTimestamp()}] ${action.toUpperCase()} ${symbol}\n` +
                  `  Price: $${price}\n` +
                  `  Amount: ${amount}\n` +
                  `  Profit/Loss: ${profitLoss ? (profitLoss > 0 ? '+' : '') + profitLoss.toFixed(2) + '%' : 'N/A'}\n` +
                  `  Reason: ${reason || 'N/A'}\n` +
                  `  Transaction: ${txSignature || 'N/A'}\n\n`;

  logger.info(`TRADE: ${action.toUpperCase()} ${symbol} at $${price}`);
  fs.appendFileSync(path.join(logDir, 'trades.log'), logEntry);
}

/**
 * Log analysis results with enhanced formatting
 * @param {Object} analysisDetails - Details of the analysis
 */
function analysis(analysisDetails) {
  const { tokenCount, topTokens, duration } = analysisDetails;

  // Create a table for top tokens
  const table = new Table({
    head: ['Rank', 'Symbol', 'Score', 'Price (USD)', '1h Change', '24h Change'],
    chars: {
      'top': '═', 'top-mid': '╤', 'top-left': '╔', 'top-right': '╗',
      'bottom': '═', 'bottom-mid': '╧', 'bottom-left': '╚', 'bottom-right': '╝',
      'left': '║', 'left-mid': '╟', 'right': '║', 'right-mid': '╢',
      'mid': '─', 'mid-mid': '┼', 'middle': '│'
    },
    style: { head: ['cyan'], border: ['grey'] }
  });

  // Add rows for each top token
  topTokens.forEach((token, index) => {
    const priceChange1h = token.priceChange.h1;
    const priceChange24h = token.priceChange.h24;

    // Color the price changes
    const change1hText = priceChange1h > 0
      ? chalk.green(`+${priceChange1h.toFixed(2)}%`)
      : chalk.red(`${priceChange1h.toFixed(2)}%`);

    const change24hText = priceChange24h > 0
      ? chalk.green(`+${priceChange24h.toFixed(2)}%`)
      : chalk.red(`${priceChange24h.toFixed(2)}%`);

    table.push([
      index + 1,
      chalk.bold(token.symbol),
      token.score.toFixed(2),
      `$${token.priceUsd.toFixed(8)}`,
      change1hText,
      change24hText
    ]);
  });

  // Log to console with enhanced formatting
  console.log('\n' + formatConsoleMessage('ANALYSIS', `Completed in ${duration}ms`));
  console.log(chalk.cyan(`Found ${tokenCount} tokens after analysis`));
  console.log(table.toString() + '\n');

  // Log to file
  const topTokensStr = topTokens.map((t, i) =>
    `${i+1}. ${t.symbol}: Score ${t.score.toFixed(2)}, Price $${t.priceUsd.toFixed(8)}, ` +
    `Change 1h ${t.priceChange.h1.toFixed(2)}%, 24h ${t.priceChange.h24.toFixed(2)}%`
  ).join('\n  ');

  const logEntry = `[${getESTTimestamp()}] Analysis Results\n` +
                  `  Found ${tokenCount} tokens after analysis\n` +
                  `  Duration: ${duration}ms\n` +
                  `  Top tokens:\n  ${topTokensStr}\n\n`;

  logger.info(`ANALYSIS: Found ${tokenCount} tokens, top: ${topTokens.map(t => t.symbol).join(', ')}`);
  fs.appendFileSync(path.join(logDir, 'analysis.log'), logEntry);
}

/**
 * Log a system message (startup, shutdown, etc.)
 * @param {string} message - System message to log
 */
function system(message) {
  console.log(formatConsoleMessage('SYSTEM', message));
  logger.info(`SYSTEM: ${message}`);
}

module.exports = {
  debug,
  info,
  warn,
  error,
  trade,
  analysis,
  system,
  startSpinner,
  updateSpinner,
  succeedSpinner,
  failSpinner,
  displayBox,
  displayBanner,
  clearLogFiles
};
