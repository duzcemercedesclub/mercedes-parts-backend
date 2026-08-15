const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 1. TÜM SOSYAL MEDYALARI GETİR (Admin Listeleme Alanı İçin)
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM social_links ORDER BY id ASC');
        res.status(200).json(rows);
    } catch (error) {
        console.error('Sosyal medya linkleri getirilemedi:', error);
        res.status(500).json({ message: 'Veritabanı hatası oluştu.' });
    }
});

// 2. SADECE AKTİF SOSYAL MEDYALARI GETİR (Kullanıcı Header Alanı İçin)
router.get('/active', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM social_links WHERE is_active = 1 ORDER BY id ASC');
        res.status(200).json(rows);
    } catch (error) {
        console.error('Aktif sosyal medya linkleri getirilemedi:', error);
        res.status(500).json({ message: 'Veritabanı hatası oluştu.' });
    }
});

// 3. YENİ SOSYAL MEDYA EKLE (Ekleme Modalı)
router.post('/', async (req, res) => {
    const { platform_name, icon, url, is_active } = req.body;

    if (!platform_name || !icon || !url) {
        return res.status(400).json({ message: 'Lütfen tüm alanları doldurun.' });
    }

    try {
        const sql = 'INSERT INTO social_links (platform_name, icon, url, is_active) VALUES (?, ?, ?, ?)';
        const [result] = await db.query(sql, [platform_name, icon, url, is_active ? 1 : 0]);
        res.status(201).json({ message: 'Sosyal medya başarıyla eklendi.', id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Sosyal medya eklenirken hata oluştu.' });
    }
});

// 4. SOSYAL MEDYA BİLGİLERİNİ GÜNCELLE (Düzenleme Modalı)
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { platform_name, icon, url, is_active } = req.body;

    if (!platform_name || !icon || !url) {
        return res.status(400).json({ message: 'Lütfen tüm alanları doldurun.' });
    }

    try {
        const sql = 'UPDATE social_links SET platform_name = ?, icon = ?, url = ?, is_active = ? WHERE id = ?';
        await db.query(sql, [platform_name, icon, url, is_active ? 1 : 0, id]);
        res.status(200).json({ message: 'Sosyal medya başarıyla güncellendi.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Sosyal medya güncellenirken hata oluştu.' });
    }
});

// 5. TEK BİR TIKLA AKTİF/PASİF (AÇ/KAPAT) DURUMUNU DEĞİŞTİR (Switch Event)
router.patch('/:id/toggle', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query('SELECT is_active FROM social_links WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Kayıt bulunamadı.' });
        }

        const newStatus = rows[0].is_active === 1 ? 0 : 1;
        await db.query('UPDATE social_links SET is_active = ? WHERE id = ?', [newStatus, id]);
        res.status(200).json({ message: 'Durum başarıyla güncellendi.', is_active: newStatus });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Durum değiştirilemedi.' });
    }
});

// 6. SOSYAL MEDYA SİL (Silme İşlemi)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM social_links WHERE id = ?', [id]);
        res.status(200).json({ message: 'Sosyal medya başarıyla silindi.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Sosyal medya silinirken hata oluştu.' });
    }
});

module.exports = router;