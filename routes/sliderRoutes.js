const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { upload, uploadToCloudinary } = require('../config/cloudinary');

// 1. TÜM SLIDERLARI LİSTELE (GET)
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM sliders ORDER BY id DESC');
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Slider verileri çekilemedi.' });
    }
});

// 2. TEK BİR SLIDER GETİR (GET)
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM sliders WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Slayt bulunamadı.' });
        res.status(200).json(rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
});

// 3. YENİ SLIDER EKLE (POST) -> 'sliders' klasörüne yükleme yapar
router.post('/', upload.single('image'), async (req, res) => {
    const { title, subtitle, discount, btn_link } = req.body;

    if (!req.file) {
        return res.status(400).json({ message: 'Lütfen bir resim dosyası seçin.' });
    }

    try {
        // İkinci parametre olarak 'sliders' gönderildi
        const imageUrl = await uploadToCloudinary(req.file.buffer, 'sliders');

        const sql = 'INSERT INTO sliders (title, subtitle, discount, bg_image, btn_link) VALUES (?, ?, ?, ?, ?)';
        const [result] = await db.query(sql, [title, subtitle, discount, imageUrl, btn_link || '/shop']);

        res.status(201).json({ message: 'Slider başarıyla eklendi.', sliderId: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Slider eklenirken hata oluştu.' });
    }
});

// 4. SLIDER GÜNCELLE (PUT) -> Yeni resim gelirse yine 'sliders' klasörüne yükler
router.put('/:id', upload.single('image'), async (req, res) => {
    const { id } = req.params;
    const { title, subtitle, discount, btn_link, current_image } = req.body;

    try {
        let imageUrl = current_image;

        if (req.file) {
            // İkinci parametre olarak 'sliders' gönderildi
            imageUrl = await uploadToCloudinary(req.file.buffer, 'sliders');
        }

        const sql = 'UPDATE sliders SET title = ?, subtitle = ?, discount = ?, bg_image = ?, btn_link = ? WHERE id = ?';
        await db.query(sql, [title, subtitle, discount, imageUrl, btn_link, id]);

        res.status(200).json({ message: 'Slider başarıyla güncellendi.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Güncelleme esnasında hata oluştu.' });
    }
});

// 5. SLIDER SİL (DELETE)
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM sliders WHERE id = ?', [req.params.id]);
        res.status(200).json({ message: 'Slider başarıyla silindi.' });
    } catch (error) {
        res.status(500).json({ message: 'Silme işlemi başarısız.' });
    }
});

module.exports = router;