const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { upload, uploadToCloudinary } = require('../config/cloudinary');

// 1. AYARLARI GETİR (GET - Liste/Oku)
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM site_settings WHERE id = 1');
        if (rows.length === 0) {
            // Eğer veri yoksa varsayılanı döndür
            return res.status(200).json({
                logo_text_small: 'DUZCE',
                logo_text_large: 'MERCEDESCLUB',
                use_image_logo: 0,
                promo_text: '100 TL ve üzeri siparişlerde kargo bedava!',
                currency: 'TL ₺',
                show_facebook: 1,
                facebook_url: '#',
                show_instagram: 1,
                instagram_url: '#'
            });
        }
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error('Ayarlar yüklenemedi:', error);
        res.status(500).json({ message: 'Sistem ayarları getirilemedi.' });
    }
});

// 2. AYARLARI GÜNCELLE / EKLE (POST/PUT)
router.post('/', upload.single('image'), async (req, res) => {
    const {
        title,
        logo_text_small,
        logo_text_large,
        use_image_logo,
        promo_text,
        currency,
        show_facebook,
        facebook_url,
        show_instagram,
        instagram_url,
        show_twitter,
        twitter_url,
        current_image
    } = req.body;

    try {
        let logoUrl = current_image || null;

        // Eğer yeni bir logo resmi yüklenmişse Cloudinary'e yükle
        if (req.file) {
            logoUrl = await uploadToCloudinary(req.file.buffer, 'settings');
        }

        const sql = `
            INSERT INTO site_settings (
                id, title, logo_url, logo_text_small, logo_text_large, use_image_logo, 
                promo_text, currency, show_facebook, facebook_url, show_instagram, 
                instagram_url, show_twitter, twitter_url
            ) 
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                title = VALUES(title),
                logo_url = VALUES(logo_url),
                logo_text_small = VALUES(logo_text_small),
                logo_text_large = VALUES(logo_text_large),
                use_image_logo = VALUES(use_image_logo),
                promo_text = VALUES(promo_text),
                currency = VALUES(currency),
                show_facebook = VALUES(show_facebook),
                facebook_url = VALUES(facebook_url),
                show_instagram = VALUES(show_instagram),
                instagram_url = VALUES(instagram_url),
                show_twitter = VALUES(show_twitter),
                twitter_url = VALUES(twitter_url)
        `;

        await db.query(sql, [
            title || 'DuzceMercedesParts',
            logoUrl,
            logo_text_small || 'DUZCE',
            logo_text_large || 'MERCEDESCLUB',
            use_image_logo === 'true' || use_image_logo === '1' ? 1 : 0,
            promo_text || '100 TL ve üzeri siparişlerde kargo bedava!',
            currency || 'TL ₺',
            show_facebook === 'true' || show_facebook === '1' ? 1 : 0,
            facebook_url || '#',
            show_instagram === 'true' || show_instagram === '1' ? 1 : 0,
            instagram_url || '#',
            show_twitter === 'true' || show_twitter === '1' ? 1 : 0,
            twitter_url || '#'
        ]);

        res.status(200).json({ message: 'Sistem ayarları başarıyla güncellendi.', logo_url: logoUrl });
    } catch (error) {
        console.error('Ayarlar güncellenirken hata:', error);
        res.status(500).json({ message: 'Ayarlar kaydedilirken bir hata oluştu.' });
    }
});

// 3. AYARLARI SIFIRLA / VARSAYILAN YAP (DELETE)
router.delete('/reset', async (req, res) => {
    try {
        await db.query('DELETE FROM site_settings WHERE id = 1');
        res.status(200).json({ message: 'Ayarlar başarıyla fabrika ayarlarına sıfırlandı.' });
    } catch (error) {
        res.status(500).json({ message: 'Sıfırlama işlemi başarısız.' });
    }
});

module.exports = router;