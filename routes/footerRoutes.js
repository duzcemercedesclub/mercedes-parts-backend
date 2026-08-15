const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 1. FOOTER AYARLARINI GETİR (GET)
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM footer_settings WHERE id = 1');
        if (rows.length === 0) {
            return res.status(200).json({
                about_text: 'Yedek parça dünyası.',
                contact_hours: '7/24 Müşteri Hizmetleri',
                contact_phone: '',
                contact_email: '',
                copyright_text: 'Tüm Hakları Saklıdır.',
                show_visa: 1,
                show_mastercard: 1,
                show_maestro: 1,
                show_troy: 1,
                show_amex: 1
            });
        }
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error('Footer ayarları getirilemedi:', error);
        res.status(500).json({ message: 'Veritabanı bağlantı hatası.' });
    }
});

// 2. FOOTER AYARLARINI GÜNCELLE (POST)
router.post('/', async (req, res) => {
    const {
        about_text,
        contact_hours,
        contact_phone,
        contact_email,
        copyright_text,
        show_visa,
        show_mastercard,
        show_maestro,
        show_troy,
        show_amex
    } = req.body;

    try {
        const sql = `
            INSERT INTO footer_settings (
                id, about_text, contact_hours, contact_phone, contact_email, copyright_text,
                show_visa, show_mastercard, show_maestro, show_troy, show_amex
            )
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                about_text = VALUES(about_text),
                contact_hours = VALUES(contact_hours),
                contact_phone = VALUES(contact_phone),
                contact_email = VALUES(contact_email),
                copyright_text = VALUES(copyright_text),
                show_visa = VALUES(show_visa),
                show_mastercard = VALUES(show_mastercard),
                show_maestro = VALUES(show_maestro),
                show_troy = VALUES(show_troy),
                show_amex = VALUES(show_amex)
        `;

        await db.query(sql, [
            about_text,
            contact_hours,
            contact_phone,
            contact_email,
            copyright_text,
            show_visa ? 1 : 0,
            show_mastercard ? 1 : 0,
            show_maestro ? 1 : 0,
            show_troy ? 1 : 0,
            show_amex ? 1 : 0
        ]);

        res.status(200).json({ message: 'Footer ve Ödeme Seçenekleri başarıyla güncellendi.' });
    } catch (error) {
        console.error('Footer güncellenirken hata:', error);
        res.status(500).json({ message: 'Ayarlar kaydedilemedi.' });
    }
});

module.exports = router;