const express = require('express');
const mysql = require('mysql2/promise');
const multer = require('multer');
const axios = require('axios');
const app = express();

const upload = multer({ storage: multer.memoryStorage() });
app.use(express.urlencoded({ extended: true }));

// Halaman Form
app.get('/submit-task', (req, res) => {
    res.send(`
        <h2>PraktikumSubmit - Form Pengumpulan</h2>
        <form action="/submit-task" method="POST" enctype="multipart/form-data">
            NIM: <input type="text" name="nim" required><br><br>
            Nama: <input type="text" name="nama" required><br><br>
            Kelas: <input type="text" name="kelas" required><br><br>
            Mata Kuliah: <input type="text" name="course" required><br><br>
            File (PDF/ZIP): <input type="file" name="fileTugas" required><br><br>
            <button type="submit">Upload Tugas</button>
        </form>
    `);
});

// Proses Upload
app.post('/submit-task', upload.single('fileTugas'), async (req, res) => {
    const { nim, nama, kelas, course } = req.body;
    const fileName = `${nim}_${req.file.originalname}`;
    
    // Ambil variabel dari Azure Environment
    const sasUrl = process.env.STORAGE_SAS_URL; 
    const uploadUrl = sasUrl.replace('?', `/${fileName}?`);
    const fileUrlOnly = uploadUrl.split('?'); 

    try {
        // 1. Upload ke Azure Blob Storage via SAS
        await axios.put(uploadUrl, req.file.buffer, {
            headers: { 'x-ms-blob-type': 'BlockBlob' }
        });

        // 2. Simpan ke Azure MySQL
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: 'db_praktikumsubmit',
            ssl: { rejectUnauthorized: false }
        });

        await conn.execute(
            "INSERT INTO submissions (nim, name, class, course, file_url, status) VALUES (?, ?, ?, ?, ?, 'Pending')",
            [nim, nama, kelas, course, fileUrlOnly]
        );
        await conn.end();

        res.send("<h3>Berhasil! Tugas tersimpan dengan status: Pending</h3>");
    } catch (error) {
        res.status(500).send("Gagal memproses tugas: " + error.message);
    }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Server running on port ${port}`));