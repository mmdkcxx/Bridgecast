Uji coba PowerPoint for Mac untuk Bridgecast (sekali pakai, bukan aplikasi)
==========================================================================

Program ini TIDAK memasang apa pun dan tidak menyentuh Bridgecast. Ia membuka satu file PPT di
PowerPoint, menjalankan slideshow, dan mencatat apa yang bisa dan tidak bisa dilakukan.
Jalankan saat TIDAK sedang show (PowerPoint akan terbuka dan bisa bersuara).

Siapkan satu file .pptx yang punya: beberapa animasi per klik, satu transisi, dan satu video
dengan suara.

1. Ekstrak ppt-spike.tar.gz (klik dua kali). Muncul folder berisi ppt-spike dan README.txt.
2. Buka Terminal, ketik "cd " (dengan spasi), seret folder hasil ekstrak ke Terminal, Enter.
3. Izinkan program dijalankan (sekali):
     xattr -dr com.apple.quarantine ppt-spike
4. Jalankan (seret file .pptx ke Terminal untuk mengisi path-nya):
     ./ppt-spike /path/ke/file.pptx
5. macOS akan meminta izin:
   - "Terminal wants to control Microsoft PowerPoint": Allow.
   - Screen Recording untuk Terminal: buka System Settings > Privacy & Security > Screen &
     System Audio Recording, nyalakan Terminal, lalu jalankan langkah 4 lagi (q dulu kalau masih
     jalan).
6. Klik jendela Terminal agar aktif, lalu ketik perintah + Enter:
     n   (beberapa kali)   maju satu klik; lewati slide dengan animasi
     p                     mundur
     a                     rekam suara PowerPoint 15 detik; segera tekan n sampai video berputar
     s                     simpan gambar setiap jendela PowerPoint (coba saat Terminal menutupi
                           jendela slideshow)
     b                     coba ubah ukuran jendela slideshow
     q                     selesai
7. Kirim ke saya:
   - seluruh teks di Terminal (Cmd+A, Cmd+C di jendela Terminal, lalu paste ke chat), dan
   - file powerpoint-sound-*.caf dan window-*.png yang muncul di folder itu (atau cukup bilang
     apakah suaranya terdengar jelas dan apakah gambarnya berisi slide).
