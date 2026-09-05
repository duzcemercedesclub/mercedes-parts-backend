const nodemailer = require('nodemailer');
const db = require('../config/db');
const dns = require('dns');

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
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // Port 587 için false olmalıdır
        auth: {
            user: settings.smtp_user,
            pass: settings.smtp_pass // 16 Haneli Google Uygulama Şifresi
        },
        // 🚨 KESİN ÇÖZÜM: DNS sorgusunu doğrudan IPv4 (family: 4) adrese zorluyoruz
        lookup: (hostname, options, callback) => {
            dns.lookup(hostname, { family: 4 }, callback);
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
        tls: {
            rejectUnauthorized: false
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