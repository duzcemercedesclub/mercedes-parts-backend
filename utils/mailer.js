const nodemailer = require('nodemailer');
const db = require('../config/db');
const dns = require('dns');

// Node.js'in DNS sorgularında IPv4'ü öncelikli kılmasını sağlıyoruz (IPv6 ENETUNREACH hatasını çözer)
dns.setDefaultResultOrder('ipv4first');

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
        host: settings.smtp_host || 'smtp.gmail.com',
        port: parseInt(settings.smtp_port) || 587,
        secure: settings.smtp_port == 465,
        family: 4, // Sadece IPv4 IP adreslerini kullanmasını zorunlu kılıyoruz
        auth: {
            user: settings.smtp_user,
            pass: settings.smtp_pass
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