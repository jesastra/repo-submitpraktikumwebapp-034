const express = require('express');
const mysql = require('mysql2/promise');
const multer = require('multer');
const axios = require('axios');
const app = express();

const upload = multer({ storage: multer.memoryStorage() });
app.use(express.urlencoded({ extended: true }));

// Skenario 1: Halaman Form Pengumpulan Tugas
app.get('/submit-task', (req, res) => {
    res.send(`
        <h2>PraktikumSubmit - Form Pengumpulan</h2>
        <form action="/submit-task" method="POST" enctype="multipart/form-data">
            NIM: <input type="text" name="nim" required><br><br>
            Nama: <input type="text" name="nama" required><br><br>
            Kelas: <input type="text" name="kelas" required><br><br>
            Mata Kuliah: <input type="text" name="course" required><br><br>
            File Tugas: <input type="file" name="fileTugas" required><br><br>
            <button type="submit">Upload Tugas</button>
        </form>
    `);
});

// Proses Upload Tugas
app.post('/submit-task', upload.single('fileTugas'), async (req, res) => {
    const { nim, nama, kelas, course } = req.body;
    const fileName = `${nim}_${req.file.originalname}`;
    
    const sasUrl = process.env.STORAGE_SAS_URL; 
    const uploadUrl = sasUrl.replace('?', `/${fileName}?`);
    
    // INI ADALAH BAGIAN YANG ERROR SEBELUMNYA. Sekarang sudah benar menggunakan 
    const fileUrlOnly = uploadUrl.split('?'); 

    try {
        await axios.put(uploadUrl, req.file.buffer, {
            headers: { 'x-ms-blob-type': 'BlockBlob' }
        });

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

        res.send("<h3>Berhasil! Tugas tersimpan dengan status: Pending</h3><br><a href='/task-list'>Lihat Daftar Tugas</a>");
    } catch (error) {
        res.status(500).send("Gagal memproses tugas: " + error.message);
    }
});

// Skenario 3: Halaman Admin untuk Mengecek Tugas
app.get('/task-list', async (req, res) => {
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: 'db_praktikumsubmit',
            ssl: { rejectUnauthorized: false }
        });
        const [rows] = await conn.execute("SELECT * FROM submissions");
        await conn.end();

        // Mengambil string token SAS saja untuk digabungkan dengan URL unduh
        const sasTokenString = process.env.STORAGE_SAS_URL.split('?')[2];

        let html = "<h2>Daftar Pengumpulan Tugas (Admin)</h2><table border='1' cellpadding='10'><tr><th>NIM</th><th>Nama</th><th>Mata Kuliah</th><th>Status</th><th>File</th></tr>";
        
        rows.forEach(row => {
            // Gabungkan URL bersih dengan token agar file bisa diunduh
            const downloadUrl = `${row.file_url}?${sasTokenString}`;
            html += `<tr>
                <td>${row.nim}</td>
                <td>${row.name}</td>
                <td>${row.course}</td>
                <td>${row.status}</td>
                <td><a href="${downloadUrl}" target="_blank">Unduh Tugas</a></td>
            </tr>`;
        });
        html += "</table>";
        res.send(html);
    } catch (error) {
        res.status(500).send("Gagal memuat data: " + error.message);
    }
});