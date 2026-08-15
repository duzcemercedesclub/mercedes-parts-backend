const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { upload, uploadToCloudinary } = require('../config/cloudinary');

// 1. TÜM MARKALARI LİSTELE (GET)
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM brands ORDER BY id DESC');
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Markalar getirilemedi.' });
    }
});

// 2. TEKİL MARKA GETİR (GET)
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM brands WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Marka bulunamadı.' });
        res.status(200).json(rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
});

// 3. YENİ MARKA EKLE (POST - Cloudinary Klasörü: brands)
router.post('/', upload.single('image'), async (req, res) => {
    const { name } = req.body;

    if (!req.file) {
        return res.status(400).json({ message: 'Lütfen marka için bir logo seçin.' });
    }

    try {
        // Görsel Cloudinary'de 'brands' klasörüne yükleniyor
        const imageUrl = await uploadToCloudinary(req.file.buffer, 'brands');

        const sql = 'INSERT INTO brands (name, image_url) VALUES (?, ?)';
        const [result] = await db.query(sql, [name, imageUrl]);

        res.status(201).json({ message: 'Marka başarıyla eklendi.', brandId: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Marka eklenirken hata oluştu.' });
    }
});

// 4. MARKA GÜNCELLE (PUT)
router.put('/:id', upload.single('image'), async (req, res) => {
    const { id } = req.params;
    const { name, current_image } = req.body;

    try {
        let imageUrl = current_image;

        if (req.file) {
            // Yeni logo yine 'brands' klasörüne gider
            imageUrl = await uploadToCloudinary(req.file.buffer, 'brands');
        }

        const sql = 'UPDATE brands SET name = ?, image_url = ? WHERE id = ?';
        await db.query(sql, [name, imageUrl, id]);

        res.status(200).json({ message: 'Marka başarıyla güncellendi.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Güncelleme esnasında hata oluştu.' });
    }
});

// 5. MARKA SİL (DELETE)
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM brands WHERE id = ?', [req.params.id]);
        res.status(200).json({ message: 'Marka başarıyla silindi.' });
    } catch (error) {
        res.status(500).json({ message: 'Silme işlemi başarısız.' });
    }
});

module.exports = router;