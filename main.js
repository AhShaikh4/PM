// main.js - Main entry point for the Solana Memecoin Trading Bot

require('dotenv').config();
const fs = require('fs').promises;
const { initializeConnection, initializeWallet, checkWalletBalance, initializeMode } = require('./wallet');
const { MODES } = require('./mode');
const { performTA } = require('./TA');
const { executeTradingStrategy, stopTrading, getCurrentPositions } = require('./trading');
const { DexScreenerService } = require('./src/services/dexscreener');
const { BOT_CONFIG } = require('./config');
const logger = require('./logger');

// Global state
let isRunning = false;
let analysisInterval = null;
const ANALYSIS_INTERVAL = BOT_CONFIG.ANALYSIS_INTERVAL_MINUTES * 60 * 1000; // Convert minutes to milliseconds

/**
 * Initialize all required services and connections
 * @returns {Object} Initialized services and connections
 */
async function initialize() {
  console.log('Initializing Solana Memecoin Trading Bot...');

  try {
    // Initialize wallet and connection
    const connection = initializeConnection();
    const wallet = initializeWallet();
    const walletInfo = await checkWalletBalance(wallet);

    // Check if wallet has sufficient balance
    if (!walletInfo.hasMinimumBalance) {
      console.error(`Insufficient wallet balance (${walletInfo.balance} SOL) for trading.`);
      console.log('You can still run in monitoring mode.');
    }

    console.log('\nWallet Status:');
    console.log('-------------');
    console.log(`Public Key: ${walletInfo.publicKey}`);
    console.log(`Balance: ${walletInfo.balance} SOL`);
    console.log(`Minimum Balance Check: ${walletInfo.hasMinimumBalance ? 'PASSED' : 'FAILED'}`);

    // Initialize bot mode
    const mode = await initializeMode(walletInfo.balance);
    console.log(`\nBot Mode: ${mode.toUpperCase()}`);

    // Initialize services
    const dexService = new DexScreenerService();

    return {
      connection,
      wallet,
      walletInfo,
      mode,
      dexService
    };
  } catch (error) {
    console.error('\nInitialization Error:');
    console.error('-------------------');
    console.error(error.message);
    throw error;
  }
}

/**
 * Run a single analysis and trading cycle
 * @param {Object} services - Initialized services and connections
 */
async function runCycle(services) {
  try {
    const startTime = Date.now();
    logger.info(`Starting Analysis Cycle`);

    // Perform technical analysis to find trading opportunities
    logger.info('Performing technical analysis...');
    const analyzedTokens = await performTA(services.dexService);

    // Log analysis results
    const duration = Date.now() - startTime;
    logger.analysis({
      tokenCount: analyzedTokens.length,
      topTokens: analyzedTokens.slice(0, 5),
      duration
    });

    // Execute trading strategy if in trading mode
    if (services.mode === MODES.TRADING && BOT_CONFIG.TRADING_ENABLED) {
      logger.info('Executing trading strategy...');
      const result = await executeTradingStrategy(analyzedTokens, services);

      if (result.success) {
        logger.info(`Trading strategy executed successfully. Positions opened: ${result.positionsOpened}`);
        if (result.positionsOpened > 0) {
          result.positions.forEach(pos => {
            logger.info(`Position opened: ${pos.symbol} at $${pos.entryPrice}, amount: ${pos.amount}`);
          });
        }
      } else {
        logger.warn(`Trading strategy execution failed: ${result.reason}`);
      }
    } else {
      logger.info(`Running in ${services.mode} mode. No trades will be executed.`);

      // Log potential trades that would have been made
      if (analyzedTokens.length > 0) {
        const potentialTrades = analyzedTokens
          .filter(token => token.score > BOT_CONFIG.MIN_SCORE)
          .slice(0, 5);

        if (potentialTrades.length > 0) {
          logger.info(`Found ${potentialTrades.length} potential trading opportunities:`);
          potentialTrades.forEach(token => {
            logger.info(`- ${token.symbol}: Score ${token.score.toFixed(2)}, Price $${token.priceUsd.toFixed(8)}, Change 1h: ${token.priceChange.h1.toFixed(2)}%`);
          });
        }
      }
    }

    logger.info(`Analysis Cycle Completed in ${duration}ms`);
    return analyzedTokens;
  } catch (error) {
    logger.error(`Cycle Error: ${error.message}`, error);
    return [];
  }
}

/**
 * Start the bot's main loop
 */
async function startBot() {
  if (isRunning) {
    logger.info('Bot is already running.');
    return { success: false, reason: 'already_running' };
  }

  try {
    // Initialize all services
    logger.info('Initializing bot services...');
    const services = await initialize();
    isRunning = true;

    // Create log directory if it doesn't exist
    const logDir = BOT_CONFIG.LOG_DIR || './logs';
    await fs.mkdir(logDir, { recursive: true }).catch(() => {});

    // Log bot configuration
    logger.info(`Bot Configuration:`);
    logger.info(`- Network: ${BOT_CONFIG.NETWORK}`);
    logger.info(`- Trading Enabled: ${BOT_CONFIG.TRADING_ENABLED}`);
    logger.info(`- Analysis Interval: ${BOT_CONFIG.ANALYSIS_INTERVAL_MINUTES} minutes`);
    logger.info(`- Max Positions: ${BOT_CONFIG.MAX_POSITIONS}`);
    logger.info(`- Buy Amount: ${BOT_CONFIG.BUY_AMOUNT_SOL} SOL`);

    // Run first cycle immediately
    logger.info('Running initial analysis cycle...');
    const initialTokens = await runCycle(services);
    logger.info(`Initial analysis found ${initialTokens.length} tokens`);

    // Set up interval for subsequent cycles
    logger.info(`Setting up recurring analysis every ${BOT_CONFIG.ANALYSIS_INTERVAL_MINUTES} minutes`);
    analysisInterval = setInterval(() => runCycle(services), ANALYSIS_INTERVAL);

    logger.info(`Bot started successfully. Press Ctrl+C to stop the bot.`);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received shutdown signal (Ctrl+C)');
      await stopBot();
      logger.info('Exiting process...');
      process.exit(0);
    });

    return { success: true, message: 'Bot started successfully' };
  } catch (error) {
    logger.error(`Failed to start bot: ${error.message}`, error);
    isRunning = false;
    return { success: false, reason: 'initialization_failed', error: error.message };
  }
}

/**
 * Stop the bot and clean up resources
 */
async function stopBot() {
  if (!isRunning) {
    logger.info('Bot is not running.');
    return { success: true, message: 'Bot was not running' };
  }

  logger.info('Stopping bot...');

  // Clear the analysis interval
  if (analysisInterval) {
    clearInterval(analysisInterval);
    analysisInterval = null;
    logger.info('Analysis interval cleared.');
  }

  // Stop trading activities
  try {
    const tradingResult = await stopTrading();
    logger.info(`Trading stopped: ${tradingResult.message || 'Successfully'}`);

    // Get current positions before stopping
    const positions = getCurrentPositions();
    if (positions.length > 0) {
      logger.warn(`Bot stopped with ${positions.length} open positions. These will need to be managed manually.`);
    }
  } catch (error) {
    logger.error('Error stopping trading activities', error);
  }

  isRunning = false;
  logger.info('Bot stopped successfully.');
  return { success: true, message: 'Bot stopped successfully' };
}

/**
 * Main function to run the bot
 */
async function main() {
  try {
    logger.info('Starting Solana Memecoin Trading Bot...');
    const result = await startBot();

    if (!result.success) {
      logger.error(`Failed to start bot: ${result.reason}`);
      process.exit(1);
    }
  } catch (error) {
    logger.error(`Fatal error: ${error.message}`, error);
    process.exit(1);
  }
}

/**
 * Get bot status
 * @returns {Object} - Bot status information
 */
function getBotStatus() {
  return {
    isRunning,
    uptime: isRunning ? Date.now() - startTime : 0,
    positions: getCurrentPositions(),
    config: {
      network: BOT_CONFIG.NETWORK,
      tradingEnabled: BOT_CONFIG.TRADING_ENABLED,
      analysisInterval: BOT_CONFIG.ANALYSIS_INTERVAL_MINUTES,
      maxPositions: BOT_CONFIG.MAX_POSITIONS
    }
  };
}

// Track bot start time
let startTime = 0;

// Run the bot if this file is executed directly
if (require.main === module) {
  startTime = Date.now();
  main();
}

// Export functions for potential programmatic use
module.exports = {
  startBot,
  stopBot,
  runCycle,
  getBotStatus
};
