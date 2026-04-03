/**
 * Outreach Engine - BlueBloodExports
 * Lightweight CRM-like system for managing outreach campaigns
 * 
 * Features:
 * - Multi-email account tracking
 * - Priority-based lead handling  
 * - Auto follow-up scheduling
 * - Clear status + action system
 */

const fs = require('fs');
const path = require('path');

// ── Constants ──────────────────────────────────────────────────────

const STATUS = {
    NEW: 'NEW',
    DRAFTED: 'DRAFTED',
    SENT: 'SENT',
    REPLIED: 'REPLIED',
    FOLLOWUP_SENT: 'FOLLOWUP_SENT',
    NO_REPLY_7D: 'NO_REPLY_7D',
    CLOSED: 'CLOSED'
};

const PRIORITY = {
    HIGH: 'HIGH',
    MEDIUM: 'MEDIUM',
    LOW: 'LOW'
};

const NEXT_ACTION = {
    CREATE_DRAFT: 'Create draft',
    SEND_NOW: 'Send manually',
    WAIT_REPLY: 'Wait / follow-up',
    RESPOND: 'Respond',
    CLOSE_ARCHIVE: 'Close or archive',
    NO_ACTION: 'No action'
};

// ── Email Accounts ───────────────────────────────────────────────────

const EMAIL_ACCOUNTS = [
    { id: 'sales1', name: 'Sales Team', email: 'sales1@BlueBloodExports.com' },
    { id: 'sales2', name: 'Sales Support', email: 'sales2@BlueBloodExports.com' }
];

// ── Email Templates ──────────────────────────────────────────────────

const TEMPLATES = {
    firstEmail: {
        subject: 'Quick idea for your store',
        body: (lead, senderName) => `Hi ${lead.contactName || 'there'},

I came across your ${lead.businessType} and really liked your ${lead.productStyle} aesthetic.

We work with artisans across India creating handcrafted decor, and I feel some of our pieces could align well with your collection.

Would you be open to exploring this?

Best,
${senderName}
BlueBloodExports`
    },

    replyEmail: {
        subject: 'Re: Quick idea for your store',
        body: (lead, senderName) => `Hi ${lead.contactName || 'there'},

Thanks for your response!

I'd love to share a few pieces that match your style. We have options that could fit well.

Do you have any preferences or price range in mind?

Best,
${senderName}`
    },

    followUp1: {
        subject: 'Following up - Quick idea for your store',
        body: (lead, senderName) => `Hi ${lead.contactName || 'there'},

Just wanted to follow up in case you missed my last message.

Happy to share a few ideas if relevant.

Best,
${senderName}`
    },

    followUpFinal: {
        subject: 'One last note - Quick idea for your store',
        body: (lead, senderName) => `Hi ${lead.contactName || 'there'},

Just checking in one last time — totally understand if now's not the right moment.

Happy to reconnect anytime.

Best,
${senderName}`
    }
};

// ── Utility Functions ───────────────────────────────────────────────

/**
 * Calculate priority from lead score
 */
function getPriority(leadScore) {
    if (leadScore >= 4) return PRIORITY.HIGH;
    if (leadScore >= 3) return PRIORITY.MEDIUM;
    return PRIORITY.LOW;
}

/**
 * Assign email account based on priority
 */
function assignEmailAccount(priority, usedAccounts = []) {
    if (priority === PRIORITY.HIGH) {
        return EMAIL_ACCOUNTS[0]; // Always sales1@
    }

    if (priority === PRIORITY.MEDIUM) {
        // Alternate between sales1@ and sales2@
        const used = usedAccounts.filter(a => EMAIL_ACCOUNTS.some(acc => acc.id === a));
        const lastUsed = used[used.length - 1];
        const lastIndex = EMAIL_ACCOUNTS.findIndex(a => a.id === lastUsed);
        const nextIndex = (lastIndex + 1) % EMAIL_ACCOUNTS.length;
        return EMAIL_ACCOUNTS[nextIndex];
    }

    // LOW priority uses sales2@ only
    return EMAIL_ACCOUNTS[1];
}

/**
 * Get next action based on status
 */
function getNextAction(status) {
    switch (status) {
        case STATUS.NEW: return NEXT_ACTION.CREATE_DRAFT;
        case STATUS.DRAFTED: return NEXT_ACTION.SEND_NOW;
        case STATUS.SENT: return NEXT_ACTION.WAIT_REPLY;
        case STATUS.REPLIED: return NEXT_ACTION.RESPOND;
        case STATUS.FOLLOWUP_SENT: return NEXT_ACTION.WAIT_REPLY;
        case STATUS.NO_REPLY_7D: return NEXT_ACTION.CLOSE_ARCHIVE;
        case STATUS.CLOSED: return NEXT_ACTION.NO_ACTION;
        default: return NEXT_ACTION.CREATE_DRAFT;
    }
}

/**
 * Calculate days since a date
 */
function daysSince(dateString) {
    if (!dateString) return Infinity;
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now - date;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Check if follow-up is due (3 days after sent, no follow-up yet)
 */
function isFollowUpDue(lead) {
    if (lead.status !== STATUS.SENT) return false;
    if (lead.lastFollowUpAt) return false; // Already followed up
    return daysSince(lead.sentAt) >= 3;
}

/**
 * Check if final follow-up is due (7 days after sent)
 */
function isFinalFollowUpDue(lead) {
    if (lead.status !== STATUS.FOLLOWUP_SENT) return false;
    return daysSince(lead.sentAt) >= 7;
}

// ── Core Engine Functions ───────────────────────────────────────────

/**
 * Sort leads by priority and score
 */
function sortLeads(leads) {
    const priorityOrder = { [PRIORITY.HIGH]: 0, [PRIORITY.MEDIUM]: 1, [PRIORITY.LOW]: 2 };

    return [...leads].sort((a, b) => {
        // First by priority
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;

        // Then by score (descending)
        return (b.leadScore || 0) - (a.leadScore || 0);
    });
}

/**
 * Initialize outreach data for leads (add missing fields)
 */
function initializeOutreachData(leads) {
    return leads.map(lead => ({
        ...lead,
        priority: getPriority(lead.leadScore),
        status: lead.status || STATUS.NEW,
        assignedEmail: lead.assignedEmail || null,
        sentAt: lead.sentAt || null,
        lastFollowUpAt: lead.lastFollowUpAt || null,
        nextAction: getNextAction(lead.status || STATUS.NEW),
        contactName: lead.contactName || extractName(lead.companyName)
    }));
}

/**
 * Extract a contact name from company name (simple heuristic)
 */
function extractName(companyName) {
    if (!companyName) return 'there';
    // Take first word and capitalize
    return companyName.split(' ')[0].replace(/[^a-zA-Z]/g, '');
}

/**
 * Generate first email draft
 */
function generateFirstDraft(lead, senderAccount) {
    const template = TEMPLATES.firstEmail;
    return {
        to: lead.email,
        from: senderAccount.email,
        subject: template.subject,
        body: template.body(lead, 'BlueBloodExports Team'),
        template: 'firstEmail',
        leadId: lead.companyName
    };
}

/**
 * Generate reply draft
 */
function generateReplyDraft(lead, senderAccount) {
    const template = TEMPLATES.replyEmail;
    return {
        to: lead.email,
        from: senderAccount.email,
        subject: template.subject,
        body: template.body(lead, 'BlueBloodExports Team'),
        template: 'replyEmail',
        leadId: lead.companyName
    };
}

/**
 * Generate follow-up draft
 */
function generateFollowUpDraft(lead, senderAccount, isFinal = false) {
    const template = isFinal ? TEMPLATES.followUpFinal : TEMPLATES.followUp1;
    return {
        to: lead.email,
        from: senderAccount.email,
        subject: template.subject,
        body: template.body(lead, 'BlueBloodExports Team'),
        template: isFinal ? 'followUpFinal' : 'followUp1',
        leadId: lead.companyName
    };
}

/**
 * Process a lead - create draft if needed
 */
function processLead(lead, usedAccounts = []) {
    const actions = [];

    // Assign email account if not assigned
    let assignedAccount = lead.assignedEmail
        ? EMAIL_ACCOUNTS.find(a => a.email === lead.assignedEmail)
        : assignEmailAccount(lead.priority, usedAccounts);

    switch (lead.status) {
        case STATUS.NEW:
            // Generate first draft
            actions.push({
                action: 'CREATE_DRAFT',
                draft: generateFirstDraft({ ...lead, contactName: lead.contactName }, assignedAccount),
                updates: {
                    status: STATUS.DRAFTED,
                    assignedEmail: assignedAccount.email
                }
            });
            break;

        case STATUS.REPLIED:
            // Generate reply draft
            actions.push({
                action: 'RESPOND',
                draft: generateReplyDraft(lead, assignedAccount)
            });
            break;

        case STATUS.SENT:
            if (isFollowUpDue(lead)) {
                // Generate follow-up draft
                actions.push({
                    action: 'FOLLOW_UP',
                    draft: generateFollowUpDraft(lead, assignedAccount),
                    updates: {
                        status: STATUS.FOLLOWUP_SENT,
                        lastFollowUpAt: new Date().toISOString()
                    }
                });
            }
            break;

        case STATUS.FOLLOWUP_SENT:
            if (isFinalFollowUpDue(lead)) {
                // Mark as no reply 7d
                actions.push({
                    action: 'MARK_NO_REPLY',
                    updates: {
                        status: STATUS.NO_REPLY_7D
                    }
                });
            }
            break;
    }

    return actions;
}

/**
 * Get leads that need immediate action
 */
function getActionableLeads(leads) {
    return leads.filter(lead => {
        switch (lead.status) {
            case STATUS.NEW:
            case STATUS.DRAFTED:
            case STATUS.REPLIED:
                return true;
            case STATUS.SENT:
            case STATUS.FOLLOWUP_SENT:
                // Check if follow-up is due
                return lead.status === STATUS.SENT
                    ? isFollowUpDue(lead)
                    : isFinalFollowUpDue(lead);
            default:
                return false;
        }
    });
}

/**
 * Get outreach statistics
 */
function getOutreachStats(leads) {
    const stats = {
        total: leads.length,
        byPriority: { HIGH: 0, MEDIUM: 0, LOW: 0 },
        byStatus: {},
        actionable: 0,
        needsFollowUp: 0,
        emailsPerAccount: {}
    };

    // Initialize counts
    Object.values(STATUS).forEach(s => stats.byStatus[s] = 0);
    EMAIL_ACCOUNTS.forEach(a => stats.emailsPerAccount[a.email] = 0);

    leads.forEach(lead => {
        // Count by priority
        if (stats.byPriority[lead.priority] !== undefined) {
            stats.byPriority[lead.priority]++;
        }

        // Count by status
        if (stats.byStatus[lead.status] !== undefined) {
            stats.byStatus[lead.status]++;
        }

        // Count by email account
        if (lead.assignedEmail && stats.emailsPerAccount[lead.assignedEmail] !== undefined) {
            stats.emailsPerAccount[lead.assignedEmail]++;
        }
    });

    // Count actionable leads
    stats.actionable = getActionableLeads(leads).length;

    // Count leads needing follow-up
    stats.needsFollowUp = leads.filter(l => l.status === STATUS.SENT && isFollowUpDue(l)).length;

    return stats;
}

// ── Export ─────────────────────────────────────────────────────────

module.exports = {
    // Constants
    STATUS,
    PRIORITY,
    NEXT_ACTION,
    EMAIL_ACCOUNTS,

    // Core functions
    sortLeads,
    initializeOutreachData,
    processLead,
    getActionableLeads,
    getOutreachStats,

    // Utility functions
    getPriority,
    assignEmailAccount,
    getNextAction,
    daysSince,
    isFollowUpDue,
    isFinalFollowUpDue,
    generateFirstDraft,
    generateReplyDraft,
    generateFollowUpDraft
};
