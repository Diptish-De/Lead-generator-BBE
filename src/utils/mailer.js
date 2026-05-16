const nodemailer = require('nodemailer');

/**
 * Send an email using SMTP
 * @param {Object} config - SMTP configuration (user, pass, host, port)
 * @param {Object} mailOptions - Email options (to, subject, html, text, attachments)
 */
async function sendEmail(config, mailOptions) {
  const transporter = nodemailer.createTransport({
    host: config.host || 'smtp.gmail.com',
    port: config.port || 465,
    secure: config.secure !== undefined ? config.secure : true,
    auth: {
      user: config.email,
      pass: config.password,
    },
    connectionTimeout: 30000, // 30 seconds
    socketTimeout: 45000,    // 45 seconds
  });

  try {
    const { signature, ...restOptions } = mailOptions;
    const finalAttachments = [...(restOptions.attachments || [])];
    let finalHtml = restOptions.html || '';

    if (signature) {
      const signatureCid = 'bbe-sig@bluebloodexports';
      finalAttachments.push({
        filename: 'signature.png',
        content: signature,
        cid: signatureCid
      });
      
      // Inject signature if not already present in HTML
      if (!finalHtml.includes(`cid:${signatureCid}`)) {
        // Convert line breaks to <br> if it looks like plain text
        if (!finalHtml.includes('<br') && !finalHtml.includes('<p')) {
          finalHtml = finalHtml.replace(/\n/g, '<br>');
        }
        finalHtml += `<br><br><img src="cid:${signatureCid}" style="max-width:600px;display:block;" alt="Signature">`;
      }
    }

    // Wrap in a standard container if needed
    if (!finalHtml.startsWith('<div')) {
      finalHtml = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.6;">${finalHtml}</div>`;
    }

    const info = await transporter.sendMail({
      from: `"${config.name || 'BlueBloodExports'}" <${config.email}>`,
      ...restOptions,
      html: finalHtml,
      attachments: finalAttachments
    });
    console.log('Message sent: %s', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

module.exports = { sendEmail };
