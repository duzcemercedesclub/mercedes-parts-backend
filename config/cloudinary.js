const cloudinary = require('cloudinary').v2;
const multer = require('multer');

// Cloudinary Kimlik Ayarları
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer ile dosyayı RAM üzerinde (MemoryStorage) geçici olarak tutuyoruz
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/**
 * Dosyayı Cloudinary'ye dinamik klasör yapısıyla yükleyen fonksiyon
 * @param {Buffer} fileBuffer - Dosyanın binary içeriği
 * @param {string} folderName - Cloudinary panelinde açılacak alt klasör adı (Örn: 'sliders', 'banners')
 */
const uploadToCloudinary = (fileBuffer, folderName = 'general') => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { 
                // Ana bir proje klasörü altında modüler alt klasörler oluşturur
                folder: `mercedes_parts/${folderName}`, 
                use_filename: true,
                unique_filename: true
            }, 
            (error, result) => {
                if (error) return reject(error);
                resolve(result.secure_url); // Yüklenen resmin HTTPS linkini döner
            }
        );
        stream.end(fileBuffer);
    });
};

module.exports = { upload, uploadToCloudinary };