import azure.functions as app
import logging
import mysql.connector
import os

# Menggunakan Blob Trigger untuk mendeteksi file baru di container 'tugas-praktikum'
@app.blob_trigger(arg_name="myblob", path="tugas-praktikum/{name}", connection="AZURE_STORAGE_CONNECTION_STRING") 
def blob_trigger_praktikum(myblob: app.InputStream):
    logging.info(f"Azure Function mendeteksi file baru: {myblob.name}")
    
    # 1. Ekstrak nama file dari path (misal: "tugas-praktikum/24001_andi_tugas1.pdf")
    full_path = myblob.name
    filename = full_path.split('/')[-1]
    
    # Ambil NIM dari pola penamaan file (asumsi bagian depan adalah NIM mahasiswa)
    nim = filename.split('_')[0]
    
    # 2. Cek ekstensi file sederhana
    allowed_extensions = ['.pdf', '.docx', '.zip']
    _, ext = os.path.splitext(filename)
    
    if ext.lower() in allowed_extensions:
        logging.info(f"Ekstensi {ext} valid. Memperbarui status database...")
        
        # 3. Update status di Azure Database for MySQL menjadi 'Submitted'
        try:
            conn = mysql.connector.connect(
                host=os.getenv('DB_HOST'),
                user=os.getenv('DB_USER'),
                password=os.getenv('DB_PASSWORD'),
                database=os.getenv('DB_NAME')
            )
            cursor = conn.cursor()
            
            # Cari baris berdasarkan NIM dan URL file, lalu ubah statusnya
            query = "UPDATE submissions SET status = 'Submitted' WHERE nim = %s AND status = 'Pending'"
            cursor.execute(query, (nim,))
            conn.commit()
            
            logging.info(f"Status untuk NIM {nim} berhasil diperbarui ke 'Submitted'.")
            cursor.close()
            conn.close()
            
        except Exception as e:
            logging.error(f"Gagal memperbarui database: {e}")
    else:
        logging.warning(f"File {filename} memiliki ekstensi tidak diizinkan.")