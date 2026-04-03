const cron = require('node-cron');
const { sendNotification } = require('./utils/telegram');
const { checkReplies } = require('./outreach/replyChecker');
const { runScraperJob } = require('./server'); // Need to export this or wrap it
const axios = require('axios');

// Configure Cron Job: 12 Noon everyday
// Format: minute hour day-of-month month day-of-week
cron.schedule('0 12 * * *', async () => {
    console.log('⏰ 12 Noon! Starting daily BBE Automation...');

    try {
        // 1. Send Startup Notification
        await sendNotification('🚀 *BBE Daily Automation Started (12:00 PM)*\n- Checking replies...\n- Running scrapers...');

        // 2. Check for Replies (Auto-update CSV status to REPLIED)
        const newReplies = await checkReplies();
        if (newReplies.length > 0) {
            await sendNotification(`📩 *New Replies Found:* \n- ${newReplies.join('\n- ')}`);
        }

        // 3. Trigger Scraper via Local Express API
        // This is safer as it uses the same environment/abort logic as the UI
        try {
            const apiRes = await axios.post('http://localhost:4000/api/scrape', {
                options: {
                    autoExport: true,
                    searchLimit: 20
                }
            });
            
            if (apiRes.data.success) {
                console.log('✅ Daily Scraper job initiated successfully.');
            }
        } catch (err) {
            console.error('❌ Failed to trigger scraper via API:', err.message);
            await sendNotification('⚠️ *Automation Alert:* Could not trigger scrapers. Backend might be down.');
        }

        // 4. Send Success / Summary (Note: Scraper results are async, so we'll need to poll or signal completion)
        // For now, just confirming initiation.
    } catch (error) {
        console.error('❌ Fatal error in daily scheduler:', error.message);
        await sendNotification(`❌ *Automation Failed:* ${error.message}`);
    }
}, {
    timezone: "Asia/Kolkata" // Set to user's timezone if possible
});

console.log('✅ BBE Daily Scheduler is active (running at 12:00 PM daily).');
