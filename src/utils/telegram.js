const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Lock file to prevent multiple bot instances
const LOCK_FILE = path.join(__dirname, '../../.bot.lock');

function acquireLock() {
  const myPid = process.pid.toString();
  try {
    // Check if lock file exists and the PID it contains is still alive
    if (fs.existsSync(LOCK_FILE)) {
      const existingPid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
      if (existingPid && existingPid !== process.pid) {
        try {
          // Signal 0 = check if process is alive
          process.kill(existingPid, 0);
          console.log(`⚠️  Bot lock held by PID ${existingPid}. Skipping bot startup to avoid 409.`);
          return false; // Another live process holds the lock
        } catch (e) {
          // Process is dead, we can take the lock
          console.log(`🔓 Stale lock from PID ${existingPid}. Taking over.`);
        }
      }
    }
    fs.writeFileSync(LOCK_FILE, myPid, 'utf8');
    return true;
  } catch (e) {
    console.warn('⚠️  Could not acquire bot lock:', e.message);
    return false;
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
      if (pid === process.pid) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch (e) { /* ignore */ }
}

/**
 * Send a plain notification to all configured Telegram chat IDs
 */
async function sendNotification(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIdsStr = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatIdsStr) {
    console.log('⚠️  Telegram notification skipped (missing TOKEN or CHAT_ID)');
    return;
  }

  try {
    const bot = new Telegraf(token);
    const chatIds = chatIdsStr.split(',').map(id => id.trim()).filter(Boolean);
    const promises = chatIds.map(chatId =>
      bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' })
    );
    await Promise.allSettled(promises);
    console.log(`✅ Telegram notification sent to ${chatIds.length} account(s)!`);
  } catch (err) {
    console.error('❌ Failed to send Telegram notification:', err.message);
  }
}

/**
 * Send a notification with an Approve / Cancel inline keyboard button
 */
async function sendApprovalMessage(message, batchId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIdsStr = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatIdsStr) return;

  const bot = new Telegraf(token);
  const chatIds = chatIdsStr.split(',').map(id => id.trim()).filter(Boolean);

  const keyboard = {
    inline_keyboard: [[
      { text: '✅ Approve & Send All Emails Now', callback_data: `approve_${batchId}` },
      { text: '🗑️ Cancel', callback_data: `cancel_${batchId}` }
    ]]
  };

  const promises = chatIds.map(chatId =>
    bot.telegram.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    })
  );
  await Promise.allSettled(promises);
  console.log(`✅ Approval message sent to ${chatIds.length} account(s) [batch: ${batchId}]`);
}

/**
 * Start Telegram bot long-polling for inline button callbacks.
 * Uses a lock file to ensure only ONE instance polls at a time.
 */
function startBotPolling(onApprove, onCancel) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('⚠️  Bot polling skipped (no TELEGRAM_BOT_TOKEN)');
    return;
  }

  if (!acquireLock()) {
    console.log('⚠️  Bot polling skipped — another instance already running');
    return;
  }

  const bot = new Telegraf(token);

  bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery?.data || '';

    if (data.startsWith('approve_')) {
      const batchId = data.slice('approve_'.length);
      try {
        await ctx.answerCbQuery('⏳ Sending emails, please wait…');
        const result = await onApprove(batchId);
        await ctx.editMessageText(result.message, { parse_mode: 'Markdown' });
      } catch (e) {
        console.error('❌ Approval callback error:', e.message);
        try { await ctx.answerCbQuery('❌ Error: ' + e.message.substring(0, 200)); } catch (_) {}
      }
    } else if (data.startsWith('cancel_')) {
      const batchId = data.slice('cancel_'.length);
      if (onCancel) onCancel(batchId);
      await ctx.answerCbQuery('Cancelled');
      await ctx.editMessageText('🗑️ *Outreach cancelled.*', { parse_mode: 'Markdown' });
    }
  });

  const cleanup = () => { releaseLock(); bot.stop(); };
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
  process.once('exit', releaseLock);

  bot.launch({
    dropPendingUpdates: true // Ignore old button presses from previous sessions
  }).catch(e => {
    console.error('❌ Bot polling error:', e.message);
    releaseLock();
  });

  console.log('✅ Telegram bot polling started — waiting for approvals');
}

module.exports = { sendNotification, sendApprovalMessage, startBotPolling };
