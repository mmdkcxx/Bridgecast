# Checklist uji lapangan PPT Share

Jalankan di PC acara (Windows 11, PowerPoint terinstal, tanpa dev tools) memakai installer `dist/ppt-share-<versi>-setup.exe`. Siapkan satu layar kedua lewat HDMI (proyektor, TV, atau LED processor).

Catat hasil tiap butir: **OK**, atau tulis apa yang terjadi.

## Persiapan

- [ ] Installer berjalan tanpa error. Shortcut "PPT Share" muncul di desktop dan Start menu.
- [ ] Aplikasi terbuka tanpa internet (cabut LAN/Wi-Fi dulu). Font dan ikon tampil normal.
- [ ] Sambungkan HDMI, tekan **Win+P → Extend**.

## Impor

- [ ] Buat event baru lewat menu event.
- [ ] Impor satu `.pptx` 16:9 lewat **Add files**. Baris "Converting" muncul, lalu deck siap dengan jumlah slide yang benar.
- [ ] Impor satu `.ppt` (format lama).
- [ ] Impor satu `.pdf`.
- [ ] Seret tiga file sekaligus dari Explorer (`.pptx`, `.pdf`, `.txt`). Dua deck masuk berurutan; `.txt` tampil sebagai "Unsupported".
- [ ] Impor `.pptx` saat PowerPoint sedang membuka file lain milik operator. File itu tetap terbuka dan tidak berubah.
- [ ] Notes slide tampil di panel "Up next".

## Output HDMI

- [ ] Buka status **HDMI** di header, pilih layar kedua, nyalakan. Status berubah menjadi "HDMI live".
- [ ] Program tampil fullscreen di layar kedua tanpa bingkai, taskbar, atau kursor.
- [ ] Layar operator tidak tertutup, dan pintasan keyboard tetap jalan tanpa perlu klik ulang ke jendela operator.
- [ ] Deck 4:3 tampil utuh dengan bar hitam di kiri dan kanan.
- [ ] Next 50 kali berturut-turut (Space/→). Tidak ada slide yang terlewat atau tertinggal.
- [ ] Prev (←), Freeze (F), Black (B), dan transisi Fade. Layar kedua mengikuti semuanya.
- [ ] KV: unggah gambar di "Key visual (KV)"; saat STANDBY layar kedua menampilkan KV, saat ada slide tekan K (tally KV), B menggantikan KV dengan hitam, hapus KV mengembalikan STANDBY hitam. Gambar non 16:9 tampil utuh.
- [ ] Freeze, lalu Next beberapa kali: layar kedua tetap, panel kanan "Preview" menampilkan slide yang dipilih. Unfreeze: layar kedua tetap di slide yang ditahan, posisi kembali ke slide itu, Next lanjut ke slide berikutnya.
- [ ] Dengan clicker presentasi (jendela operator aktif): tombol maju/mundur menggeser slide, tombol layar hitam memicu Black.
- [ ] Clicker di latar belakang, Settings > "Clicker in the background" **mati**: klik Notepad agar di depan, tekan maju/mundur clicker. Slide di Bridgecast tidak bergerak.
- [ ] Setting **hidup**, Notepad atau WhatsApp di depan: maju/mundur clicker (PageDown/PageUp) menggeser slide yang tayang; "Continue to next deck" mati dan section tetap menghentikan clicker di akhir deck/section.
- [ ] Setting hidup, jendela operator di depan: satu tekan = satu slide (tidak dobel).
- [ ] Setting hidup, jendela Prepare di depan: perilaku sama seperti sebelumnya.
- [ ] Setting hidup, operator di Home lalu klik Notepad: clicker tidak menggeser apa pun.
- [ ] Matikan setting (Bridgecast lalu kembali ke Notepad): PageDown kembali menggulir Notepad.
- [ ] Setting hidup, tutup Bridgecast: PageDown kembali bekerja normal di semua aplikasi.
- [ ] "Continue to next deck" mati: clicker di slide terakhir tidak pindah ke deck berikutnya. Hidupkan: clicker lanjut ke deck berikutnya. Tutup dan buka aplikasi: pilihannya tetap.
- [ ] Sections: buat event dengan beberapa deck, klik "Add section" dan beri nama. Hidupkan "Continue to next deck", lalu pakai clicker sampai slide terakhir sebelum section. Clicker harus berhenti di sana, panel "Up next" menampilkan "End of section". Tombol N pindah ke section berikutnya, Shift+N kembali.
- [ ] Cabut kabel HDMI saat live. Layar operator tidak tertutup; status menjadi "HDMI hidden".
- [ ] Colok lagi. Output kembali fullscreen di layar yang sama dengan slide yang sedang live.
- [ ] Biarkan output tampil 30 menit sambil sesekali Next. Tidak ada kedip, hitam mendadak, atau jendela yang pindah.

## Zoom (HDMI dan monitor)

- [ ] **Zoom in/out:** dengan slide LIVE, klik "Zoom in" beberapa kali: HDMI dan monitor operator
      membesar bersamaan ke tengah slide. "Zoom out" mengecilkan lagi; di 1.00 gambar kembali
      utuh tanpa pergeseran.
- [ ] **Panah:** saat diperbesar, tombol panah (kiri, kanan, atas, bawah) menggeser bagian yang
      terlihat di HDMI dan monitor. Di tepi slide panah tidak membawa gambar keluar dari bingkai.
- [ ] **Minimap:** klik di minimap memindahkan bagian yang terlihat ke titik itu; geser (drag)
      kotak minimap menggeser gambar halus tanpa lompatan.
- [ ] **Reset otomatis:** dengan zoom aktif, ambil slide berikutnya (Space): zoom kembali ke 1.00
      pada HDMI dan monitor. "Reset zoom" juga mengembalikan ke 1.00.
- [ ] **STANDBY:** saat STANDBY (belum ada slide live), tombol zoom dan panah nonaktif; HDMI tetap
      hitam dan tidak pernah menampilkan transform.
- [ ] **Slide web dengan Interact:** di deck web, perbesar lalu aktifkan Interact: klik pada
      halaman mengenai elemen tepat di bawah kursor pada gambar yang diperbesar (bukan elemen di
      posisi tanpa zoom). Setelah zoom di-reset, klik tetap tepat sasaran.
- [ ] **OMT/NDI tidak ikut zoom:** dengan OMT atau NDI menyala, zoom di operator hanya mengubah
      HDMI dan monitor; penerima OMT/NDI tetap menerima slide penuh tanpa zoom.

## Slide video

- [ ] Impor folder hasil ekspor Canva (`page-NN.png` + `page-NN.mp4`). Deck siap dengan jumlah halaman yang benar; slide video bertanda ikon play di strip dan di panel "Up next".
- [ ] Seret folder `fixtures/video-deck` dari File Explorer ke jendela aplikasi dan pastikan folder itu terimpor sebagai deck. (Drop folder asli tidak bisa diotomatisasi.)
- [ ] **File video langsung:** tambahkan satu file `.mp4` (H.264) dan satu `.webm` lewat Add files, lalu satu lagi lewat drag and drop, dan satu lewat New event. Tiap file jadi satu deck bernama sesuai file dengan satu slide video (tanda play di strip). Take slide itu: video tampil di HDMI dan berhenti di frame terakhir. Suara keluar dari HDMI bila file punya audio. Tambahkan file `.mov`: muncul baris error yang menyebut tipe yang didukung dan tidak ada deck yang dibuat. Tambahkan teks yang diganti nama jadi `.mp4`: pesan "cannot be played", tidak ada deck. Gambar poster deck (`001.png`) harus seukuran video aslinya.
- [ ] Animasi diputar sekali di layar HDMI saat slide video tampil, lalu berhenti di frame terakhir.
- [ ] Black atau KV off pada slide video menampilkan frame akhir, bukan awal animasi.
- [ ] Suara keluar dari perangkat audio/HDMI yang dipilih.
- [ ] Mute all mematikan suara seketika; matikan Mute all, suara kembali.
- [ ] Ubah volume deck (klik kanan, Sound…) atau master volume saat slide video sedang live, tanpa klik apa pun di layar output. Suara di output ikut naik atau turun dan videonya tidak diputar ulang.
- [ ] Cabut perangkat audio yang dipilih: suara pindah ke perangkat default dan muncul peringatan.
- [ ] Tombol suara di transport bar membisukan suara output: suara HDMI, suara PowerPoint native (named pipe) dan suara deck web, juga suara network di vMix atau OBS. Klik lagi, suara kembali; ikon menunjukkan status bisu.
- [ ] Settings → Sound menampilkan daftar perangkat Windows dengan nama (bukan label kosong), termasuk perangkat audio layar HDMI dan headset Bluetooth; suara slide video keluar dari perangkat yang dipilih.
- [ ] Cabut perangkat yang dipilih saat slide video diputar: suara pindah ke default Windows, peringatan "not connected" muncul. Colok lagi dan pilih ulang perangkatnya.
- [ ] Saat "Default (Windows)" dipilih, ganti perangkat default Windows (Settings → Sound → Output). Catat apakah suara mengikuti tanpa restart aplikasi (belum diketahui dari kode).
- [ ] Perangkat yang tersimpan bertahan setelah restart aplikasi dan setelah restart Windows (ID perangkat bisa berubah setelah update driver; kalau tampil "not connected", catat).

## Canvas dan Fit

- [ ] Sambungkan layar LED atau proyektor dengan resolusi tidak lazim (misalnya 1920×640 atau 3840×1080). Di popover output pilih "Match HDMI display": canvas mengikuti resolusi layar itu dan gambar memenuhi layar tanpa bingkai hitam. Ulangi dengan "Custom size" memakai angka yang sama (angka ganjil dibulatkan ke bawah menjadi genap dan pembulatannya diberitahukan).
- [ ] Pasang canvas ultra-lebar (misalnya 3840×1080) untuk satu event ("Canvas for this event…"), lalu tampilkan deck 16:9. Pada Display mode Fit slide berada di tengah dengan bar hitam di kiri dan kanan; Fill memenuhi layar dan tepi atas/bawah terpotong; Stretch memenuhi layar dan gambar terlihat melebar. Mengganti mode saat slide live langsung terlihat di output. Kunci visual (KV) tetap Fit.
- [ ] Ganti ke event tanpa canvas sendiri: output kembali ke canvas bawaan mesin. Kembali ke event semula: canvas ultra-lebar kembali.

## Output OMT (network)

Butuh PC kedua di LAN yang sama dengan vMix 29+ dan OBS 31+ dengan plugin OMT. Resolume best effort. Simpan hasil di catatan spike (`docs/superpowers/notes/omt-spike.md`, Checklist Windows) bila relevan.

- [ ] Nyalakan OMT di popover output. Prompt Windows Firewall muncul: catat teks, nama program, dan jaringan (Private/Public). Izinkan Private.
- [ ] **vMix**: tambah sumber OMT; `NAMA-PC (PPT Share)` muncul otomatis dan videonya tampil.
- [ ] **OBS**: sumber OMT muncul otomatis dan videonya tampil.
- [ ] Tambah sumber lewat **alamat manual** di vMix dan di OBS. Catat format apa yang diterima (string yang dipakai libomt berbentuk `HOSTNAME (NAME)`, bukan URL `omt://`). Bila tidak ada yang diterima, Task berikutnya menambah kolom host:port.
- [ ] Suara, dengan satu video slide: rute **Local device** (suara di PC ini, tidak di vMix/OBS), **OMT** (suara di vMix/OBS, tidak di PC ini), **Both**. Pada tiap rute, HDMI menyala dan HDMI dicabut: suara lokal hanya keluar dari satu jendela (tidak ganda).
- [ ] Jitter suara pada 30 dan 60 fps: dengarkan dari vMix/OBS selama beberapa menit (satu thread worker mengirim video dan suara; `omt_send` memblokir sekitar 1/fps detik). Catat bila ada putus-putus; bila ada, suara dipindah ke worker kedua.
- [ ] Cabut kabel LAN saat OMT jalan, lalu pasang lagi. Aplikasi tidak macet; penerima tersambung lagi (catat berapa lama).
- [ ] **60 fps selama 30 menit** pada 1920×1080 dengan satu penerima: tidak ada peringatan "dropping frames", gambar mulus.
- [ ] **3840×1080 pada 60 fps** di laptop acara: di spike Linux hanya ~23 paint unik per detik (gerak tidak mulus). Periksa di Windows; bila tidak mulus, pakai 30 fps.
- [ ] Ubah canvas, frame rate, lalu nama sumber saat penerima tersambung: **ukur celah penemuan ulang yang sebenarnya** (di spike Linux sampai ~20 s; teks UI berkata "about a second"). Bila lebih lama, ubah teksnya.
- [ ] Dengan pengirim sungguhan dan satu penerima tersambung: ubah **frame rate** dan **canvas** lewat popover. Konfirmasi muncul; saat slide on air dan ada penerima, hanya SATU pertanyaan ("Change it now?"). Tiga peringatan (drops, no receivers, no sound) tampil dengan teks yang benar (sejauh bisa dipicu).
- [ ] Tutup aplikasi saat pengirim sibuk (penerima tersambung, 60 fps): proses keluar dalam beberapa detik, tidak menggantung.
- [ ] **Resolume** (plugin FFGL pihak ketiga, best effort): catat sumber terlihat atau tidak.
- [ ] Matikan OMT: sumber hilang dari vMix/OBS dan HDMI tidak terpengaruh.

## Output NDI (network)

**BELUM DIJALANKAN oleh pengguna.** Butuh NDI Runtime terpasang di PC acara (installer memasangnya) dan PC kedua di LAN yang sama dengan vMix, OBS (plugin DistroAV), dan NDI Monitor. Hasil Windows untuk spike ada di `docs/superpowers/notes/ndi-spike.md`.

- [ ] Nyalakan NDI di popover output: lencana NDI berubah dan sumber `NAMA-PC (PPT Share)` muncul.
- [ ] **vMix** memilih sumber NDI dari daftar sumber dan videonya tampil.
- [ ] **OBS** (DistroAV) memilih sumber NDI dan videonya tampil.
- [ ] **NDI Monitor** pada canvas **1920×1080**: gambar tidak terdistorsi (tidak miring, tidak bergeser, warna benar).
- [ ] **NDI Monitor** pada canvas **3840×1080**: gambar tidak terdistorsi.
- [ ] Suara, dengan satu video slide: rute **Local device**, **Network**, **Both**. Local: suara hanya di PC ini. Network: suara hanya di penerima NDI dan OMT. Both: keduanya, dan suara lokal hanya keluar dari satu jendela.
- [ ] Cabut kabel LAN saat NDI menyala, lalu pasang lagi: aplikasi tidak macet, HDMI tidak terpengaruh, penerima menemukan sumber lagi.
- [ ] OMT dan NDI keduanya menyala selama **30 menit** (60 fps) dengan penerima tersambung di keduanya: tidak ada putus, suara tidak putus-putus, CPU wajar. Matikan salah satu protokol: yang lain tetap mengirim tanpa putus.
- [ ] Ubah frame rate dengan kedua protokol menyala: konfirmasi muncul sekali, kedua sumber kembali setelah sekitar satu detik.
- [ ] Tanpa NDI Runtime: nyalakan NDI, muncul pesan runtime tidak terpasang dan OMT serta HDMI tetap jalan.

## Deck web (browser source)

**BELUM DIJALANKAN oleh pengguna.** Di kode dan di Linux/xvfb sudah diuji otomatis (`npm run test:e2e:web`: ready gate, Next diteruskan satu kali per tekan, D / Shift+D, Edit URL saat live masuk HOLD dulu, HOLD setelah server mati lalu Reload dengan output tetap frame terakhir, B off ditolak setelah HOLD, HTML full screen, pop-up dan kamera ditolak, input Prepare, ganti event, user agent tanpa token Electron dan aplikasi). Belum pernah dijalankan di Windows, dengan Canva sungguhan, dengan clicker sungguhan, atau dengan Google sign-in. Butuh internet dan akun Canva. Catatan spike: `docs/superpowers/notes/web-source-spike.md`.

- [ ] **Canva dari link view**: Add web page, tempel link view Canva (bukan akun), buka Prepare, klik Present sampai mode present tampil, tutup Prepare. Take: Program tampil seperti di Canva, tidak ada pop-up atau bilah browser di output.
- [ ] **Canva dari akun**: Prepare, Sign in dengan email (bukan Google), buka desain milik akun, Present, lalu take. Tutup dan buka lagi aplikasi: login masih ada (satu profil untuk seluruh mesin).
- [ ] **Clicker di Canva**: dengan clicker presentasi (jendela operator aktif), tekan maju **dua kali berturut-turut**: kedua tekanan memajukan slide Canva satu kali tiap tekan (tidak ada yang hilang, tidak lompat dua). Posisi deck di daftar tidak berubah. Fokus tidak pindah ke halaman: tombol keyboard operator (F, B, D) tetap jalan tanpa klik ulang ke jendela operator.
- [ ] **YouTube dengan suara**: deck web YouTube dengan video yang bersuara, rute **Local device**, **OMT**, **Both**. Local: suara hanya di PC ini. OMT: hanya di vMix/OBS. Both: keduanya, dan suara lokal hanya keluar dari satu jendela. Volume deck dan master volume berlaku.
- [ ] **Canvas tidak biasa**, mis. **3840×1080**: jendela halaman tersembunyi mengikuti ukuran canvas (Windows memotong jendela di layar kecil: cek `contentSize` lewat tampilan halaman, tidak ada scrollbar atau halaman yang terpotong). Picture di HDMI dan OMT tidak melar.
- [ ] **Internet dicabut saat live, lalu Reload**: halaman yang sudah termuat tetap tampil tanpa Reload. Tekan Reload (menu deck, tertulis "HOLD first"): output masuk HOLD dulu, baru halaman dimuat ulang; muncul peringatan HOLD ("Web page lost its connection. ..."), output menahan frame bagus terakhir (periksa tidak hitam dan tidak tampil halaman error), tidak berakhir sendiri. Tekan B lalu B lagi: B off ditolak selama halaman belum Ready (output tetap hitam). Colok lagi, Reload, tunggu chip Ready, tekan **Resume web**.
- [ ] **Sign out of all websites**: Prepare, menu More. Saat ada halaman web live: ditolak dengan pesan "Take another deck first, then sign out." Saat tidak live: konfirmasi, lalu halaman dimuat ulang dan login Canva hilang.
- [ ] **Windows occlusion**: jendela halaman tersembunyi tetap digambar saat jendela lain menutupinya. Uji dengan app seperti biasa (switch `CalculateNativeWinOcclusion` dimatikan oleh aplikasi) dan, sebagai pembanding, dengan switch itu dihidupkan lagi: catat apakah gambar membeku saat tertutup tanpa switch.
- [ ] **`document.hasFocus()` salah** pada halaman yang bergantung pada fokus: halaman hidden tidak punya fokus. Coba editor atau widget yang menampilkan kursor atau menahan tombol saat tidak fokus; catat halaman yang rusak.
- [ ] **Login Google dengan user agent Chrome**: coba Sign in with Google di Canva. Bila diblokir ("This browser or app may not be secure"), catat dan pakai login email.
- [ ] **Jendela OMT di layar utama 1920×1080** (masalah 1 px): dengan layar utama tepat 1920×1080, nyalakan OMT. Di Linux/xvfb jendela OMT jadi 1919×1079 dan frame OMT dibuang (hitam di penerima). Periksa di Windows: frame sampai di vMix/OBS dan bukan hitam. Ini bug OMT yang sudah ada, bukan deck web, tetapi mengenai deck web juga.
- [ ] **Edit URL / Reload saat live**: deck web live, tidak frozen. Menu deck, Edit URL, alamat lain: output langsung HOLD (frame terakhir tetap, halaman baru tidak terlihat di HDMI/OMT selama dimuat). Resume web baru aktif setelah chip Ready; tekan, output menampilkan halaman baru.
- [ ] **HTML full screen (Canva Present)**: di halaman live, klik tombol yang memanggil full screen (Present di Canva). Jendela halaman tetap tersembunyi, tidak ada jendela full screen di layar mana pun, gambar di output tidak berubah ukuran.
- [ ] **Peringatan ukuran halaman (Windows)**: canvas lebih besar dari layar (mis. 3840×1080 di layar 1920×1080). Bila Windows memotong jendela halaman, muncul peringatan di atas Program: "The web page is WxH on this PC, not the canvas size ... ". Catat ukurannya.
- [ ] **Prepare hanya untuk event yang terbuka**: deck web live dari event lain (setelah ganti event) tidak bisa dibuka di Prepare ("This web page is not part of the open event. Close this window."). Batas yang diketahui: untuk menyiapkannya, buka lagi event deck itu.
- [ ] Prepare: saat deck live dan tidak frozen, klik dan ketik di jendela Prepare ditolak (banner "ON AIR: input locked. Press F to freeze before you click."); setelah Freeze (F) diterima; pop-up yang dibuka halaman saat tidak live muncul sebagai jendela biasa di layar operator, bukan di HDMI.

**Jendela Prepare sebagai browser (belum dijalankan di Windows).** Otomatis: `npm run test:e2e:web` (toolbar 16 px, Back/Forward, Fit dan 100%, klik dan ketik, Interact, Esc dan F6, kursor, zoom 150% per deck, terkunci saat live). Daftar `<select>` (Task 9) tidak dikerjakan.

- [ ] **Skala layar 125% dan 150%, Fit dan 100%**: set skala layar Windows 125%, lalu 150%. Buka Prepare untuk halaman dengan tombol kecil (mis. Canva). Di Fit dan di 100% klik tombol kecil dan kolom teks: klik mendarat tepat di target, teks di 100% tajam (satu piksel halaman per piksel layar), akurasi tetap setelah digeser ke tiap sudut.
- [ ] **Pindah jendela Prepare antar monitor**: seret jendela ke monitor dengan skala berbeda. Gambar tetap utuh, klik tetap akurat, jendela halaman yang memberi gambar ke output tetap seukuran canvas.
- [ ] **Ukuran dan posisi diingat**: ubah ukuran dan posisi jendela, tutup, buka lagi, tutup aplikasi, buka lagi: ukuran dan posisi kembali. Ulangi dengan jendela di layar kedua; cabut layar kedua lalu buka Prepare: jendela muncul di layar yang ada, bukan di luar layar.
- [ ] **Situs sungguhan termasuk login**: Canva (email), YouTube dan satu situs dengan login. Klik, scroll, ketik, login lalu Present berjalan; kursor mengikuti halaman (pointer di tombol, I-beam di kolom).
- [ ] **Dialog halaman dan Esc**: buka dialog cookie atau menu halaman, tekan Esc dengan keyboard di halaman: dialog tertutup dan fokus pindah ke tombol Interact. F6 pindah ke kolom alamat dan tidak mengirim apa pun ke halaman. Spasi dengan Interact nyala mengetik spasi di kolom halaman, tidak menggeser.
- [ ] **Daftar `<select>` tetap tidak tampak (batas yang diketahui)**: buka halaman dengan `<select>`, klik. Daftar native tidak tampil di preview. Cara kerja: fokus kolom lalu tombol panah atas dan bawah memilih nilai. Catat situs yang tidak bisa dilewati dengan cara ini (itu alasan menjalankan Task 9).
- [ ] **Zoom halaman di HDMI dan NDI**: More, zoom 150% saat frozen. Setelah Unfreeze, HDMI dan NDI menampilkan halaman diperbesar; Reload mempertahankan 150%; deck lain di situs yang sama tetap 100%. Saat live dan tidak frozen, pilihan zoom nonaktif dengan pesan.
- [ ] **Clicker saat Prepare terbuka dan deck live**: tekan maju dengan clicker: halaman tetap menerima satu panah per tekan; klik dan ketik di Prepare tetap ditolak.
- [ ] **Resolusi preview**: (dulu 320x180 bila Prepare dibuka selama halaman loading; diperbaiki, lihat spec web-source bagian Prepare.) Buka Prepare segera setelah menambah web deck: `videoWidth` video di jendela Prepare harus sama dengan lebar Canvas dan pada 100% teks halaman tajam. Lalu Take deck itu: monitor operator juga tajam. Catat bila buram.

## Deck web di WebView2 (Windows, helper `web-bridge`)

**BELUM DIJALANKAN di Windows.** Jalankan `npm run build:web-bridge:win` sebelum build installer
(atau `npm run build:web-bridge` di shell bash). Otomatis di mesin dev: `npm run test:e2e:web-bridge`
(FakeWebEngine: take, helper dimatikan, HOLD, restart, halaman dibuka lagi di URL terakhir) dan
`npm test` (engine, backend, supervisor, pipe suara). Yang TIDAK terjangkau otomatis: WebView2
sungguhan, login Google, capture jendela helper, dan loopback audio browser.

- [ ] `resources/web-bridge/web-bridge.exe` + `Microsoft.Web.WebView2.Core.dll` + `WebView2Loader.dll` ada di installer.
- [ ] Deck web Canva: **Sign in with Google** berhasil di jendela helper (popup maupun redirect); tutup dan buka aplikasi, login masih ada (profil `<userData>/web-profile/default`).
- [ ] Saat deck **live**, tautan `target=_blank` atau `window.open` tidak membuka jendela dan tidak memindahkan halaman yang sedang tayang.
- [ ] Halaman macet di JavaScript (mis. skrip berat di konsol): sekitar 5 detik kemudian muncul HOLD (bukan diam saja).
- [ ] Halaman helper tidak pernah mengambil fokus: clicker dan F/B/D tetap bekerja tanpa klik ulang ke jendela operator.
- [ ] **Tidak ada kursor di gambar**: gerakkan mouse di layar operator saat deck web live; HDMI/OMT dan preview tidak boleh memuat panah kursor (jendela helper diparkir di luar semua layar). Snapshot/thumbnail deck juga tanpa kursor.
- [ ] Canvas 2520x1080 (dan 3840x1080): gambar di HDMI/OMT tidak melar atau berbingkai; ukuran jendela = canvas.
- [ ] Jendela helper ditutup aplikasi lain: capture tetap mengalir (atau HOLD), tidak hitam dan bukan desktop.
- [ ] Jendela helper di layar kedua / layar dimatikan: capture tetap mengalir atau HOLD.
- [ ] YouTube dengan suara: Local, OMT, Both. Volume deck dan master berlaku **di jalur output** (HDMI/OMT dan rute Local lewat app). Batas yang diketahui: halaman yang live juga berbunyi langsung di PC ini pada volume Windows penuh (mute halaman akan membungkam pipe, sudah diukur), jadi deck/master/Mute tidak berlaku untuk salinan langsung itu; catat apakah terdengar dobel di rute Local.
- [ ] Black atau KV saat deck web live: suara ikut senyap dan kembali setelah dibuka.
- [ ] Matikan helper lewat Task Manager saat live: HOLD (frame terakhir, bukan hitam), helper hidup lagi sendiri, halaman dibuka lagi di alamat terakhir, lalu **Resume web**.
- [ ] Tiga kali helper gagal: aplikasi pindah ke backend Electron untuk sesi itu (halaman tetap tampil, bukan hitam); catat pesannya di konsol.
- [ ] `PPT_WEB_BACKEND=electron`: deck web tetap jalan lewat jendela Electron (tab capture).
- [ ] PC tanpa WebView2 Runtime (atau tanpa `WEBVIEW2_BROWSER_EXECUTABLE_FOLDER`): aplikasi memakai backend Electron dan menampilkan satu baris peringatan "WebView2 is not installed on this PC. Web pages use the built-in browser."
- [ ] Sign out of all websites dari Prepare: login hilang dan halaman dimuat ulang.
- [ ] **Diagnosa**: kalau sebuah deck tetap `Loading` atau tidak tampil, buka
      `%APPDATA%\bridgecast\web.log` (build dev: `bridgecast-dev`; di mesin ini
      `<userData>/web.log`). Baris `[web]` mencatat open/nav/status/capture/HOLD. Untuk
      mereproduksi dengan helper asli: `npm run test:e2e:web-bridge:real` (mencetak status deck,
      daftar jendela `desktopCapturer`, dan apakah capture memberi frame).

## Putar PPT asli (native slideshow)

**BELUM DIJALANKAN oleh pengguna, dan belum pernah dijalankan di Windows.** Yang diuji otomatis (`npm run test:e2e:native`, di Linux/xvfb dengan `PPT_ENGINE_FAKE=1`, yaitu FakeEngine, bukan PowerPoint): deck native dengan 3 langkah klik (Up next "Next: step N of 3 on this slide", label step N/3, take tidak naik di dalam slide), engine crash lalu output memakai PNG slide yang sama dan peringatan "PowerPoint is not responding", slide show kembali native setelah engine hidup lagi, Edit in PowerPoint saat live menunggu ("Changes apply when this deck leaves air.") lalu diterapkan setelah deck turun dari air dan `original.pptx` tidak berubah, deck PDF (vector) menggambar `<canvas>`, `source.pdf` rusak jatuh ke PNG slide yang sama. Yang TIDAK terjangkau dan hanya bisa diuji di Windows: jembatan COM PowerPoint (`native/ppt-bridge`), capture jendela slide show (`desktopCapturer`) ke HDMI, OMT dan NDI, jalur suara PowerPoint lewat named pipe, akurasi klik per langkah. Catatan spike: `docs/superpowers/notes/native-ppt-spike.md`.

- [ ] **Deck dengan animasi dan Morph** (deck klien sungguhan): chip deck berubah Opening, lalu Native · Ready. Take: HDMI menampilkan slide show PowerPoint, animasi dan Morph berjalan, tidak ada desktop atau bingkai jendela PowerPoint di output.
- [ ] **Clicker per langkah**: tiap Next memajukan satu langkah animasi (Up next menulis "Next: step N of M"); setelah langkah terakhir, Next pindah slide. Posisi di aplikasi sama dengan posisi di PowerPoint (jumlah langkah per slide cocok; catat slide yang jumlahnya beda karena trigger atau After Previous).
- [ ] **Video dengan suara di slide** ke rute Local, OMT dan Both: suara ikut rute yang dipilih, volume deck dan master berlaku, Mute all membisukan, Black dan KV membisukan suara PowerPoint dan mengembalikannya saat dibuka.
- [ ] **PowerPoint dimatikan paksa saat live** (Task Manager, End task): output langsung PNG slide yang sama (tidak hitam, tidak desktop), muncul "PowerPoint is not responding. ..." Lalu Resume PowerPoint (aktif saat sesi siap) kembali ke slide yang sama. Bila PowerPoint milik pengguna sendiri ikut terbuka, aplikasi tidak menutupnya.
- [ ] **PowerPoint macet** (hang): setelah sekitar 3 detik tanpa jawaban jatuh ke PNG; jembatan tidak mematikan `POWERPNT.EXE` yang bukan miliknya. Catat bila pemulihan butuh pengguna menutup PowerPoint sendiri.
- [ ] **Edit in PowerPoint saat live**: ubah typo, simpan: tampil "Changes apply when this deck leaves air."; setelah deck turun dari air perubahan terpasang; Apply now meminta konfirmasi; Revert kembali ke file impor; `original.pptx` tidak berubah.
- [ ] **Deck statis jalan sebagai Vector**: PDF dan deck tanpa animasi tampil tajam di 3840×2160 (kanvas `<canvas>`), tanpa PowerPoint terbuka.
- [ ] **Canvas tidak biasa** (mis. 3840×1080 dan 1280×720): gambar slide show mengikuti canvas, mengganti canvas saat live meminta konfirmasi dan tidak hitam. Bandingkan capture WGC dan GDI saat jendela tertutup jendela lain, dan apakah kursor ikut tertangkap.
- [ ] **Dua deck native bergantian**: deck berikutnya dibuka lebih dulu (maksimal 2 sesi), pindah deck tanpa jeda hitam, tidak ada jendela PowerPoint nyasar di layar HDMI.

## Library dan event

- [ ] Urutkan deck dan slide dengan drag. Output tidak berubah saat mengurutkan.
- [ ] Ganti nama deck (klik kanan, Rename, atau F2) menjadi misalnya "Sesi 1 - Pengenalan materi". Nama tetap setelah aplikasi dibuka ulang.
- [ ] Ubah lebar panel Decks dan Up next serta tinggi strip. Semua tombol kontrol tetap terlihat. Tutup dan buka ulang: ukuran tetap.
- [ ] Hapus deck yang sedang tampil (klik kanan, Remove deck…, Remove). Output menjadi hitam tanpa gambar rusak.
- [ ] Ganti ke event lain saat live. Output tetap sampai operator memilih slide baru.
- [ ] Tutup aplikasi lalu buka lagi. Event, deck, urutan, tema, dan pilihan layar HDMI masih ada.

## Installer Windows: NDI Runtime

**BELUM DIJALANKAN: menunggu pengguna di Windows.** Ditulis tanpa Windows, wine, `pwsh`, atau `makensis`, jadi `build/install-ndi-runtime.ps1` dan `build/installer.nsh` belum pernah dieksekusi. Bangun dulu installer (`npm run build:win` atau `npx electron-builder --win nsis`) di Windows. Log skrip tampil di tab Show details installer.

- [ ] VM Windows 11 bersih dengan internet: jalankan installer. Muncul "Downloading the NDI Runtime...", runtime terpasang, lalu sumber NDI muncul di NDI Studio Monitor / vMix setelah NDI dinyalakan di aplikasi.
- [ ] Runtime sudah terpasang: langkah NDI dilewati (tidak ada unduhan, tidak ada prompt).
- [ ] Set `PPT_SIMULATE_NDI_MISSING=1` (variabel lingkungan) saat runtime sudah ada: jalur unduhan tetap berjalan.
- [ ] Tanpa internet: muncul prompt "The NDI Runtime could not be downloaded. Continue installing PPT Share without NDI? ...". Pilih **Yes**: install selesai, NDI menampilkan pesan runtime tidak ada, HDMI dan OMT tetap bekerja. Pilih **No**: installer berhenti di halaman gagal (bukan pembatalan bersih, karena `Abort` di `customInstall` berjalan setelah file aplikasi disalin); file aplikasi mungkin tertinggal dan pengguna boleh meng-uninstall.
- [ ] File dirusak (ganti exe hasil unduhan dengan exe tanpa tanda tangan setelah diunduh, mis. dengan menjeda skrip): muncul prompt "The downloaded NDI Runtime does not carry a valid Vizrt signature and was not installed. ..." dan tidak ada yang terpasang.
- [ ] Pemasang runtime gagal (mis. dibatalkan atau kode keluar bukan 0): muncul prompt "The NDI Runtime could not be installed (code N). ..." dengan kode yang benar.
- [ ] Install per-user (bukan per-mesin) berjalan sebagai pengguna biasa, sedangkan pemasang NDI Runtime butuh admin: muncul prompt UAC, juga pada `/S`. Menolak UAC menghasilkan prompt kode 4 ("could not be installed (code 4)") pada install biasa; pada `/S` install lanjut tanpa NDI.
- [ ] Install senyap `PPT-Share-setup.exe /S` selesai tanpa prompt apa pun, juga tanpa internet (lanjut tanpa NDI).

## Putar PPT di Linux (LibreOffice)

**BELUM DIJALANKAN: menunggu PC Linux (X11).** Pasang `libreoffice-impress` dan `python3-uno` dulu (lihat `README.md`). Tes integrasi: `xvfb-run -a npx vitest run test/integration`. E2E native dengan LibreOffice sungguhan (`PPT_E2E_LIBREOFFICE=1`) belum disambungkan ke `e2e/native.mjs`.

- [ ] Impor deck klien beranimasi (`.pptx`): jumlah slide, catatan, slide tersembunyi, dan jumlah klik benar; font yang hilang muncul sebagai satu peringatan.
- [ ] Putar deck itu (Native) ke HDMI dan OMT dengan clicker: tiap klik menjalankan satu langkah animasi, Up next menunjukkan label langkah.
- [ ] Suara di dalam slide: rute Local, Network, Both. Tidak ganda di perangkat default; tidak ada suara bocor saat deck tidak live.
- [ ] LibreOffice dimatikan paksa saat live: output memakai PNG slide yang sama (tidak hitam, tidak desktop), lalu kembali ke native.
- [ ] Edit in LibreOffice: peringatan simpan muncul dulu; simpan memperbarui slide; saat deck live, perubahan menunggu sampai turun dari air; Revert mengembalikan file impor.
- [ ] Sesi Wayland (dengan Xwayland, bawaan GNOME): deck beranimasi diputar Native lewat Xwayland, animasi terlihat di HDMI dan OMT, tidak ada dialog "Share screen" GNOME. Video di dalam slide: suara terdengar, gambarnya belum tertangkap (diketahui). Frame pertama setelah deck dibuka adalah slide, bukan tampilan edit LibreOffice. Pointer mouse tidak ikut di gambar (lihat catatan 2026-11-18).
- [ ] Sesi Wayland tanpa Xwayland (`DISPLAY` kosong): pesan "need X11" benar, deck tetap bisa diputar sebagai Vector / Still images.
- [ ] `.deb` terpasang bersih dan AppImage berjalan; keduanya bisa impor dan memutar.
- [ ] HDMI di X11: jendela slide show tidak pernah terlihat di layar operator atau HDMI di luar Program.

## Jendela operator yang didesain ulang (Windows)

Hanya bisa dicek di Windows. Tangkapan layar Electron di Linux dan Windows sudah dibandingkan dengan mockup; hal di bawah bergantung pada OS dan layar sungguhan.

- [ ] Tema mengikuti sistem: Settings → Theme = Auto, lalu ganti Windows antara mode terang dan gelap (Settings → Personalization → Colors). Jendela ikut berganti tanpa restart; pilihan Light atau Dark di header menimpa Auto dan bertahan setelah restart.
- [ ] Skala layar 125% dan 150%: tidak ada teks terpotong, tombol tumpang tindih, atau scroll horizontal di kolom Decks, Program dan panel kanan. Cek juga baris deck (tag LIVE, FROZEN, HOLD dan chip Vector tetap utuh) dan dialog Settings.
- [ ] Transport bar di jendela selebar 1024px dan 1180px (dan skala 125%): Prev, posisi, Next, Freeze, KV, Black dan ikon suara muat satu baris di kolom Program; tidak ada tombol yang terpotong.
- [ ] Ikon aplikasi di taskbar pada 16px dan 24px (skala 100% dan 125%): lengkungan ikon menyatu pada 16px, titik oranye tetap terlihat dan ikon tetap bisa dikenali. Cek juga ikon di Alt+Tab, jendela output dan installer.
- [ ] Dialog Settings (ikon gerigi): terbuka di tengah, Tab tidak keluar dari dialog, Esc menutup dan fokus kembali ke gerigi; tema, aksen (termasuk Custom) dan Reduce motion tersimpan setelah restart; About menampilkan logo Bridgecast dan versi.
- [ ] Mode kontras tinggi Windows aktif: status LIVE, FROZEN, BLACK, KV dan NEXT masih terbaca (ikon dan kata, tidak hanya warna).

- [ ] Header di laptop 1366x768 dengan HDMI, OMT dan NDI aktif: brand, Home, tab event, New, tema dan gerigi muat satu baris; tab yang tidak muat masuk ke menu overflow, tab live ditandai dan tetap terlihat; kolom Program tidak menyembunyikan judul atau tombol transport yang penting (key cap hilang di bawah 640px, baris rapat di bawah 520px).
- [ ] Format impor sudah pindah: Settings → Import (antara Appearance dan Sound) menyimpan pilihan "Save imported PowerPoint files as" (LibreOffice .odp atau As imported), dan footer panel Decks tidak punya pilihan itu lagi. Impor PowerPoint baru memakai format yang dipilih, dan setelah restart pilihannya tetap.

## Home dan tab event (Windows)

Otomatis di Linux hanya untuk tab, Home dan Settings (`e2e/web.mjs`, `e2e/settings.mjs`); sisanya perlu PC Windows dengan library sungguhan.

- [ ] Home di library sungguhan (puluhan event, deck besar): Recent, All dan Archive terisi benar, thumbnail muncul, pencarian dan filter cepat, tampilan grid dan list terbaca di skala 125% dan 150%.
- [ ] Tab bertahan setelah restart aplikasi: buka beberapa event, tutup aplikasi, buka lagi; tab yang sama muncul dan event yang aktif tetap terpilih.
- [ ] Tab event yang sedang on air terkunci: tampilkan slide, lalu cek tab itu tidak punya × dan tekan Delete di tab itu: tab tetap ada dan output tidak berubah (slide, canvas, KV). Pindah ke tab lain dan buka Home: HDMI dan receiver network tidak berubah. Tombol Back to console kembali ke event yang on air.
- [ ] Off air dari Home (tombol Off air, lalu konfirmasi Off air; coba juga Cancel dulu, output tetap on air): output kembali ke STANDBY (bukan BLACK; KV tampil bila ada), banner on air hilang, dan tab itu sekarang punya × sehingga bisa ditutup.
- [ ] Pindah tab dan buka Home saat slide, deck PowerPoint native dan halaman web sedang on air: tidak ada yang berubah di HDMI maupun di receiver network (vMix, OBS).
- [ ] Delapan tab terbuka di jendela 1180px: menu overflow tab memuat semua event, tab live tetap terlihat di tepi, nama panjang terpotong dengan elipsis dan tombol New, HDMI, tema dan gerigi tidak keluar jendela.
- [ ] **Off air saat live**, dua kali: sekali dengan deck PowerPoint native on air, sekali dengan deck web (Canva atau YouTube) on air. Tab event yang live tidak punya ×, dan Delete tidak menutupnya. Dari Home, Off air lalu Cancel: output tetap live. Lalu Off air lalu **Off air** di konfirmasi: status kembali STANDBY (bukan BLACK; KV tampil bila ada), tidak ada slide PowerPoint atau frame halaman web yang tertinggal di HDMI, OMT, atau NDI, tidak ada desktop atau bingkai jendela, dan PowerPoint tetap terbuka. Tab itu lalu punya × dan bisa ditutup.

## Auto-update (Windows and Linux AppImage)

**NOT YET VERIFIED ON WINDOWS.** The only automated evidence is the Linux/xvfb e2e with the fake
engine (`npm run test:e2e:update`, `PPT_UPDATE_FAKE=1`): it checks the chip, the popover, the
automatic download, the keyboard guard, the on-air install gate and skip-across-restart. Install on
quit (added 2026-11-17) is covered by unit tests of `UpdateManager.prepareQuit` only. No real GitHub check, download,
sha512 verification, NSIS/AppImage install or relaunch has been run on a user machine. Everything
below is a field-check script for another agent on the user's Windows PC (plus a Linux PC for the
AppImage half). Record **OK** or the exact observation for each item.

**Before the first real release:** the repository `CallMeSon/ppt-share` must be **public**, because
electron-updater reads `latest.yml` from the public release. The coordinator runs
`gh repo edit CallMeSon/ppt-share --visibility public`; a worker must not run it. The same agent
must be signed in with `gh auth login` and have permission to create releases.

**Where to look:** Bridgecast writes no log file. Launch the installed app from a terminal with
`Bridgecast.exe --enable-logging=stderr` (or run the e2e command in a terminal) and keep the console:
updater messages are prefixed `[update]`. The NDI download/install messages appear in the Windows
installer's **Show details** tab. Persisted state is in the app's userData folder
(`%APPDATA%\Bridgecast` on Windows): `settings.json` holds `updates.skippedVersion`, and
`events.json` plus `decks/` hold the library. The published metadata is `latest.yml` (Windows
setup) and `latest-linux.yml` (AppImage) on release `v0.1.1`; a missing yml makes the check fail
silently.

**Publishing the 0.1.1 test release (keep the 0.1.0 installer to test the upgrade):**

1. On Windows: bump `"version"` in `package.json` to `0.1.1`, add `## [0.1.1] - YYYY-MM-DD` to
   `CHANGELOG.md`, commit, then run `npm run release -- --win --publish` (shortcut:
   `npm run release:win`). Expect `dist/bridgecast-0.1.1-setup.exe`, `latest.yml` and the
   blockmap, then release `v0.1.1` created or updated on GitHub.
2. On Linux (X11, with OMT libraries in `resources/omt/linux`): use the **same** `0.1.1` version
   and run `npm run release -- --linux --publish` (shortcut: `npm run release:linux`). Expect
   `dist/bridgecast-0.1.1.AppImage` and `latest-linux.yml` attached to that **same** `v0.1.1`
   release. The AppImage embeds its blockmap, so there is no separate blockmap file to upload.
   Do not create a separate `v0.1.1-linux` tag.
3. `npm run release` without `--publish` is a dry run: it prints the commands and changes nothing.
   A failed GitHub check (offline, rate limit, missing yml) is silent by design.

- [ ] **Chip and popover:** install 0.1.0 on Windows, open Bridgecast with internet, wait about
      15 s. The header chip reads `Update 0.1.1` beside the Settings gear, and a compact popover
      opens under it over the top of the right panel. The STANDBY/LIVE tally, the "Program" title
      and the whole monitor must stay visible (the popover must never cover the centre column).
      Click "What's new": the newest CHANGELOG section appears as plain lines.
- [ ] **Automatic download:** with nothing on air, click nothing. Within seconds of the chip the
      popover shows "Downloading Bridgecast 0.1.1"
      with a progress bar and no action button. Nothing is installed yet; the running 0.1.0 keeps
      working and the output is untouched.
- [ ] **Install refused while a slide is live:** import a deck, press Space so the tally is LIVE,
      then download (or leave a ready update open). "Restart and install" is disabled and shows
      "Something is on air. Take it off air or wait until the show ends." Clicking it does nothing;
      the output still shows the same slide. Pressing Space while that button has focus still moves
      the Program to the next slide and never starts an install.
- [ ] **Download waits for off air:** start 0.1.0, take a slide live within 15 s. The popover reads
      "Bridgecast 0.1.1 is available" with a Download button and nothing downloads. Take the Program
      off air: the download starts by itself.
- [ ] **Install on close:** with the update ready and nothing on air, close Bridgecast with the
      window's ×. The NSIS installer runs silently (note any UAC prompt), the app does _not_ reopen,
      and the next start is 0.1.1. Repeat on the AppImage.
- [ ] **No install on close while live:** with the update ready and a slide LIVE, close Bridgecast.
      No installer runs; reopening is immediate and still 0.1.0, and the update becomes ready again
      without a second full download.
- [ ] **Install while idle:** take everything off air (STANDBY), click "Restart and install".
      Bridgecast and the OMT sender stop cleanly, then the NSIS installer runs and the app relaunches
      on 0.1.1. Confirm the OMT worker shut down before termination in the console (no forced-kill
      warning). Note precisely whether the installer starts _after_ the `before-quit` OMT shutdown
      in `src/main/index.ts`: `quitAndInstall()` is called while that handler may still be waiting.
      This ordering is the main open risk of the feature.
- [ ] **Events and settings survive:** after the 0.1.0 → 0.1.1 upgrade, events, decks, slide order,
      sections, theme, accent, canvas, HDMI/OMT/NDI settings and the first-run-tour flag are all
      still present; no library folder was moved or renamed.
- [ ] **Linux AppImage:** on the Linux PC, run the 0.1.0 AppImage with internet, see the same chip
      and popover, download, install while idle and relaunch on 0.1.1 with the library intact.
- [ ] **Linux `.deb`** (self-update since the version after 0.1.4; older `.deb` installs show no
      update UI and need one manual install): install a `.deb` that has the updater, publish a
      newer release, and check Settings > About > "Check for updates": the chip appears, the
      download runs in the background, and "Restart and install" asks for the administrator
      password, installs with `dpkg` and relaunches on the new version with the library intact.
      Cancel the password dialog once: the app must stay on the old version and still work.
      Closing the app with a downloaded update asks for the password too.
- [ ] **Offline start:** disconnect the network and start 0.1.0 (or 0.1.1). Nothing appears — no
      chip, no popover, no error toast, no log above info. Startup is not delayed; the next check is
      in 6 h. Reconnect and confirm the next scheduled check still works.
- [ ] **Skip a version:** with `Update 0.1.1` downloaded and ready, click "Skip this version". Chip and popover
      disappear; `updates.skippedVersion` in `settings.json` becomes `0.1.1`. Close and reopen the
      app (no installer may run on that close), wait past the 15 s check: 0.1.1 is still hidden (the fake-engine e2e covers this case).
      Publish 0.1.2 and confirm 0.1.2 _is_ announced, so only the skipped version is suppressed.
- [ ] **NDI Runtime is not redownloaded:** with the NDI Runtime already installed, note the
      installer's Show details output during the 0.1.1 update. It must print
      "NDI Runtime already installed." and exit 0 at once, with no download and no UAC prompt.
      `build/install-ndi-runtime.ps1` already short-circuits on this case; verify it on Windows.
- [ ] **Env switch:** start the installed 0.1.0 with `BRIDGECAST_NO_UPDATE_CHECK=1` and internet.
      No chip, popover or check should appear; Settings > About shows only the version.

## PowerPoint on macOS (Keynote / LibreOffice)

**UNVERIFIED: needs a Mac.** Import of .pptx/.ppt converts to PDF first (Keynote, else LibreOffice), then imports as a Vector PDF deck.

- [ ] Keynote installed: import a .pptx. A Vector deck appears with the file name, correct slide count, sharp slides; Keynote opens the file hidden-ish, then closes it; if Keynote was not running it quits again, if it was running it stays open.
- [ ] First import shows the macOS prompt "Bridgecast wants to control Keynote" (text from `NSAppleEventsUsageDescription`); Allow, and the import finishes.
- [ ] Permission denied (Don't Allow, or remove it in System Settings > Privacy & Security > Automation): with LibreOffice absent the row says to allow Bridgecast to control Keynote; with LibreOffice present the import still works through it.
- [ ] LibreOffice only (no Keynote): import a .pptx and a .ppt; a Vector deck appears. Also with LibreOffice already open on a document.
- [ ] Neither installed: the row says to install Keynote or LibreOffice, or export to PDF.
- [ ] The deck's playback is Vector (never Native), the deck menu has no "Edit in PowerPoint", and `original.pptx` in the deck folder is the untouched imported file next to `source.pdf`.
- [ ] A deck with a modal Keynote dialog (missing fonts) or a 200-slide file: the import fails with a message after about 3 minutes and Keynote is not left hanging.
- [ ] Packaged build (hardened runtime): Apple events are not silently refused (the entitlement `com.apple.security.automation.apple-events` is present).

## Selesai

- [ ] Uninstall lewat Settings → Apps berjalan bersih.
