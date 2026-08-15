const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { upload, uploadToCloudinary } = require('../config/cloudinary');
const fs = require('fs');
const path = require('path');

// 1. SEO AYARLARINI GETİR (GET)
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM seo_settings WHERE id = 1');
        if (rows.length === 0) {
            return res.status(200).json({
                meta_title: 'Düzce Mercedes Parts',
                meta_description: '',
                meta_keywords: '',
                canonical_url: '',
                og_title: '',
                og_description: '',
                og_image_url: null,
                og_type: 'website',
                google_verification: '',
                google_analytics_id: '',
                robots_txt: 'User-agent: *\nAllow: /\n\nSitemap: https://duzcemercedesparts.com/sitemap.xml'
            });
        }
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error('SEO ayarları getirilemedi:', error);
        res.status(500).json({ message: 'SEO ayarları sunucudan yüklenemedi.' });
    }
});

// 2. SEO AYARLARINI GÜNCELLE VE RESMİ BULUTA YÜKLE (POST)
router.post('/', upload.single('og_image'), async (req, res) => {
    const {
        meta_title,
        meta_description,
        meta_keywords,
        canonical_url,
        og_title,
        og_description,
        og_type,
        google_verification,
        google_analytics_id,
        robots_txt,
        current_og_image
    } = req.body;

    try {
        let ogImageUrl = current_og_image || null;

        // Sosyal medya görseli (Open Graph Image) yüklendiyse Cloudinary'e kaydet
        if (req.file) {
            ogImageUrl = await uploadToCloudinary(req.file.buffer, 'seo');
        }

        const sql = `
            INSERT INTO seo_settings (
                id, meta_title, meta_description, meta_keywords, canonical_url,
                og_title, og_description, og_image_url, og_type,
                google_verification, google_analytics_id, robots_txt
            )
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                meta_title = VALUES(meta_title),
                meta_description = VALUES(meta_description),
                meta_keywords = VALUES(meta_keywords),
                canonical_url = VALUES(canonical_url),
                og_title = VALUES(og_title),
                og_description = VALUES(og_description),
                og_image_url = VALUES(og_image_url),
                og_type = VALUES(og_type),
                google_verification = VALUES(google_verification),
                google_analytics_id = VALUES(google_analytics_id),
                robots_txt = VALUES(robots_txt)
        `;

        await db.query(sql, [
            meta_title,
            meta_description,
            meta_keywords,
            canonical_url,
            og_title,
            og_description,
            ogImageUrl,
            og_type || 'website',
            google_verification,
            google_analytics_id,
            robots_txt
        ]);

        res.status(200).json({ message: 'SEO ve Metatag ayarları başarıyla kaydedildi.', og_image_url: ogImageUrl });
    } catch (error) {
        console.error('SEO ayarları kaydedilemedi:', error);
        res.status(500).json({ message: 'Veritabanı güncellemesi esnasında hata oluştu.' });
    }
});

// 3. DİNAMİK SITEMAP.XML OLUŞTUR (POST /generate-sitemap)
router.post('/generate-sitemap', async (req, res) => {
    try {
        // Dinamik link oluşturmak için canonical_url bilgisini çek
        const [seoRows] = await db.query('SELECT canonical_url FROM seo_settings WHERE id = 1');
        const baseUrl = (seoRows.length > 0 && seoRows[0].canonical_url) 
            ? seoRows[0].canonical_url.replace(/\/$/, "") 
            : "https://duzcemercedesparts.com";

        // Aktif ürünleri veritabanından çek
        let products = [];
        try {
            const [prodRows] = await db.query('SELECT id, slug, updated_at FROM products WHERE is_active = 1');
            products = prodRows;
        } catch (dbErr) {
            console.log("Sitemap için ürün tablosu bulunamadı, boş geçiliyor.");
        }

        // Aktif kategorileri veritabanından çek
        let categories = [];
        try {
            const [catRows] = await db.query('SELECT id, slug FROM categories');
            categories = catRows;
        } catch (catErr) {
            console.log("Sitemap için kategori tablosu bulunamadı.");
        }

        const currentDate = new Date().toISOString().split('T')[0];

        // XML Başlangıç Şablonu
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

        // Sabit Sayfalar (Anasayfa, Mağaza, İletişim vb.)
        const staticPages = [
            { loc: `${baseUrl}/`, priority: '1.0', changefreq: 'daily' },
            { loc: `${baseUrl}/shop`, priority: '0.9', changefreq: 'daily' },
            { loc: `${baseUrl}/contact`, priority: '0.7', changefreq: 'monthly' }
        ];

        staticPages.forEach(page => {
            xml += `  <url>\n`;
            xml += `    <loc>${page.loc}</loc>\n`;
            xml += `    <lastmod>${currentDate}</lastmod>\n`;
            xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
            xml += `    <priority>${page.priority}</priority>\n`;
            xml += `  </url>\n`;
        });

        // Dinamik Kategori Sayfaları
        categories.forEach(category => {
            const catSlug = category.slug || `category-${category.id}`;
            xml += `  <url>\n`;
            xml += `    <loc>${baseUrl}/category/${catSlug}</loc>\n`;
            xml += `    <lastmod>${currentDate}</lastmod>\n`;
            xml += `    <changefreq>weekly</changefreq>\n`;
            xml += `    <priority>0.8</priority>\n`;
            xml += `  </url>\n`;
        });

        // Dinamik Ürün Detay Sayfaları
        products.forEach(product => {
            const productSlug = product.slug || `product-${product.id}`;
            const lastMod = product.updated_at ? new Date(product.updated_at).toISOString().split('T')[0] : currentDate;
            xml += `  <url>\n`;
            xml += `    <loc>${baseUrl}/product/${productSlug}</loc>\n`;
            xml += `    <lastmod>${lastMod}</lastmod>\n`;
            xml += `    <changefreq>weekly</changefreq>\n`;
            xml += `    <priority>0.8</priority>\n`;
            xml += `  </url>\n`;
        });

        xml += `</urlset>`;

        // XML Dosyasını Frontend "public/" klasörüne yazar
        const sitemapPath = path.join(__dirname, '../../frontend/public/sitemap.xml');
        const dir = path.dirname(sitemapPath);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(sitemapPath, xml, 'utf8');

        res.status(200).json({ message: 'sitemap.xml başarıyla oluşturuldu ve güncellendi!' });
    } catch (error) {
        console.error('Sitemap üretilemedi:', error);
        res.status(500).json({ message: `Sitemap üretilirken bir hata oluştu: ${error.message}` });
    }
});

module.exports = router;