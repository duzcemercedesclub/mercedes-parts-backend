const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { sendEmail } = require('../utils/mailer');

// Şifre sıfırlama kodları için tabloyu otomatik oluştur
const createPasswordResetsTable = async () => {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS password_resets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                code VARCHAR(10) NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    } catch (err) {
        console.error('password_resets tablosu oluşturulurken hata:', err);
    }
};
createPasswordResetsTable();

// 1. KULLANICI KAYIT ENDPOINT'I
router.post('/register', async (req, res) => {
    const { 
        name, surname, email, phone_code, phone, password, gender, is_terms_accepted, is_marketing_accepted 
    } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Lütfen zorunlu alanları doldurun.' });
    }

    if (!is_terms_accepted) {
        return res.status(400).json({ message: 'Üyelik Sözleşmesini kabul etmelisiniz.' });
    }

    const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,15}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({ message: 'Şifreniz belirtilen kurallara uymamaktadır.' });
    }

    try {
        const [existingEmail] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existingEmail.length > 0) {
            return res.status(400).json({ message: 'Bu e-posta adresi zaten kayıtlı.' });
        }

        if (phone) {
            const [existingPhone] = await db.query('SELECT id FROM users WHERE phone = ?', [phone]);
            if (existingPhone.length > 0) {
                return res.status(400).json({ message: 'Bu telefon numarası zaten kayıtlı.' });
            }
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const sql = `
            INSERT INTO users 
            (name, surname, email, phone_code, phone, password, gender, role, is_marketing_accepted) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await db.query(sql, [
            name, surname || null, email, phone_code || '+90', phone || null, hashedPassword, gender || 'unspecified', 'user', is_marketing_accepted ? 1 : 0
        ]);

        res.status(201).json({ message: 'Kullanıcı kaydı başarıyla oluşturuldu.', userId: result.insertId });
    } catch (error) {
        console.error('Kayıt hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası, kayıt yapılamadı.' });
    }
});

// 2. KULLANICI GİRİŞ ENDPOINT'I
router.post('/login', async (req, res) => {
    const { identifier, password, rememberMe } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ message: 'Lütfen e-posta / telefon ve şifrenizi girin.' });
    }

    try {
        const [rows] = await db.query('SELECT * FROM users WHERE email = ? OR phone = ?', [identifier, identifier]);
        if (rows.length === 0) {
            return res.status(400).json({ message: 'Geçersiz e-posta / telefon veya şifre.' });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Geçersiz e-posta / telefon veya şifre.' });
        }

        const expiresIn = rememberMe ? '30d' : '1d';
        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET || 'secretkey',
            { expiresIn }
        );

        res.status(200).json({
            message: 'Giriş başarılı!',
            token,
            user: { id: user.id, name: user.name, surname: user.surname, email: user.email, phone: user.phone, role: user.role }
        });
    } catch (error) {
        console.error('Giriş hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası, giriş yapılamadı.' });
    }
});

// 3. ŞİFREMİ UNUTTUM - E-POSTAYA KOD GÖNDERME ENDPOINT'I
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: 'Lütfen e-posta adresinizi girin.' });
    }

    try {
        const [users] = await db.query('SELECT id, name FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ message: 'Bu e-posta adresine ait kayıtlı kullanıcı bulunamadı.' });
        }

        const user = users[0];
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 Dk geçerli

        await db.query('DELETE FROM password_resets WHERE email = ?', [email]);
        await db.query(
            'INSERT INTO password_resets (email, code, expires_at) VALUES (?, ?, ?)',
            [email, code, expiresAt]
        );

        // Kullanıcıya anında onay dön
        res.status(200).json({ message: 'Doğrulama kodu e-posta adresinize gönderildi.' });

        // Arka Planda Mail Gönder
        (async () => {
            try {
                const emailHtml = `
                    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
                        <h2 style="color: #0f172a; text-align: center; margin-top: 0;">Şifre Sıfırlama Kodu</h2>
                        <p style="color: #334155; font-size: 15px;">Merhaba <strong>${user.name}</strong>,</p>
                        <p style="color: #475569; font-size: 14px; line-height: 1.5;">
                            Düzce Mercedes Parts hesabınızın şifresini yenilemek için talepte bulundunuz. Aşağıdaki doğrulama kodunu ekrandaki alana giriniz:
                        </p>
                        <div style="text-align: center; margin: 25px 0;">
                            <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #38bdf8; background: #0f172a; padding: 12px 24px; border-radius: 8px; display: inline-block;">
                                ${code}
                            </span>
                        </div>
                        <p style="font-size: 12px; color: #94a3b8; text-align: center;">
                            Bu doğrulama kodu <strong>15 dakika</strong> boyunca geçerlidir.
                        </p>
                    </div>
                `;

                const mailRes = await sendEmail({
                    to: email,
                    subject: 'Düzce Mercedes Parts - Şifre Sıfırlama Kodu',
                    html: emailHtml
                });

                if(!mailRes.success) {
                   console.error('❌ Mail gönderilemedi, detay:', mailRes.error);
                }
            } catch (mailErr) {
                console.error('Arka plan e-posta gönderim hatası:', mailErr);
            }
        })();

    } catch (error) {
        console.error('Şifre sıfırlama kodu oluşturma hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası, kod oluşturulamadı.' });
    }
});

// 4. ŞİFREMİ UNUTTUM - KODU DOĞRULA VE ŞİFREYİ GÜNCELLE
router.post('/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
        return res.status(400).json({ message: 'Lütfen tüm alanları doldurun.' });
    }

    const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,15}$/;
    if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({ 
            message: 'Yeni şifreniz 8-15 karakter uzunluğunda olmalı, en az 1 büyük harf, 1 küçük harf ve 1 rakam içermelidir.' 
        });
    }

    try {
        const [rows] = await db.query(
            'SELECT * FROM password_resets WHERE email = ? AND code = ? AND expires_at > NOW()',
            [email, code]
        );

        if (rows.length === 0) {
            return res.status(400).json({ message: 'Doğrulama kodu hatalı veya süresi dolmuş!' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await db.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);
        await db.query('DELETE FROM password_resets WHERE email = ?', [email]);

        res.status(200).json({ message: 'Şifreniz başarıyla güncellendi. Yeni şifrenizle giriş yapabilirsiniz.' });

    } catch (error) {
        console.error('Şifre sıfırlama hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası, şifre güncellenemedi.' });
    }
});

module.exports = router;