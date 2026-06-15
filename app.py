import os
from flask import Flask, render_template, request, redirect, url_for
import mysql.connector
from azure.storage.blob import BlobServiceClient
from dotenv import load_load_env

load_env()
app = Flask(__name__)

# Konfigurasi Database
def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv('DB_HOST'),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD'),
        database=os.getenv('DB_NAME')
    )

# Konfigurasi Azure Storage
blob_service_client = BlobServiceClient.from_connection_string(os.getenv('AZURE_STORAGE_CONNECTION_STRING'))
container_name = os.getenv('CONTAINER_NAME')

@app.route('/submit-task', methods=['GET', 'POST'])
def submit_task():
    if request.method == 'POST':
        nim = request.form['nim']
        name = request.form['name']
        cls = request.form['class']
        course = request.form['course']
        file = request.files['file_tugas']
        
        if file:
            # 1. Upload ke Azure Blob Storage
            blob_client = blob_service_client.get_blob_client(container=container_name, blob=f"{nim}_{file.filename}")
            blob_client.upload_blob(file.read(), overwrite=True)
            file_url = blob_client.url # Ambil URL Blob Storage
            
            # 2. Simpan Metadata ke Azure MySQL dengan status awal 'Pending'
            conn = get_db_connection()
            cursor = conn.cursor()
            query = "INSERT INTO submissions (nim, name, class, course, file_url, status) VALUES (%s, %s, %s, %s, %s, 'Pending')"
            cursor.execute(query, (nim, name, cls, course, file_url))
            conn.commit()
            cursor.close()
            conn.close()
            
            return "Tugas berhasil dikirim! Menunggu validasi sistem..."
            
    return '''
        <form method="post" enctype="multipart/form-data">
            NIM: <input type="text" name="nim"><br>
            Nama: <input type="text" name="name"><br>
            Kelas: <input type="text" name="class"><br>
            Mata Kuliah: <input type="text" name="course"><br>
            File Tugas: <input type="file" name="file_tugas"><br>
            <input type="submit" value="Kumpulkan">
        </form>
    '''

@app.route('/task-list')
def task_list():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM submissions")
    tasks = cursor.fetchall()
    cursor.close()
    conn.close()
    
    # Tampilkan ke halaman HTML admin sederhana
    html = "<h1>Daftar Pengumpulan Tugas</h1><table border='1'>"
    html += "<tr><th>NIM</th><th>Nama</th><th>Mata Kuliah</th><th>File</th><th>Status</th></tr>"
    for row in tasks:
        html += f"<tr><td>{row['nim']}</td><td>{row['name']}</td><td>{row['course']}</td><td><a href='{row['file_url']}'>Unduh</a></td><td>{row['status']}</td></tr>"
    html += "</table>"
    return html

if __name__ == '__main__':
    app.run(debug=True)