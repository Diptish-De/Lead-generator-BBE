// ── Relevant Business Types (keep these) ───────────────────────────
const RELEVANT_TYPES = [
  'Home Decor Store', 'Interior Designer', 'Boutique', 'Gift Shop',
  'Handicraft Store', 'Art Gallery', 'Furniture Store', 'Lifestyle Brand',
  'Wholesale/Distributor', 'E-commerce',
];

// ── High-value style keywords ──────────────────────────────────────
const HIGH_VALUE_STYLES = ['Handmade', 'Luxury', 'Ethnic', 'Traditional', 'Boho', 'Sustainable', 'Rustic'];
const MEDIUM_VALUE_STYLES = ['Contemporary', 'Minimal', 'Industrial'];

// ── Email Validation ───────────────────────────────────────────────
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  return regex.test(email.trim());
}

// ── Lead Scoring ───────────────────────────────────────────────────
function scoreLead(lead) {
  let score = 0;

  // +1: Has valid email
  if (lead.emails && lead.emails.length > 0 && isValidEmail(lead.emails[0])) {
    score += 1;
  }

  // +1: Relevant business type
  if (RELEVANT_TYPES.includes(lead.businessType)) {
    score += 1;
  }

  // +1: High-value product style
  const styles = (lead.productStyle || '').split(',').map(s => s.trim());
  if (styles.some(s => HIGH_VALUE_STYLES.includes(s))) {
    score += 1;
  } else if (styles.some(s => MEDIUM_VALUE_STYLES.includes(s))) {
    score += 0.5;
  }

  // +1: Has clear contact info (email + phone or email + location)
  if (lead.emails?.length > 0 && (lead.phones?.length > 0 || lead.country)) {
    score += 1;
  }

  // +1: Strong fit for handicraft export (handmade/artisan keywords in text)
  const text = (lead.pageText || '').toLowerCase();
  const exportFitKeywords = ['handmade', 'handcrafted', 'artisan', 'artisanal', 'handicraft',
    'hand woven', 'hand carved', 'hand painted', 'fair trade', 'ethically sourced',
    'imported', 'global', 'international', 'sourcing', 'wholesale'];
  const fitCount = exportFitKeywords.filter(kw => text.includes(kw)).length;
  if (fitCount >= 3) score += 1;
  else if (fitCount >= 1) score += 0.5;

  // Round to nearest integer, clamp 1-5
  score = Math.round(score);
  score = Math.max(1, Math.min(5, score));

  return score;
}

// ── Chance Label ───────────────────────────────────────────────────
function getChanceLabel(score) {
  if (score >= 4) return 'High';
  if (score >= 2) return 'Medium';
  return 'Low';
}

// ── Filter & Score All Leads ───────────────────────────────────────
function scoreAndFilterLeads(leads) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⭐ STEP 4: Scoring & filtering leads...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const scored = [];
  let filtered = 0;

  for (const lead of leads) {
    // Filter: must have at least one valid email
    if (!lead.emails || lead.emails.length === 0 || !isValidEmail(lead.emails[0])) {
      filtered++;
      console.log(`  ❌ Filtered (no valid email): ${lead.companyName || lead.website}`);
      continue;
    }

    // Filter: must be a relevant business type
    if (!RELEVANT_TYPES.includes(lead.businessType) && lead.businessType !== 'Other') {
      // Still keep "Other" — they might be relevant
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
    });

    console.log(`  ✅ ${lead.companyName || 'Unknown'} → Score: ${score}/5 (${chance})`);
  }

  // Sort by score (highest first)
  scored.sort((a, b) => b.leadScore - a.leadScore);

  // Deduplicate by domain + email
  const seen = new Set();
  const deduped = scored.filter(lead => {
    const domain = lead.website.replace(/https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
    const key = `${domain}|${lead.email}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`\n📊 Results: ${deduped.length} qualified leads (${filtered} filtered out, ${scored.length - deduped.length} duplicates removed)\n`);

  return deduped;
}

module.exports = { scoreAndFilterLeads };
