const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { sendEmail } = require('../utils/mailer');

// ==========================================
// PUBLIC (ZİYARETÇİ) ROTALARI
// ==========================================

// 1. İletişim Sayfası Bilgilerini Getir (Adres, Tel, Harita, Başlık ve Açıklama)
router.get('/settings', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM contact_settings WHERE id = 1');
        if (rows.length === 0) {
            return res.json({
                info_title: 'Bizimle İletişime Geçin',
                info_description: 'Yedek parça sorgulamaları, sipariş durumları veya genel sorularınız için aşağıdaki kanallardan bize ulaşabilir ya da iletişim formunu doldurabilirsiniz.',
                address: '',
                phone: '',
                email: '',
                working_hours: '',
                map_url: ''
            });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('İletişim ayarları çekilemedi:', error);
        res.status(500).json({ message: 'İletişim bilgileri alınırken hata oluştu.' });
    }
});

// 2. İletişim Formunu Gönder (Veritabanına Kaydet & SMTP İle Mail At)
router.post('/send-message', async (req, res) => {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ message: 'Lütfen zorunlu alanları doldurun (Ad, E-posta, Mesaj).' });
    }

    try {
        // A. Veritabanına Kaydet
        const sqlInsert = `
            INSERT INTO contact_messages (name, email, phone, subject, message, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'Okunmadı', NOW())
        `;
        await db.query(sqlInsert, [name, email, phone || '', subject || 'Genel İletişim', message]);

        // B. SMTP Ayarlarından Admin E-Posta Adresini Al
        const [smtpRows] = await db.query('SELECT from_email, smtp_user FROM smtp_settings WHERE id = 1');
        const adminEmail = smtpRows[0]?.from_email || smtpRows[0]?.smtp_user;

        if (adminEmail) {
            const emailHtml = `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                    <h2 style="color: #1a365d;">Siteden Yeni İletişim Mesajı Geldi</h2>
                    <hr />
                    <p><strong>Gönderen Ad Soyad:</strong> ${name}</p>
                    <p><strong>E-Posta:</strong> <a href="mailto:${email}">${email}</a></p>
                    <p><strong>Telefon:</strong> ${phone || 'Belirtilmedi'}</p>
                    <p><strong>Konu:</strong> ${subject || 'İletişim Formu'}</p>
                    <hr />
                    <p><strong>Mesaj İçeriği:</strong></p>
                    <div style="background-color: #f7fafc; padding: 15px; border-left: 4px solid #3182ce; border-radius: 4px;">
                        ${message.replace(/\n/g, '<br/>')}
                    </div>
                </div>
            `;

            // SMTP Üzerinden Admin'e Mail Gönder (replyTo: Müşterinin E-postası)
            await sendEmail({
                to: adminEmail,
                subject: `[İletişim Formu] ${subject || name}`,
                html: emailHtml,
                replyTo: email
            });
        }

        res.status(200).json({ message: 'Mesajınız başarıyla alındı ve iletildi.' });

    } catch (err) {
        console.error('İletişim formu gönderme hatası:', err);
        res.status(500).json({ message: 'Mesaj gönderilirken sunucu hatası oluştu: ' + err.message });
    }
});

// ==========================================
// ADMIN PANELİ ROTALARI
// ==========================================

// 3. Admin: Gelen Tüm Mesajları Listele
router.get('/admin/messages', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        console.error('Mesajlar listelenemedi:', error);
        res.status(500).json({ message: 'Mesajlar çekilirken bir hata oluştu.' });
    }
});

// 4. Admin: Mesaj Okundu / Okunmadı Durumunu Güncelle
router.put('/admin/messages/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
        await db.query('UPDATE contact_messages SET status = ? WHERE id = ?', [status, id]);
        res.json({ message: 'Mesaj durumu güncellendi.' });
    } catch (error) {
        res.status(500).json({ message: 'Durum güncellenirken hata oluştu.' });
    }
});

// 5. Admin: Müşteriye Yanıt E-postası Gönder
router.post('/admin/messages/:id/reply', async (req, res) => {
    const { id } = req.params;
    const { replyMessage, customerEmail, subject } = req.body;

    if (!replyMessage) {
        return res.status(400).json({ message: 'Lütfen bir yanıt mesajı yazınız.' });
    }

    try {
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                <h3 style="color: #2b4c7e;">Sayın Müşterimiz,</h3>
                <p>Web sitemiz üzerinden iletmiş olduğunuz iletişim mesajınız yanıtlanmıştır:</p>
                <div style="background-color: #f0f4f8; padding: 15px; border-radius: 6px; margin: 15px 0; color: #333;">
                    ${replyMessage.replace(/\n/g, '<br/>')}
                </div>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="font-size: 12px; color: #777;">Bu e-posta otomatik olarak gönderilmiştir. İhtiyaç halinde bu mesaja yanıt verebilirsiniz.</p>
            </div>
        `;

        const mailResult = await sendEmail({
            to: customerEmail,
            subject: `Re: ${subject || 'İletişim Talebiniz Hakkında'}`,
            html: emailHtml
        });

        if (mailResult.success) {
            await db.query(
                'UPDATE contact_messages SET status = "Cevaplandı", admin_reply = ?, replied_at = NOW() WHERE id = ?',
                [replyMessage, id]
            );
            res.json({ message: 'Yanıt e-postası müşteriye başarıyla gönderildi.' });
        } else {
            res.status(500).json({ message: 'E-posta gönderilemedi: ' + mailResult.error });
        }
    } catch (error) {
        console.error('Yanıt gönderme hatası:', error);
        res.status(500).json({ message: 'Yanıt gönderilirken hata oluştu.' });
    }
});

// 6. Admin: Mesajı Sil
router.delete('/admin/messages/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM contact_messages WHERE id = ?', [id]);
        res.json({ message: 'Mesaj başarıyla silindi.' });
    } catch (error) {
        res.status(500).json({ message: 'Silme işlemi başarısız.' });
    }
});

// 7. Admin: İletişim Ayarlarını Güncelle (Adres, Tel, Başlık, Açıklama vb.)
router.put('/admin/settings', async (req, res) => {
    const { info_title, info_description, address, phone, email, working_hours, map_url } = req.body;

    try {
        const sql = `
            INSERT INTO contact_settings (id, info_title, info_description, address, phone, email, working_hours, map_url, updated_at)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                info_title = VALUES(info_title),
                info_description = VALUES(info_description),
                address = VALUES(address),
                phone = VALUES(phone),
                email = VALUES(email),
                working_hours = VALUES(working_hours),
                map_url = VALUES(map_url),
                updated_at = NOW()
        `;

        await db.query(sql, [
            info_title || 'Bizimle İletişime Geçin',
            info_description || '',
            address || '',
            phone || '',
            email || '',
            working_hours || '',
            map_url || ''
        ]);
        res.json({ message: 'İletişim ve Harita bilgileri başarıyla güncellendi.' });
    } catch (error) {
        console.error('İletişim ayarları güncellenirken hata:', error);
        res.status(500).json({ message: 'Ayarlar güncellenirken hata oluştu.' });
    }
});

module.exports = router;