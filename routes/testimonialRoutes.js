const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const db = require('../config/db'); // Kendi db bağlantı dosyanızın yolu

// Cloudinary Yapılandırması (Eğer ana dosyada yapmadıysanız)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer Bellek Depolama Ayarı
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// 1. TÜMÜNÜ GETİR
router.get('/', (req, res) => {
  const sql = 'SELECT * FROM testimonials ORDER BY created_at DESC';
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ message: 'Veriler getirilemedi.', error: err });
    res.json(results);
  });
});

// 2. YENİ TESTIMONIAL EKLE
router.post('/', upload.single('image'), async (req, res) => {
  const { name, company, role, comment, is_active } = req.body;
  let image_url = '';

  try {
    if (req.file) {
      // Dosyayı doğrudan Cloudinary'de mercedes_parts/testimonials klasörüne yükleme
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'mercedes_parts/testimonials' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(req.file.buffer);
      });
      image_url = uploadResult.secure_url;
    }

    const sql = 'INSERT INTO testimonials (name, company, role, comment, image_url, is_active) VALUES (?, ?, ?, ?, ?, ?)';
    db.query(sql, [name, company, role, comment, image_url, is_active === '1' ? 1 : 0], (err, result) => {
      if (err) return res.status(500).json({ message: 'Veritabanına kaydedilemedi.', error: err });
      res.status(201).json({ message: 'Yorum başarıyla eklendi.' });
    });

  } catch (error) {
    res.status(500).json({ message: 'Cloudinary yükleme hatası.', error });
  }
});

// 3. GÜNCELLE
router.put('/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, company, role, comment, is_active, current_image } = req.body;
  let image_url = current_image;

  try {
    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'mercedes_parts/testimonials' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(req.file.buffer);
      });
      image_url = uploadResult.secure_url;
    }

    const sql = 'UPDATE testimonials SET name = ?, company = ?, role = ?, comment = ?, image_url = ?, is_active = ? WHERE id = ?';
    db.query(sql, [name, company, role, comment, image_url, is_active === '1' ? 1 : 0, id], (err, result) => {
      if (err) return res.status(500).json({ message: 'Güncelleme başarısız.', error: err });
      res.json({ message: 'Yorum başarıyla güncellendi.' });
    });

  } catch (error) {
    res.status(500).json({ message: 'Görsel güncellenirken hata oluştu.', error });
  }
});

// 4. SİL
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const sql = 'DELETE FROM testimonials WHERE id = ?';
  db.query(sql, [id], (err, result) => {
    if (err) return res.status(500).json({ message: 'Silme işlemi başarısız.', error: err });
    res.json({ message: 'Yorum sistemden kaldırıldı.' });
  });
});

module.exports = router;