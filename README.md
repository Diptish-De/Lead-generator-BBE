# BlueBloodExports Lead Generator

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
