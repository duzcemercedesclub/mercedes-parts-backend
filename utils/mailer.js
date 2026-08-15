const nodemailer = require('nodemailer');
const db = require('../config/db');

/**
 * Veritabanından en güncel SMTP ayarlarını çekerek Transporter oluşturur.
 */
const createDynamicTransporter = async () => {
    const [rows] = await db.query('SELECT * FROM smtp_settings WHERE id = 1');
    
    if (rows.length === 0 || !rows[0].smtp_host || !rows[0].smtp_user) {
        throw new Error('SMTP ayarları veritabanında yapılandırılmamış.');
    }

    const settings = rows[0];

    const transporter = nodemailer.createTransport({
        host: settings.smtp_host,
        port: parseInt(settings.smtp_port) || 587,
        secure: settings.smtp_secure === 'ssl',
        auth: {
            user: settings.smtp_user,
            pass: settings.smtp_pass
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    return { transporter, settings };
};

/**
 * Site genelinde e-posta gönderimi yapan yardımcı fonksiyon.
 * @param {Object} options 
 * @param {string} options.to - Alıcı e-posta adresi
 * @param {string} options.subject - E-posta konusu
 * @param {string} options.html - HTML İçerik
 * @param {string} [options.replyTo] - Yanıt adresi (İletişim formlarında ziyaretçi adresi için)
 */
const sendEmail = async ({ to, subject, html, replyTo }) => {
    try {
        const { transporter, settings } = await createDynamicTransporter();

        const mailOptions = {
            from: `"${settings.from_name || 'E-Ticaret Sitesi'}" <${settings.from_email || settings.smtp_user}>`,
            to,
            subject,
            html,
            ...(replyTo && { replyTo })
        };

        const info = await transporter.sendMail(mailOptions);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('E-Posta Gönderim Hatası:', error);
        return { success: false, error: error.message };
    }
};

module.exports = { sendEmail };