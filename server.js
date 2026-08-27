const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./config/db');
const fs = require('fs');
const path = require('path');

// Rotaların Import Edilmesi
const productRoutes = require('./routes/productRoutes');
const authRoutes = require('./routes/authRoutes');
const megaBannerRoutes = require('./routes/megaBannerRoutes');
const sliderRoutes = require('./routes/sliderRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const pageRoutes = require('./routes/pageRoutes');
const brandRoutes = require('./routes/brandRoutes');
const userRoutes = require('./routes/userRoutes');
const featuresRoutes = require('./routes/featuresRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const seoRoutes = require('./routes/seoRoutes');
const footerRoutes = require('./routes/footerRoutes');
const adminManagementRoutes = require('./routes/adminManagementRoutes');
const smtpRoutes = require('./routes/smtpRoutes');
const socialRoutes = require('./routes/socialRoutes');
const testimonialRoutes = require('./routes/testimonialRoutes');
const contactRoutes = require('./routes/contactRoutes');

// Kullanıcı Etkinlik/Sipariş Rotaları
const userActivityRoutes = require('./routes/userActivity');

// Kupon Rotalarını İçe Aktarın
const couponRoutes = require('./routes/couponRoutes');
// Veritabanı Tabanlı Sipariş ve Ödeme Rotaları
const ordersRouter = require('./routes/orders');
const checkoutRoutes = require('./routes/checkoutRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// SUNUCUYU UYANIK TUTMA (HEALTH CHECK) ROTASI
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Sunucu uyanik!' });
});

// CANLI SITEMAP VE ROBOTS.TXT CANLI SUNUCU SERVİS ROTALARI
app.get('/sitemap.xml', (req, res) => {
    const sitemapPath = path.join(__dirname, '../frontend/public/sitemap.xml');
    if (fs.existsSync(sitemapPath)) {
        res.header('Content-Type', 'application/xml');
        return res.sendFile(sitemapPath);
    }
    res.status(404).send('sitemap.xml henüz oluşturulmadı. Lütfen Admin panelinden oluşturun.');
});

app.get('/robots.txt', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT robots_txt FROM seo_settings WHERE id = 1');
        res.header('Content-Type', 'text/plain');
        if (rows.length > 0 && rows[0].robots_txt) {
            return res.send(rows[0].robots_txt);
        }
        res.send("User-agent: *\nAllow: /\n\nSitemap: https://duzcemercedesparts.com/sitemap.xml");
    } catch (err) {
        res.header('Content-Type', 'text/plain');
        res.send("User-agent: *\nAllow: /");
    }
});

// API Rotalarının Bağlanması
app.use('/api/products', productRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/mega-banners', megaBannerRoutes);
app.use('/api/sliders', sliderRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/pages', pageRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/users', userRoutes);
app.use('/api/user', userActivityRoutes);
app.use('/api/features', featuresRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/seo-settings', seoRoutes);
app.use('/api/footer', footerRoutes);
app.use('/api/smtp-settings', smtpRoutes);
app.use('/api/social-links', socialRoutes);
app.use('/api/testimonials', testimonialRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/coupons', couponRoutes);

// Sipariş ve Ödeme Rotaları
app.use('/api/checkout', checkoutRoutes);
app.use('/api/orders', ordersRouter);
app.use('/api/admin/orders', ordersRouter);
app.use('/api/admin', adminManagementRoutes);

// Kök Test Rotası
app.get('/', (req, res) => {
    res.send('Mercedes Parts API - Sunucu Aktif ve Çalışıyor!');
});

// Başlatma
app.listen(PORT, () => {
    console.log(`\n=========================================`);
    console.log(`🚀 Sunucu http://localhost:${PORT} adresinde ayaklandı.`);
    console.log(`=========================================`);
});