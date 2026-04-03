# 🚀 BlueBloodExports CRM - Deployment Guide

Since you're using **Hostinger KVM 2 (VPS)**, here's the best way to host this automation system.

## 1. Prepare Your VPS
Connect via SSH:
```bash
ssh root@your-vps-ip
```

Install Node.js (if not already):
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Install PM2 globally to keep the app running forever:
```bash
sudo npm install pm2 -g
```

## 2. Clone and Setup
Upload your project or git clone it on the VPS.
Then install dependencies:
```bash
cd lead-generator-BBE
npm install
cd dashboard
npm install
npm run build
cd ..
```

## 3. Configure Environment Variables
Edit your `.env` file on the VPS:
```bash
nano .env
```
Ensure you have the following filled:
- `TELEGRAM_BOT_TOKEN`: Get from BotFather.
- `TELEGRAM_CHAT_ID`: Get from @userinfobot.
- `EMAIL_USER`: Your sales email (e.g., sales@BlueBloodExports.com).
- `EMAIL_PASSWORD`: Your App Password (NOT your regular password).
- `GEMINI_API_KEY`: For AI lead scoring.

## 4. Run the Automation
We'll run both the API Server and the Daily Scheduler using PM2.

```bash
# Start the Backend API
pm2 start src/server.js --name bbe-api

# Start the Daily Scheduler (the 12 Noon Trigger)
pm2 start src/scheduler.js --name bbe-scheduler

# Save the process list so they restart on reboot
pm2 save
pm2 startup
```

## 5. View your CRM
To view the UI (the Dashboard), you can serve the `dashboard/dist` folder using Nginx, or for a quick test:
```bash
cd dashboard
npm run dev -- --host
```
*Note: For production, we recommend building with `npm run build` and serving with Nginx.*

## 6. How it Works (Automation Flow)
1. **Daily at 12:00 PM (IST):** The scheduler starts.
2. **Step 1:** It checks your Email inbox (IMAP) for any replies. If found, it marks that lead as **Replied** in the CRM.
3. **Step 2:** It pings you on **Telegram** with a summary of new replies.
4. **Step 3:** it triggers the **Scrapers** to find new leads based on your target topics.
5. **Step 4:** It sends you another Telegram notification when new potential leads are added.

---
**Need help with Telegram Bot?** Just ask!
