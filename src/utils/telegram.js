const { Telegraf } = require('telegraf');

/**
 * Send notification to Telegram
 * @param {string} message 
 */
async function sendNotification(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log('⚠️  Telegram notification skipped (missing TOKEN or CHAT_ID)');
    return;
  }

  try {
    const bot = new Telegraf(token);
    await bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    console.log('✅ Telegram notification sent!');
  } catch (err) {
    console.error('❌ Failed to send Telegram notification:', err.message);
  }
}

module.exports = { sendNotification };
