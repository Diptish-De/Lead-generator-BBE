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

function generateNotes(companyName, businessType, productStyle, text) {
  const lowerText = text.toLowerCase().slice(0, 2000);

  // Try to find a meta description or first meaningful sentence
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

  const businessType = detectCategory(text, BUSINESS_TYPE_KEYWORDS);
  const productStyle = detectMultipleStyles(text);
  const targetAudience = detectCategory(text, TARGET_AUDIENCE_KEYWORDS);
  const notes = generateNotes(extractedData.companyName, businessType, productStyle, text);
  
  const { score, chance } = calculateScore(extractedData, businessType, targetAudience);

  return {
    businessType,
    productStyle,
    targetAudience,
    notes,
    leadScore: score,
    chance,
  };
}

// ── Batch Analyze ──────────────────────────────────────────────────

function analyzeAllLeads(extractedDataList) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧠 STEP 3: Analyzing and Scoring business profiles...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const results = extractedDataList.map((data, i) => {
    const analysis = analyzeLead(data);
    console.log(`  [${i + 1}/${extractedDataList.length}] ${data.companyName || 'Unknown'}`);
    console.log(`    📁 ${analysis.businessType} | 🎨 ${analysis.productStyle} | 👥 ${analysis.targetAudience}`);
    console.log(`    ⭐ Score: ${analysis.leadScore} (${analysis.chance} chance)`);
    console.log(`    📝 ${analysis.notes}\n`);

    return {
      ...data,
      ...analysis,
    };
  });

  return results;
}

module.exports = { analyzeAllLeads };
