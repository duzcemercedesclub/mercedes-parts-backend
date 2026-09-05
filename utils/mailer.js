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
        secure: settings.smtp_port == 465, // Port 465 ise true, 587 ise false
        auth: {
            user: settings.smtp_user,
            pass: settings.smtp_pass
        },
        // Render gibi bulut sunucularında SMTP zaman aşımını ve TLS bloklarını önleme ayarları
        connectionTimeout: 10000, // 10 Saniye
        greetingTimeout: 10000,
        socketTimeout: 10000,
        tls: {
            rejectUnauthorized: false,
            ciphers: 'SSLv3'
        }
    });

    return { transporter, settings };
};

/**
 * E-posta gönderim fonksiyonu
 */
const sendEmail = async ({ to, subject, html, replyTo }) => {
    try {
        const { transporter, settings } = await createDynamicTransporter();

        const mailOptions = {
            from: `"${settings.from_name || 'Düzce Mercedes Parts'}" <${settings.from_email || settings.smtp_user}>`,
            to,
            subject,
            html,
            ...(replyTo && { replyTo })
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('✅ E-Posta Başarıyla Gönderildi | MessageID:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ E-Posta Gönderim Hatası (Render/SMTP):', error.message);
        return { success: false, error: error.message };
    }
};

module.exports = { sendEmail };