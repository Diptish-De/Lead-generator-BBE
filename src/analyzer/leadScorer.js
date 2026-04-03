// ── Relevant Business Types (keep these) ───────────────────────────
const RELEVANT_TYPES = [
  'Home Decor Store', 'Interior Designer', 'Boutique', 'Gift Shop',
  'Handicraft Store', 'Art Gallery', 'Furniture Store', 'Lifestyle Brand',
  'Wholesale/Distributor', 'E-commerce', 'Concept Store', 'Design Studio'
];

// ── High-value styles (based on handicraft/decor trends) ───────────
const HIGH_VALUE_STYLES = ['Handmade', 'Luxury', 'Ethnic', 'Traditional', 'Boho', 'Sustainable', 'Rustic', 'Artisan'];
const MEDIUM_VALUE_STYLES = ['Contemporary', 'Minimal', 'Industrial', 'Vintage', 'Modern'];

// ── Generic Email Domains (penalty) ───────────────────────────────
const GENERIC_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com'];

// ── Import utilities for fuzzy deduplication ─────────────────────
const { normalizeUrl, deduplicateLeads } = require('../utils');

// ── Email Validation ───────────────────────────────────────────────
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  return regex.test(email.trim());
}

// ── Lead Scoring (Scale 1-10 internally, clamped 1-5 for output) ───
function scoreLead(lead) {
  let score = 0;

  // +1: Has valid email
  const email = (lead.emails && lead.emails.length > 0) ? lead.emails[0] : null;
  if (email && isValidEmail(email)) {
    score += 2;

    // -1 Penalty for generic/personal domains (B2B prefers business domains)
    const domain = email.split('@')[1]?.toLowerCase();
    if (GENERIC_DOMAINS.includes(domain)) {
      score -= 1;
    }
  }

  // +2: VIP business types (Boutiques and Interior Designers are highest conversion)
  if (['Boutique', 'Interior Designer', 'Concept Store'].includes(lead.businessType)) {
    score += 3;
  } else if (RELEVANT_TYPES.includes(lead.businessType)) {
    score += 1.5;
  }

  // +Style weighting
  const styles = (lead.productStyle || '').split(',').map(s => s.trim());
  if (styles.some(s => HIGH_VALUE_STYLES.includes(s))) {
    score += 2;
  } else if (styles.some(s => MEDIUM_VALUE_STYLES.includes(s))) {
    score += 1;
  }

  // +1: Decision Maker found (HUGE conversion booster)
  if (lead.decisionMaker) {
    score += 3;
  }

  // +1: Location context (specific countries they export to regularly)
  if (['USA', 'UK', 'Europe', 'Canada', 'Australia'].includes(lead.country)) {
    score += 1;
  }

  // Final scale: divide by 2 to get a nice 1-5 range with decimals
  let finalScore = Math.round(score / 2 * 2) / 2; // Round to nearest 0.5
  finalScore = Math.max(1, Math.min(5, finalScore));

  return finalScore;
}

// ── Chance Label ───────────────────────────────────────────────────
function getChanceLabel(score) {
  if (score >= 4) return 'High';
  if (score >= 2.5) return 'Medium';
  return 'Low';
}

// ── Filter & Score All Leads ───────────────────────────────────────
function scoreAndFilterLeads(leads, options = {}) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⭐ STEP 4: Scoring & filtering leads...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const scored = [];
  let filtered = 0;

  for (const lead of leads) {
    // Filter: mandatory email if strictMode is on
    const email = lead.emails && lead.emails.length > 0 && isValidEmail(lead.emails[0]) ? lead.emails[0] : null;
    const hasSocial = !!lead.instagram || !!lead.pinterest || (lead.phones && lead.phones.length > 0);

    if (options.strictMode && !email) {
      filtered++;
      console.log(`  ❌ Strict Filter (no email): ${lead.companyName || lead.website}`);
      continue;
    }

    if (!email && !hasSocial) {
      filtered++;
      console.log(`  ❌ Filtered (no contact points): ${lead.companyName || lead.website}`);
      continue;
    }

    // Filter: must NOT be an obvious non-fit (e.g., SEO, Marketing, Real Estate)
    const junkTypes = ['Marketing Agency', 'SEO Agency', 'Real Estate', 'Consultancy'];
    if (junkTypes.includes(lead.businessType)) {
      filtered++;
      console.log(`  ❌ Filtered (Irrelevant niche): ${lead.companyName} (${lead.businessType})`);
      continue;
    }

    const score = scoreLead(lead);
    const chance = getChanceLabel(score);

    scored.push({
      companyName: lead.companyName || '',
      website: lead.website || '',
      email: lead.emails[0] || '',
      country: lead.country || '',
      city: lead.city || '',
      businessType: lead.businessType || '',
      productStyle: lead.productStyle || '',
      targetAudience: lead.targetAudience || '',
      instagram: lead.instagram || '',
      phone: lead.phones?.[0] || '',
      notes: lead.notes || '',
      leadScore: score,
      chance: chance,
      dateScraped: new Date().toISOString(),
      status: 'New',
      emailed: 'false',
    });

    console.log(`  ✅ ${lead.companyName || 'Unknown'} → Score: ${score}/5 (${chance})`);
  }

  // Sort by score (highest first)
  scored.sort((a, b) => b.leadScore - a.leadScore);

  // Use fuzzy deduplication that handles URL variations
  const deduped = deduplicateLeads(scored);

  console.log(`\n📊 Results: ${deduped.length} qualified leads (${filtered} filtered out, ${scored.length - deduped.length} duplicates removed)\n`);

  return deduped;
}

module.exports = { scoreAndFilterLeads };
