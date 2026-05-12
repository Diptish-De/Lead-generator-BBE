# BlueBloodExports Lead Generator

**A comprehensive, AI-powered lead generation and outreach system built for BlueBloodExports.**

## 🌟 What I Built (Project Overview)

In this project, I developed a complete automated system to find, qualify, and contact B2B importers, wholesale buyers, and distributors for handcrafted Indian artefacts and home decor. 

### Key Features & Technical Highlights:
- **Automated Web Scraper:** Built with Node.js and Puppeteer to scrape Google search results and extract rich company data from target B2B trade platforms and direct buyer websites.
- **AI-Powered Keyword Suggestions:** Integrated Google's Generative AI (Gemini 1.5 Flash) to automatically generate high-intent search queries based on user topics.
- **Lead Scoring & Analysis:** Implemented an intelligent analyzer that scores and filters leads based on relevance, ensuring only high-quality prospects are processed.
- **Outreach Engine:** Created a built-in outreach manager that tracks lead status (New, Sent, Replied), generates email drafts, and checks for email replies via IMAP.
- **Data Management & Export:** Managed lead data locally via CSV and implemented an automatic synchronization feature to push qualified leads directly to Google Sheets.
- **Telegram Integrations:** Added real-time Telegram bot notifications to alert me when automated tasks finish or when new email drafts are prepared.
- **Full-Stack Dashboard:** Built a full-stack architecture with an Express.js backend API and a React/Web dashboard to visually manage the scraping jobs, view logs in real-time, and handle outreach seamlessly.
- **Daily Scheduler:** Set up automated cron jobs (`node-cron`) to run scraping and outreach tasks daily without manual intervention.

---

## 🚀 How to Run Locally

To run this project locally, follow these steps:

### 1. Initial Setup (One-time)
Install dependencies in the root and dashboard:
```bash
npm install
cd dashboard && npm install
cd ..
```

### 2. Configure Environment
Create a `.env` file in the root based on `.env.example` and fill in your keys (Gemini API, Telegram Bot, etc).

### 3. Start Both Server & UI (Recommended)
This command runs both the backend scraper and the dashboard UI:
```bash
npm run dev
```

### 4. Optional: Run Daily Scheduler
Run this to keep the automation alive (runs at 12 noon daily):
```bash
npm run scheduler
```
