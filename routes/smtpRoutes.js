const express = require('express');
const router = express.Router();
const db = require('../config/db');
const nodemailer = require('nodemailer');

// 1. SMTP AYARLARINI GETİR (GET)
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM smtp_settings WHERE id = 1');
        if (rows.length === 0) {
            return res.status(200).json({
                smtp_host: 'smtp.gmail.com',
                smtp_port: 587,
                smtp_user: '',
                smtp_pass: '',
                smtp_secure: 'tls',
                from_email: '',
                from_name: ''
            });
        }
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error('SMTP ayarları getirilemedi:', error);
        res.status(500).json({ message: 'Veritabanından ayarlar çekilirken hata oluştu.' });
    }
});

// 2. SMTP AYARLARINI KAYDET VEYA GÜNCELLE (POST)
router.post('/', async (req, res) => {
    const { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, from_email, from_name } = req.body;

    try {
        const sql = `
            INSERT INTO smtp_settings (id, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, from_email, from_name, updated_at)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                smtp_host = VALUES(smtp_host),
                smtp_port = VALUES(smtp_port),
                smtp_user = VALUES(smtp_user),
                smtp_pass = VALUES(smtp_pass),
                smtp_secure = VALUES(smtp_secure),
                from_email = VALUES(from_email),
                from_name = VALUES(from_name),
                updated_at = NOW()
        `;

        await db.query(sql, [
            smtp_host || '',
            parseInt(smtp_port) || 587,
            smtp_user || '',
            smtp_pass || '',
            smtp_secure || 'tls',
            from_email || '',
            from_name || ''
        ]);

        res.status(200).json({ message: 'SMTP e-posta ayarları başarıyla kaydedildi.' });
    } catch (error) {
        console.error('SMTP ayarları güncellenirken hata:', error);
        res.status(500).json({ message: 'Ayarlar kaydedilirken bir hata oluştu: ' + error.message });
    }
});

// 3. ANLIK SMTP TEST MAİLİ GÖNDER (POST /test)
router.post('/test', async (req, res) => {
    const { test_email, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, from_email, from_name } = req.body;

    if (!test_email) {
        return res.status(400).json({ message: 'Lütfen test mailinin gönderileceği adresi girin.' });
    }

    const port = parseInt(smtp_port) || 587;
    const isSecure = smtp_secure === 'ssl';

    const transporter = nodemailer.createTransport({
        host: smtp_host,
        port: port,
        secure: isSecure, 
        auth: {
            user: smtp_user,
            pass: smtp_pass
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    const mailOptions = {
        from: `"${from_name || 'Sistem'}" <${from_email || smtp_user}>`,
        to: test_email,
        subject: 'Düzce Mercedes Parts - SMTP Test Mesajı',
        text: 'Bu e-posta SMTP ayarlarınızın başarıyla çalıştığını test etmek amacıyla gönderilmiştir.',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #f8fafc;">
                <h2 style="color: #16a34a; margin-top: 0;">🎉 SMTP Bağlantısı Başarılı!</h2>
                <p>Merhaba,</p>
                <p>Bu mesajı alıyorsanız, <strong>Düzce Mercedes Parts</strong> e-ticaret sitenizin SMTP sunucusu ve kimlik doğrulama yapılandırması sorunsuz çalışıyor demektir.</p>
                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                <p style="font-size: 12px; color: #64748b; line-height: 1.4;">
                    <strong>Sunucu Bilgisi:</strong> ${smtp_host}:${port} (${(smtp_secure || '').toUpperCase()})<br />
                    <strong>Gönderen Kimliği:</strong> ${from_name} &lt;${from_email}&gt;<br />
                    <strong>Tarih:</strong> ${new Date().toLocaleString('tr-TR')}
                </p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: 'Test e-postası başarıyla gönderildi! Gelen kutunuzu veya spam klasörünü kontrol edin.' });
    } catch (error) {
        console.error('SMTP Test Mail Gönderim Hatası:', error);
        res.status(500).json({ message: `Bağlantı Kurulamadı! Hata Açıklaması: ${error.message}` });
    }
});

module.exports = router;