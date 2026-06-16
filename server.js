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
            <br><br>
            <a href="/admin-login">Login sebagai Admin</a>
        </form>
    `);
});

// Proses Upload Tugas
app.post('/submit-task', upload.single('fileTugas'), async (req, res) => {
    const { nim, nama, kelas, course } = req.body;
    const fileName = `${nim}_${req.file.originalname}`;
    
    const sasUrl = process.env.STORAGE_SAS_URL; 
    const uploadUrl = sasUrl.replace('?', `/${fileName}?`);
    
    // Menggunakan .shift() agar mengambil URL murni tanpa token dan tanpa kurung siku
    const fileUrlOnly = uploadUrl.split('?').shift(); 

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

      res.send("<h3>Berhasil! Tugas tersimpan dengan status: Pending</h3><br><a href='/submit-task'>Kembali Kumpulkan Tugas</a>");
    } catch (error) {
        res.status(500).send("Gagal memproses tugas: " + error.message);
    }
});
// --- SKENARIO 3: ADMIN LOGIN ---
app.get('/admin-login', (req, res) => {
    res.send(`
        <h2>Login Admin PraktikumSubmit</h2>
        <form action="/admin-login" method="POST">
            Username: <input type="text" name="username" required><br><br>
            Password: <input type="password" name="password" required><br><br>
            <button type="submit">Login</button>
        </form>
    `);
});

app.post('/admin-login', (req, res) => {
    const { username, password } = req.body;
    // Login statis sederhana
    if (username === 'admin' && password === 'admin123') {
        res.redirect('/task-list');
    } else {
        res.send("Login Gagal. <a href='/admin-login'>Coba Lagi</a>");
    }
});

// --- SKENARIO 3: DAFTAR TUGAS (/task-list) ---
app.get('/task-list', async (req, res) => {
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: 'db_praktikumsubmit',
            ssl: { rejectUnauthorized: false }
        });
        const [rows] = await conn.execute("SELECT id, nim, name, course, status FROM submissions");
        await conn.end();

        let html = "<h2>Daftar Tugas (Admin)</h2><table border='1' cellpadding='8'><tr><th>NIM</th><th>Nama</th><th>Mata Kuliah</th><th>Status</th><th>Aksi</th></tr>";
        
        rows.forEach(row => {
            html += `<tr>
                <td>${row.nim}</td>
                <td>${row.name}</td>
                <td>${row.course}</td>
                <td>${row.status}</td>
                <td><a href="/task-detail?id=${row.id}">Lihat Detail</a></td>
            </tr>`;
        });
        html += "</table>";
        res.send(html);
    } catch (error) {
        res.status(500).send("Gagal memuat data: " + error.message);
    }
});

// --- SKENARIO 3: DETAIL TUGAS & UNDUH FILE (/task-detail) ---
app.get('/task-detail', async (req, res) => {
    const taskId = req.query.id;
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST, user: process.env.DB_USER,
            password: process.env.DB_PASSWORD, database: 'db_praktikumsubmit',
            ssl: { rejectUnauthorized: false }
        });
        const [rows] = await conn.execute("SELECT * FROM submissions WHERE id = ?", [taskId]);
        await conn.end();

        if (rows.length === 0) return res.send("Tugas tidak ditemukan.");
        
        const row = rows.shift();
        // Mengambil token SAS untuk izin akses unduh
        const sasTokenString = process.env.STORAGE_SAS_URL.split('?').pop();
        const downloadUrl = `${row.file_url}?${sasTokenString}`;

        res.send(`
            <h2>Detail Pengumpulan Tugas</h2>
            <ul>
                <li><b>NIM:</b> ${row.nim}</li>
                <li><b>Nama:</b> ${row.name}</li>
                <li><b>Kelas:</b> ${row.class}</li>
                <li><b>Mata Kuliah:</b> ${row.course}</li>
                <li><b>Status:</b> ${row.status}</li>
                <li><b>Waktu Kumpul:</b> ${row.submitted_at}</li>
            </ul>
            <a href="${downloadUrl}" target="_blank"><button>Unduh File Tugas</button></a>
            <br><br>
            <a href="/task-list">Kembali ke Daftar Tugas</a>
        `);
    } catch (error) {
        res.status(500).send("Gagal memuat detail: " + error.message);
    }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Server running on port ${port}`));