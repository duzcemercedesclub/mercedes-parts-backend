const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Türkçe karakterleri İngilizce karakterlere çevirip SEO uyumlu URL yapan yardımcı fonksiyon
const slugify = (text) => {
    const trMap = { 'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U', 'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O' };
    for (let key in trMap) {
        text = text.replace(new RegExp(key, 'g'), trMap[key]);
    }
    return text.toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
};

// 1. TÜM SAYFALARI LİSTELE (GET) - content Kolonu Eklendi
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, title, slug, content, is_active, created_at FROM static_pages ORDER BY id DESC');
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Sayfalar getirilemedi.' });
    }
});

// 2. TEKİL SAYFA GETİR (GET)
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM static_pages WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Sayfa bulunamadı.' });
        res.status(200).json(rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
});

// 3. YENİ SAYFA EKLE (POST)
router.post('/', async (req, res) => {
    const { title, content, is_active } = req.body;
    const slug = slugify(title);

    try {
        const sql = 'INSERT INTO static_pages (title, slug, content, is_active) VALUES (?, ?, ?, ?)';
        const [result] = await db.query(sql, [title, slug, content, is_active ? 1 : 0]);
        res.status(201).json({ message: 'Sayfa başarıyla oluşturuldu.', pageId: result.insertId });
    } catch (error) {
        console.error(error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Bu isimde veya linkte bir sayfa zaten mevcut.' });
        }
        res.status(500).json({ message: 'Sayfa oluşturulurken bir hata meydana geldi.' });
    }
});

// 4. SAYFA GÜNCELLE (PUT)
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { title, content, is_active } = req.body;
    const slug = slugify(title);

    try {
        const sql = 'UPDATE static_pages SET title = ?, slug = ?, content = ?, is_active = ? WHERE id = ?';
        await db.query(sql, [title, slug, content, is_active ? 1 : 0, id]);
        res.status(200).json({ message: 'Sayfa başarıyla güncellendi.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Güncelleme esnasında hata oluştu.' });
    }
});

// 5. SAYFA SİL (DELETE)
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM static_pages WHERE id = ?', [req.params.id]);
        res.status(200).json({ message: 'Sayfa başarıyla silindi.' });
    } catch (error) {
        res.status(500).json({ message: 'Silme işlemi başarısız.' });
    }
});

module.exports = router;