# 🏪 Lead Generator — Blueblood Exports (BBE)

Automated lead generation scraper for handicrafts & home decor export business.

**Searches Google → Visits websites → Extracts contacts → Analyzes businesses → Scores leads → Exports to Google Sheets**

---

## 📋 Setup Steps

### Step 1: Apps Script Setup (5 minutes)

1. **Open your Google Sheet**: [Lead-BBE]

2. **Open Apps Script editor**:
   - Click **Extensions** → **Apps Script**
   - This opens a new tab with a code editor

3. **Replace the code**:
   - Delete any existing code in the editor
   - Copy the entire contents of `apps-script/Code.gs` from this project
   - Paste it into the Apps Script editor
   - Click **Save** (💾 icon or Ctrl+S)

4. **Deploy as Web App**:
   - Click **Deploy** → **New deployment**
   - Click the ⚙️ gear icon → Select **Web app**
   - Set **Description**: `Lead Generator API`
   - Set **Execute as**: `Me`
   - Set **Who has access**: `Anyone`
   - Click **Deploy**
   - **Authorize** when prompted (click "Advanced" → "Go to [project name]" → "Allow")
   - **Copy the Web App URL** — it looks like: `https://script.google.com/macros/s/AKfycb.../exec`

5. **Paste the URL in your `.env` file**:
   - Open `.env` in this project folder
   - Replace `YOUR_DEPLOYMENT_ID` with the full URL you copied:
   ```
   APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycb.../exec
   ```

### Step 2: Run the Scraper

```bash
npm start
```

That's it! The scraper will:
1. 🔍 Search Google for leads (with DuckDuckGo fallback)
2. 🌐 Visit each website and extract contacts
3. 🧠 Analyze business type, style, and audience
4. ⭐ Score and filter leads
5. 📊 Send data to your Google Sheet + save CSV backup

### Step 3: Start the Backend & Frontend Dashboard

If you want to view your generated leads in the interactive UI rather than just the spreadsheet, you can boot up the dashboard server system.

**1. Start the Backend API:**
Open a terminal in the root folder (`Lead-generator-BBE`) and run:
```bash
npm install
npm run start:api
```
This serves the lead generation and analytics data securely to your frontend.

**2. Start the Frontend Dashboard:**
Open a **new terminal** window, navigate to the `dashboard` folder, and run:
```bash
cd dashboard
npm install
npm run dev
```
Click the local URL (e.g., `http://localhost:5173`) that appears in the terminal to open the UI!

---

## 📂 Project Structure

```
Lead-generator-BBE/
├── src/
│   ├── index.js                 # Main orchestrator
│   ├── config.js                # All settings & queries
│   ├── scraper/
│   │   ├── googleSearch.js      # Google/DuckDuckGo search
│   │   └── websiteExtractor.js  # Website data extraction
│   ├── analyzer/
│   │   ├── leadAnalyzer.js      # Business analysis
│   │   └── leadScorer.js        # Lead scoring & filtering
│   └── output/
│       ├── csvExporter.js       # CSV backup
│       └── sheetsExporter.js    # Google Sheets via Apps Script
├── apps-script/
│   └── Code.gs                  # Paste this into your Google Sheet
├── output/                      # CSV output (auto-created)
├── .env                         # Your Apps Script URL
└── package.json
```

## 🎯 Output Columns

| Column | Description |
|--------|-------------|
| Company Name | Business name |
| Website | URL |
| Email | Primary contact email |
| Country | Country location |
| City | City location |
| Business Type | Decor store, boutique, interior designer, etc. |
| Product Style | Luxury, handmade, boho, traditional, etc. |
| Target Audience | Premium buyers, general, design professionals |
| Instagram | Instagram profile link |
| Phone | Phone number |
| Notes | 1-line business description |
| Lead Score | 1–5 rating (5 = perfect match) |
| Chance | High / Medium / Low |

## ⚙️ Customization

Edit `src/config.js` to:
- Add/change search queries
- Adjust scoring criteria
- Add more blocked domains
- Change delays between requests
