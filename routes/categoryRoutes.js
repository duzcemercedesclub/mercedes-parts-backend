const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { upload, uploadToCloudinary } = require('../config/cloudinary');

// 1. TÜM KATEGORİLERİ LİSTELE (GET)
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM categories ORDER BY id DESC');
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Kategoriler getirilemedi.' });
    }
});

// !!! DÜZELTME: /footer rotası /:id rotasından ÖNCE gelmelidir, yoksa 'footer' kelimesini bir ID zanneder !!!
// FOOTER İÇİN İLK 5 KATEGORİYİ GETİR (GET)
router.get('/footer', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, name FROM categories ORDER BY id ASC LIMIT 5'
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('Footer kategorileri çekilemedi:', error);
        res.status(500).json({ message: 'Kategoriler yüklenirken sunucu hatası oluştu.' });
    }
});

// 2. TEKİL KATEGORİ GETİR (GET)
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM categories WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Kategori bulunamadı.' });
        res.status(200).json(rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
});

// 3. YENİ KATEGORİ EKLE (POST)
router.post('/', upload.single('image'), async (req, res) => {
    const { name } = req.body;

    if (!req.file) {
        return res.status(400).json({ message: 'Lütfen kategori için bir görsel seçin.' });
    }

    try {
        const imageUrl = await uploadToCloudinary(req.file.buffer, 'categories');
        const sql = 'INSERT INTO categories (name, image_url) VALUES (?, ?)';
        const [result] = await db.query(sql, [name, imageUrl]);

        res.status(201).json({ message: 'Kategori başarıyla eklendi.', categoryId: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Kategori eklenirken hata oluştu.' });
    }
});

// 4. KATEGORİ GÜNCELLE (PUT)
router.put('/:id', upload.single('image'), async (req, res) => {
    const { id } = req.params;
    const { name, current_image } = req.body;

    try {
        let imageUrl = current_image;
        if (req.file) {
            imageUrl = await uploadToCloudinary(req.file.buffer, 'categories');
        }

        const sql = 'UPDATE categories SET name = ?, image_url = ? WHERE id = ?';
        await db.query(sql, [name, imageUrl, id]);

        res.status(200).json({ message: 'Kategori başarıyla güncellendi.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Güncelleme esnasında hata oluştu.' });
    }
});

// 5. KATEGORİ SİL (DELETE)
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
        res.status(200).json({ message: 'Kategori başarıyla silindi.' });
    } catch (error) {
        res.status(500).json({ message: 'Silme işlemi başarısız.' });
    }
});

module.exports = router;