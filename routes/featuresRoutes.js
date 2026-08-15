const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 1. TÜM ÖZELLİKLERİ LİSTELE (GET)
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM features ORDER BY id DESC');
        res.status(200).json(rows);
    } catch (error) {
        console.error('Özellik listesi çekilemedi:', error);
        res.status(500).json({ message: 'Özellik listesi çekilemedi.' });
    }
});

// 2. TEKİL ÖZELLİK GETİR (GET)
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM features WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Özellik bulunamadı.' });
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
});

// 3. YENİ ÖZELLİK EKLE (POST)
router.post('/', async (req, res) => {
    const { icon, title, description } = req.body;

    if (!icon || !title || !description) {
        return res.status(400).json({ message: 'Lütfen tüm alanları doldurun.' });
    }

    try {
        const sql = 'INSERT INTO features (icon, title, description) VALUES (?, ?, ?)';
        const [result] = await db.query(sql, [icon, title, description]);
        res.status(201).json({ message: 'Özellik başarıyla eklendi.', featureId: result.insertId });
    } catch (error) {
        console.error('Özellik eklenirken hata oluştu:', error);
        res.status(500).json({ message: 'Özellik eklenirken hata oluştu.' });
    }
});

// 4. ÖZELLİK GÜNCELLE (PUT)
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { icon, title, description } = req.body;

    if (!icon || !title || !description) {
        return res.status(400).json({ message: 'Lütfen tüm alanları doldurun.' });
    }

    try {
        const sql = 'UPDATE features SET icon = ?, title = ?, description = ? WHERE id = ?';
        await db.query(sql, [icon, title, description, id]);
        res.status(200).json({ message: 'Özellik başarıyla güncellendi.' });
    } catch (error) {
        console.error('Güncelleme esnasında hata oluştu:', error);
        res.status(500).json({ message: 'Güncelleme esnasında hata oluştu.' });
    }
});

// 5. ÖZELLİK SİL (DELETE)
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM features WHERE id = ?', [req.params.id]);
        res.status(200).json({ message: 'Özellik başarıyla silindi.' });
    } catch (error) {
        console.error('Silme işlemi başarısız:', error);
        res.status(500).json({ message: 'Silme işlemi başarısız.' });
    }
});

module.exports = router;