/**
 * Utility functions for the Lead Generator scraper
 * Includes retry logic, circuit breaker, fuzzy URL matching, and caching
 */

const fs = require('fs');
const path = require('path');

// ── Config Helpers ──────────────────────────────────────────────────────────

function randomDelay([min, max]) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomUserAgent(config) {
    return config.userAgents[Math.floor(Math.random() * config.userAgents.length)];
}

// ── Fuzzy URL Deduplication ─────────────────────────────────────────────────

/**
 * Normalize a URL for comparison purposes
 * Handles www prefix, trailing slashes, http vs https, query params
 */
function normalizeUrl(url) {
    if (!url) return '';

    try {
        const u = new URL(url);

        // Remove www prefix
        let hostname = u.hostname.replace(/^www\./, '');

        // Normalize pathname (remove trailing slashes)
        let pathname = u.pathname.replace(/\/+$/, '') || '/';

        // Return normalized URL (using http as default)
        return `${hostname}${pathname}`.toLowerCase();
    } catch {
        // Fallback for invalid URLs
        return url.toLowerCase()
            .replace(/^https?:\/\/(www\.)?/, '')
            .replace(/\/+$/, '');
    }
}

/**
 * Extract domain from URL
 */
function getDomain(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        return '';
    }
}

/**
 * Clean URL for display/storage
 */
function cleanUrl(url) {
    try {
        const u = new URL(url);
        return `${u.protocol}//${u.hostname}${u.pathname}`.replace(/\/+$/, '');
    } catch {
        return url;
    }
}

// ── Domain Blacklist Check ──────────────────────────────────────────────────

function isBlockedDomain(url, config) {
    try {
        const hostname = getDomain(url);
        return config.blockedDomains.some(blocked => hostname.includes(blocked));
    } catch {
        return true;
    }
}

// ── Retry Logic with Exponential Backoff ───────────────────────────────────

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} Result of the function
 */
async function retryWithBackoff(fn, options = {}) {
    const {
        maxRetries = 3,
        baseDelay = 1000,
        maxDelay = 10000,
        backoffFactor = 2,
        onRetry = null,
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt < maxRetries) {
                // Calculate delay with exponential backoff and jitter
                const delay = Math.min(
                    baseDelay * Math.pow(backoffFactor, attempt) + Math.random() * 500,
                    maxDelay
                );

                if (onRetry) {
                    onRetry(attempt + 1, maxRetries, delay, error.message);
                }

                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError;
}

// ── Circuit Breaker Pattern ─────────────────────────────────────────────────

class CircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 60000; // 1 minute
        this.maxCircuits = options.maxCircuits || 1000; // Prevent memory leak
        this.state = new Map();
    }

    /**
     * Execute a function through the circuit breaker
     */
    async execute(key, fn) {
        // Prevent memory leak - remove oldest circuit if at limit
        if (this.state.size >= this.maxCircuits) {
            const oldestKey = this.state.keys().next().value;
            this.state.delete(oldestKey);
        }

        const state = this.state.get(key) || { status: 'closed', failures: 0, lastFailure: 0 };

        // Check if circuit is open
        if (state.status === 'open') {
            // Check if we should try to close it (auto-reset after timeout)
            if (Date.now() - state.lastFailure > this.resetTimeout) {
                state.status = 'half-open';
                state.failures = 0; // Reset failures on auto-retry
                this.state.set(key, state);
                console.log(`  🟡 Circuit breaker HALF-OPEN for ${key} - testing...`);
            } else {
                throw new Error(`Circuit breaker open for ${key}. Try again later.`);
            }
        }

        try {
            const result = await fn();

            // Success - reset circuit
            if (state.status === 'half-open') {
                state.status = 'closed';
                state.failures = 0;
                console.log(`  🟢 Circuit breaker CLOSED for ${key} - recovered!`);
            } else if (state.failures > 0) {
                state.failures = 0;
            }

            this.state.set(key, state);
            return result;
        } catch (error) {
            state.failures++;
            state.lastFailure = Date.now();

            if (state.failures >= this.failureThreshold) {
                state.status = 'open';
                console.log(`  🔴 Circuit breaker OPENED for ${key} (fails: ${state.failures})`);
            }

            this.state.set(key, state);
            throw error;
        }
    }

    /**
     * Get status of a circuit
     */
    getStatus(key) {
        return this.state.get(key) || { status: 'closed', failures: 0 };
    }

    /**
     * Reset a specific circuit
     */
    reset(key) {
        this.state.delete(key);
    }

    /**
     * Reset all circuits
     */
    resetAll() {
        this.state.clear();
    }

    /**
     * Get statistics
     */
    getStats() {
        const stats = { open: 0, halfOpen: 0, closed: 0, total: this.state.size };
        for (const state of this.state.values()) {
            stats[state.status]++;
        }
        return stats;
    }
}

// ── Domain Cache ─────────────────────────────────────────────────────────────

class DomainCache {
    constructor(cacheFile = 'output/scraped_domains.json', options = {}) {
        this.cacheFile = path.resolve(cacheFile);
        this.maxSize = options.maxSize || 10000; // Max domains to cache
        this.maxAge = options.maxAge || 7 * 24 * 60 * 60 * 1000; // 7 days default
        this.cache = this._load();
        this._cleanup(); // Clean stale entries on startup
    }

    _load() {
        try {
            if (fs.existsSync(this.cacheFile)) {
                const data = fs.readFileSync(this.cacheFile, 'utf8');
                const parsed = JSON.parse(data);
                // Validate structure
                if (typeof parsed === 'object' && parsed !== null) {
                    return parsed;
                }
            }
        } catch (e) {
            // File corrupted or invalid - start fresh
            console.log(`  ⚠️  Domain cache corrupted, starting fresh: ${e.message}`);
            this._backupCorruptedFile();
        }
        return {};
    }

    _backupCorruptedFile() {
        try {
            const backupPath = this.cacheFile + '.backup.' + Date.now();
            if (fs.existsSync(this.cacheFile)) {
                fs.copyFileSync(this.cacheFile, backupPath);
                console.log(`  📁 Backed up corrupted cache to: ${backupPath}`);
            }
        } catch (e) {
            // Ignore backup errors
        }
    }

    _save() {
        try {
            const dir = path.dirname(this.cacheFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // Atomic write: write to temp file first, then rename
            const tempFile = this.cacheFile + '.tmp';
            fs.writeFileSync(tempFile, JSON.stringify(this.cache, null, 2), 'utf8');
            fs.renameSync(tempFile, this.cacheFile);
        } catch (e) {
            console.log(`  ⚠️  Could not save domain cache: ${e.message}`);
        }
    }

    _cleanup() {
        const now = Date.now();
        let cleaned = 0;
        for (const [domain, entry] of Object.entries(this.cache)) {
            // Remove stale entries
            if (now - entry.timestamp > this.maxAge) {
                delete this.cache[domain];
                cleaned++;
            }
        }
        if (cleaned > 0) {
            console.log(`  🧹 Cleaned ${cleaned} stale cache entries`);
            this._save();
        }
    }

    _enforceSizeLimit() {
        const domains = Object.keys(this.cache);
        if (domains.length >= this.maxSize) {
            // Remove oldest entries
            const sorted = domains.sort((a, b) =>
                (this.cache[a]?.timestamp || 0) - (this.cache[b]?.timestamp || 0)
            );
            const toRemove = Math.ceil(this.maxSize * 0.2); // Remove 20%
            for (let i = 0; i < toRemove && i < sorted.length; i++) {
                delete this.cache[sorted[i]];
            }
            console.log(`  🗑️  Cache full, removed ${toRemove} oldest entries`);
        }
    }

    /**
     * Check if domain was recently scraped
     */
    has(domain) {
        if (!this.cache[domain]) return false;

        // Also check if entry has valid structure
        if (!this.cache[domain].timestamp || !this.cache[domain].data) {
            delete this.cache[domain];
            return false;
        }

        return Date.now() - this.cache[domain].timestamp < this.maxAge;
    }

    /**
     * Get cached data for domain
     */
    get(domain) {
        if (this.has(domain)) {
            return this.cache[domain].data;
        }
        return null;
    }

    /**
     * Store data for domain
     */
    set(domain, data) {
        // Don't cache empty results
        if (!data || (Array.isArray(data.emails) && data.emails.length === 0)) {
            return;
        }

        this.cache[domain] = {
            timestamp: Date.now(),
            data
        };
        this._enforceSizeLimit();
        this._save();
    }

    /**
     * Invalidate cache for a domain
     */
    invalidate(domain) {
        delete this.cache[domain];
        this._save();
    }

    /**
     * Clear all cache
     */
    clear() {
        this.cache = {};
        this._save();
    }

    /**
     * Get cache statistics
     */
    stats() {
        const domains = Object.keys(this.cache);
        const now = Date.now();

        return {
            total: domains.length,
            maxSize: this.maxSize,
            fresh: domains.filter(d => now - (this.cache[d]?.timestamp || 0) < this.maxAge).length,
            stale: domains.filter(d => now - (this.cache[d]?.timestamp || 0) >= this.maxAge).length
        };
    }
}

// ── Parallel Execution with Concurrency Control ─────────────────────────────

/**
 * Process items in parallel with concurrency limit
 * @param {Array} items - Items to process
 * @param {Function} processor - Async function to process each item
 * @param {Object} options - Options
 * @returns {Promise<Array>} Results
 */
async function processWithConcurrency(items, processor, options = {}) {
    const {
        concurrency = 3,
        onProgress = null,
        onError = null,
    } = options;

    const results = [];
    const errors = [];
    let completed = 0;

    // Create a batch processor
    async function processBatch(batch) {
        return Promise.all(
            batch.map(async (item) => {
                try {
                    const result = await processor(item);
                    completed++;
                    if (onProgress) {
                        onProgress(completed, items.length, null);
                    }
                    return result;
                } catch (error) {
                    completed++;
                    if (onError) {
                        onError(error, item);
                    }
                    errors.push({ error, item });
                    return null;
                }
            })
        );
    }

    // Process in batches
    for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const batchResults = await processBatch(batch);
        results.push(...batchResults);
    }

    return { results: results.filter(r => r !== null), errors };
}

// ── Smart Rate Limiter ─────────────────────────────────────────────────────

class RateLimiter {
    constructor(options = {}) {
        this.minDelay = options.minDelay || 2000;
        this.maxDelay = options.maxDelay || 5000;
        this.lastRequest = 0;
    }

    async wait() {
        const now = Date.now();
        const elapsed = now - this.lastRequest;

        if (elapsed < this.minDelay) {
            const delay = this.minDelay - elapsed + Math.random() * (this.maxDelay - this.minDelay);
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        this.lastRequest = Date.now();
    }
}

// ── Lead Deduplication ─────────────────────────────────────────────────────

/**
 * Deduplicate leads by domain and email with fuzzy matching
 */
function deduplicateLeads(leads) {
    const seen = new Set();
    const unique = [];

    for (const lead of leads) {
        const normalizedUrl = normalizeUrl(lead.website || '');
        const email = (lead.email || '').toLowerCase().trim();

        // Create multiple keys for deduplication
        const keys = [
            normalizedUrl,
            email,
            normalizedUrl + '|' + email,
        ];

        // Add domain-only key
        if (normalizedUrl) {
            const domain = normalizedUrl.split('/')[0];
            keys.push(domain);
        }

        // Check if any key was seen
        const isDuplicate = keys.some(key => key && seen.has(key));

        if (!isDuplicate) {
            unique.push(lead);
            keys.forEach(key => {
                if (key) seen.add(key);
            });
        }
    }

    return unique;
}

// ── Export ─────────────────────────────────────────────────────────────────

module.exports = {
    // Helpers
    randomDelay,
    randomUserAgent,
    normalizeUrl,
    getDomain,
    cleanUrl,
    isBlockedDomain,

    // Retry & Resilience
    retryWithBackoff,
    CircuitBreaker,
    DomainCache,
    RateLimiter,

    // Processing
    processWithConcurrency,
    deduplicateLeads,
};
