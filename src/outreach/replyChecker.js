const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');
const config = require('../config');
const { STATUS } = require('./outreachEngine');

/**
 * Check for replies via IMAP and update CSV
 */
async function checkReplies() {
    const imapConfig = {
        imap: {
            user: process.env.EMAIL_USER,
            password: process.env.EMAIL_PASSWORD,
            host: process.env.EMAIL_IMAP_HOST || 'imap.gmail.com',
            port: parseInt(process.env.EMAIL_IMAP_PORT, 10) || 993,
            tls: true,
            authTimeout: 3000
        }
    };

    if (!imapConfig.imap.user || !imapConfig.imap.password) {
        console.log('⚠️  Email credentials missing, skipping reply check.');
        return [];
    }

    console.log(`🔍 Checking for new replies for ${imapConfig.imap.user}...`);

    try {
        const connection = await imaps.connect(imapConfig);
        await connection.openBox('INBOX');

        // Check for messages in the last 7 days
        const searchCriteria = ['UNSEEN'];
        const fetchOptions = { bodies: ['HEADER', 'TEXT'], struct: true, markSeen: false };

        const messages = await connection.search(searchCriteria, fetchOptions);
        const repliedEmails = new Set();

        for (const message of messages) {
            const all = message.parts.find(p => p.which === 'TEXT');
            const id = message.attributes.uid;
            const idHeader = "Imap-Id: " + id;
            
            const part = message.parts.find(p => p.which === 'HEADER');
            const info = await simpleParser(part.body);
            
            // Extract sender email
            const fromEmail = info.from.value[0].address.toLowerCase();
            repliedEmails.add(fromEmail);
            
            // Mark as seen
            await connection.addFlags(id, '\\Seen');
        }

        connection.end();

        if (repliedEmails.size > 0) {
            console.log(`✉️  Found ${repliedEmails.size} potential replies from: ${Array.from(repliedEmails).join(', ')}`);
            return await updateRepliedLeads(repliedEmails);
        }

        return [];
    } catch (err) {
        console.error('❌ IMAP Error:', err.message);
        return [];
    }
}

/**
 * Update the CSV file for leads that have replied
 */
async function updateRepliedLeads(emails) {
    const csvPath = path.resolve(config.outputFile);
    if (!fs.existsSync(csvPath)) return [];

    const results = [];
    const updatedLeads = [];

    const stream = fs.createReadStream(csvPath).pipe(csv());
    for await (const row of stream) {
        let email = (row.Email || '').toLowerCase();
        if (emails.has(email) && row.Status !== STATUS.REPLIED) {
            row.Status = STATUS.REPLIED;
            row['Last Contacted'] = new Date().toISOString();
            updatedLeads.push(row['Company Name']);
        }
        results.push(row);
    }

    if (updatedLeads.length > 0) {
        const csvWriter = createObjectCsvWriter({
            path: csvPath,
            header: config.csvHeaders.map(h => ({ id: h, title: h })),
            encoding: 'utf8'
        });
        await csvWriter.writeRecords(results);
    }

    return updatedLeads;
}

module.exports = { checkReplies };
