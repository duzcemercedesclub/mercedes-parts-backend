const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { upload, uploadToCloudinary } = require('../config/cloudinary');

// 1. LİSTELEME (GET)
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM mega_banners ORDER BY id DESC');
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Banner verileri getirilemedi.' });
    }
});

// 2. TEKİL GETİRME (GET)
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM mega_banners WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Banner bulunamadı.' });
        res.status(200).json(rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
});

// 3. EKLEME (POST) -> 'banners' klasörüne yükleme yapar
router.post('/', upload.single('image'), async (req, res) => {
    const { title, subtitle, discount_text, btn_link } = req.body;

    if (!req.file) {
        return res.status(400).json({ message: 'Lütfen bir banner görseli seçin.' });
    }

    try {
        // İkinci parametre olarak 'banners' gönderildi
        const imageUrl = await uploadToCloudinary(req.file.buffer, 'banners');

        const sql = 'INSERT INTO mega_banners (title, subtitle, discount_text, image_url, btn_link) VALUES (?, ?, ?, ?, ?)';
        const [result] = await db.query(sql, [title, subtitle, discount_text, imageUrl, btn_link || '/shop']);

        res.status(201).json({ message: 'Mega Banner başarıyla eklendi.', bannerId: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Banner eklenirken hata oluştu.' });
    }
});

// 4. GÜNCELLEME (PUT) -> Yeni resim gelirse yine 'banners' klasörüne yükler
router.put('/:id', upload.single('image'), async (req, res) => {
    const { id } = req.params;
    const { title, subtitle, discount_text, btn_link, current_image } = req.body;

    try {
        let imageUrl = current_image;

        if (req.file) {
            // İkinci parametre olarak 'banners' gönderildi
            imageUrl = await uploadToCloudinary(req.file.buffer, 'banners');
        }

        const sql = 'UPDATE mega_banners SET title = ?, subtitle = ?, discount_text = ?, image_url = ?, btn_link = ? WHERE id = ?';
        await db.query(sql, [title, subtitle, discount_text, imageUrl, btn_link, id]);

        res.status(200).json({ message: 'Mega Banner başarıyla güncellendi.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Güncelleme esnasında hata oluştu.' });
    }
});

// 5. SİLME (DELETE)
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM mega_banners WHERE id = ?', [req.params.id]);
        res.status(200).json({ message: 'Banner başarıyla silindi.' });
    } catch (error) {
        res.status(500).json({ message: 'Silme işlemi başarısız.' });
    }
});

module.exports = router;