require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dns = require('dns').promises;

let genAI = null;
let model = null;
if (process.env.GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
}

// ── Keyword Dictionaries ───────────────────────────────────────────

const BUSINESS_TYPE_KEYWORDS = {
  'Home Decor Store': ['home decor', 'home décor', 'home furnishing', 'home accessories', 'homeware', 'homewares', 'home goods'],
  'Interior Designer': ['interior design', 'interior designer', 'interior decoration', 'interior studio', 'design studio'],
  'Boutique': ['boutique', 'curated shop', 'concept store', 'lifestyle store', 'lifestyle boutique'],
  'Gift Shop': ['gift shop', 'gift store', 'museum shop', 'museum store', 'gallery shop', 'souvenir'],
  'Furniture Store': ['furniture', 'furnishing', 'sofa', 'table', 'chair', 'cabinet'],
  'Art Gallery': ['art gallery', 'gallery', 'art dealer', 'fine art', 'contemporary art'],
  'Handicraft Store': ['handicraft', 'handcraft', 'artisan', 'handmade goods', 'craft store', 'craft shop'],
  'Lifestyle Brand': ['lifestyle brand', 'lifestyle', 'wellness', 'mindful living'],
  'Wholesale/Distributor': ['wholesale', 'distributor', 'trade only', 'b2b', 'bulk order'],
  'E-commerce': ['online store', 'online shop', 'e-commerce', 'ecommerce', 'shop online'],
};

const PRODUCT_STYLE_KEYWORDS = {
  'Luxury': ['luxury', 'premium', 'high-end', 'exclusive', 'opulent', 'lavish', 'upscale', 'designer'],
  'Minimal': ['minimal', 'minimalist', 'scandinavian', 'clean lines', 'simple', 'modern minimal'],
  'Handmade': ['handmade', 'hand-made', 'handcrafted', 'hand-crafted', 'artisan', 'artisanal', 'hand woven', 'handwoven'],
  'Boho': ['boho', 'bohemian', 'eclectic', 'free-spirited', 'gypsy', 'hippie'],
  'Traditional': ['traditional', 'classic', 'heritage', 'antique', 'vintage', 'colonial', 'victorian'],
  'Contemporary': ['contemporary', 'modern', 'current', 'trendy', 'cutting-edge'],
  'Rustic': ['rustic', 'farmhouse', 'country', 'barn', 'reclaimed', 'natural wood'],
  'Industrial': ['industrial', 'loft', 'urban', 'metal', 'raw', 'exposed'],
  'Ethnic': ['ethnic', 'tribal', 'african', 'indian', 'moroccan', 'mexican', 'persian', 'oriental'],
  'Sustainable': ['sustainable', 'eco-friendly', 'eco friendly', 'organic', 'fair trade', 'recycled', 'upcycled'],
};

const TARGET_AUDIENCE_KEYWORDS = {
  'Premium Buyers': ['luxury', 'premium', 'high-end', 'exclusive', 'designer', 'bespoke', 'custom', 'couture', 'affluent'],
  'General Customers': ['affordable', 'everyday', 'budget', 'value', 'family', 'home essentials'],
  'Design Professionals': ['interior designer', 'architect', 'trade program', 'to the trade', 'design professional', 'specifier'],
  'Gift Buyers': ['gift', 'present', 'wedding registry', 'corporate gift', 'occasion', 'celebration'],
  'Collectors': ['collector', 'collection', 'limited edition', 'rare', 'one of a kind', 'unique piece'],
  'Eco-Conscious': ['sustainable', 'eco', 'green', 'ethical', 'conscious', 'responsible', 'fair trade'],
};

// ── Data Cleaning Utilities ─────────────────────────────────────────

function cleanCompanyName(name) {
  if (!name) return '';
  // Remove common business suffixes to make it feel human
  return name
    .replace(/\s+(LLC|Inc|Ltd|Limited|Corp|Corporation|PLC|GmbH|S\.A\.)\.?$/i, '')
    .replace(/,\s*(LLC|Inc|Ltd|Limited|Corp|Corporation|PLC|GmbH|S\.A\.)\.?$/i, '')
    .trim();
}

// ── Analysis Functions ─────────────────────────────────────────────

function detectCategory(text, keywordMap) {
  const lowerText = text.toLowerCase();
  let bestMatch = '';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(keywordMap)) {
    let score = 0;
    for (const keyword of keywords) {
      // Count occurrences (weighted)
      const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = lowerText.match(regex);
      if (matches) {
        score += matches.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = category;
    }
  }

  return bestMatch || 'Other';
}

function detectMultipleStyles(text) {
  const lowerText = text.toLowerCase();
  const styles = [];

  for (const [style, keywords] of Object.entries(PRODUCT_STYLE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        styles.push(style);
        break; // One match per style is enough
      }
    }
  }

  return styles.length > 0 ? styles.slice(0, 3).join(', ') : 'General';
}

function generateNotes(companyName, businessType, productStyle, text, metaDescription) {
  if (metaDescription) return metaDescription.slice(0, 150);
  const lowerText = text.toLowerCase().slice(0, 2000);

  const descPatterns = [
    /(?:we are|we're|our company|we specialize|specializing in|offering|providing|dedicated to)\s+([^.!?]{20,120})/i,
    /(?:your|the) (?:premier|leading|trusted|finest|best|top|go-to)\s+([^.!?]{15,100})/i,
  ];

  for (const pattern of descPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].trim().slice(0, 120);
    }
  }

  // Fallback: construct a note
  const parts = [];
  if (businessType && businessType !== 'Other') parts.push(businessType);
  if (productStyle && productStyle !== 'General') parts.push(`featuring ${productStyle.toLowerCase()} products`);

  if (parts.length > 0) {
    return `${companyName || 'Business'} — ${parts.join(', ')}`.slice(0, 120);
  }

  return `${companyName || 'Business'} — potential decor/handicrafts buyer`;
}

function calculateScore(data, businessType, targetAudience) {
  let score = 0;
  // Core contact info
  if (data.emails && data.emails.length > 0) score += 3;
  if (data.decisionMaker) score += 5;
  if (data.instagram) score += 2;
  if (data.phones && data.phones.length > 0) score += 1;

  // High value matches
  if (['Premium Buyers', 'Design Professionals', 'Gift Buyers'].includes(targetAudience)) score += 2;
  if (['Boutique', 'Interior Designer', 'Lifestyle Brand'].includes(businessType)) score += 3;

  let chance = 'Low';
  if (score >= 8) chance = 'High';
  else if (score >= 5) chance = 'Medium';

  return { score, chance };
}

// ── Main Analyzer ──────────────────────────────────────────────────

function analyzeLead(extractedData) {
  const text = extractedData.pageText || '';
  const rawName = extractedData.companyName || '';
  const companyName = cleanCompanyName(rawName);

  const businessType = detectCategory(text, BUSINESS_TYPE_KEYWORDS);
  const productStyle = detectMultipleStyles(text);
  const targetAudience = detectCategory(text, TARGET_AUDIENCE_KEYWORDS);
  const notes = generateNotes(extractedData.companyName, businessType, productStyle, text, extractedData.metaDescription);

  const { score, chance } = calculateScore(extractedData, businessType, targetAudience);

  return {
    companyName,
    businessType,
    productStyle,
    targetAudience,
    notes,
    leadScore: score,
    chance,
  };
}

async function analyzeLeadAI(extractedData, rulesBasedAnalysis) {
  if (!model) return rulesBasedAnalysis; // Fallback to standard regex rules if no API key

  try {
    const text = (extractedData.pageText || '').substring(0, 15000);
    if (text.length < 100) return rulesBasedAnalysis;

    const prompt = `
      You are an expert B2B lead generation analyst for 'BlueBloodExports', an Indian company supplying high-end, artisan-made handicrafts, home decor, and furniture.
      Read the following website text of a company we just scraped.
      
      Determine if this company is a good wholesale buyer for our products.
      
      Respond STRICTLY with ONLY a raw JSON object (no markdown formatting, no code blocks like \`\`\`json).
      Format exactly like this:
      {
        "businessType": "Boutique / Interior Designer / E-commerce / etc",
        "productStyle": "Boho / Luxury / Minimal / etc",
        "targetAudience": "Premium Buyers / Eco-Conscious / etc",
        "notes": "A 1-sentence analytical summary of what this company does and why they are a good or bad fit for BlueBloodExports.",
        "leadScore": (Number 1-10 based purely on context. 10 = perfect match looking for artisans, 1 = completely unrelated),
        "chance": "High / Medium / Low"
      }
      
      Business Metadata:
      "Title: ${extractedData.companyName || ''}"
      "Description: ${extractedData.metaDescription || ''}"

      Website Text to Analyze:
      "${text}"
    `;

    const result = await model.generateContent(prompt);
    let output = result.response.text();
    output = output.replace(/```json/g, '').replace(/```/g, '').trim();

    const parsedData = JSON.parse(output);
    return parsedData;
  } catch (error) {
    console.log(`    ⚠️ AI processing failed, falling back to Rules. Error: ${error.message}`);
    return rulesBasedAnalysis;
  }
}

// ── Batch Analyze ──────────────────────────────────────────────────

async function analyzeAllLeads(extractedDataList) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧠 STEP 3: Initializing Engine & Analyzing business profiles...');
  if (process.env.GEMINI_API_KEY) {
    console.log('🤖 AI ENGINE ONLINE: Using Google Gemini for Deep Analysis!');
  } else {
    console.log('⚠️ AI ENGINE OFFLINE: Using Standard Rules Analysis (Add GEMINI_API_KEY to .env to activate AI)');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const results = [];

  for (let i = 0; i < extractedDataList.length; i++) {
    const data = extractedDataList[i];

    // 1. Get baseline rules-based score (also serves as robust fallback)
    const baseAnalysis = analyzeLead(data);

    // 2. Upgrade to AI analysis
    const analysis = await analyzeLeadAI(data, baseAnalysis);

    // 3. Keep purely technical data-density bonuses from tracking (Emails, Phones, IG, Decision Maker)
    let bonus = 0;
    if (data.emails && data.emails.length > 0) bonus += 2;
    if (data.decisionMaker) bonus += 3;
    if (data.phones && data.phones.length > 0) bonus += 1;
    if (data.instagram) bonus += 1;

    // Add bonus to base or AI score, capping at 10
    const finalScore = Math.min(10, (analysis.leadScore || baseAnalysis.leadScore || 1) + bonus);
    const finalChance = finalScore >= 8 ? 'High' : (finalScore >= 5 ? 'Medium' : 'Low');

    analysis.leadScore = finalScore;
    analysis.chance = finalChance;

    // 4. Verify Email Deliverability
    let emailValid = 'Unknown';
    if (data.emails && data.emails.length > 0) {
      try {
        const domain = data.emails[0].split('@')[1];
        if (domain) {
          const mxRecords = await dns.resolveMx(domain);
          emailValid = (mxRecords && mxRecords.length > 0) ? 'Valid' : 'Invalid';
        }
      } catch (e) {
        emailValid = 'Invalid';
      }
    }
    analysis.emailValid = emailValid;

    console.log(`  [${i + 1}/${extractedDataList.length}] ${data.companyName || 'Unknown'}`);
    console.log(`    📁 ${analysis.businessType} | 🎨 ${analysis.productStyle} | 👥 ${analysis.targetAudience}`);
    console.log(`    ⭐ Score: ${analysis.leadScore} (${analysis.chance} chance)`);
    console.log(`    📧 Email Status: ${analysis.emailValid}`);
    console.log(`    📝 ${analysis.notes}\n`);

    results.push({
      ...data,
      ...analysis,
    });

    // Hard rate limit to protect free tier
    if (process.env.GEMINI_API_KEY && i < extractedDataList.length - 1) {
      await new Promise(r => setTimeout(r, 4000));
    }
  }

  return results;
}

module.exports = { analyzeAllLeads };
