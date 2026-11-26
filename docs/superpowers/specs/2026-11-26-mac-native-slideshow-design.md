# Slideshow Native di macOS (PowerPoint for Mac)

Tanggal: 2026-11-26. Status: disetujui user 2026-11-26. Plan: `docs/superpowers/plans/2026-11-26-mac-native-slideshow.md`.
Dasar: spec Windows `2026-10-27-native-slideshow-design.md`, uji coba `spikes/mac-ppt` (branch
`spike/mac-ppt-native`) yang dijalankan user di MacBook Air, macOS 27.2, PowerPoint 16.115.1.

## Intent

Operator di Mac sekarang hanya bisa memutar PPT sebagai deck Vector (PDF): animasi, transisi dan
video di dalam slide tidak jalan, dan suara video tidak keluar. Di Windows ini sudah diselesaikan
dengan mode Native (PowerPoint sungguhan menjalankan slideshow, jendelanya direkam ke output).
Tujuannya: mode Native yang sama di Mac, dengan suara video, supaya operator Mac bisa menjalankan
acara yang sama seperti operator Windows.

## Goals

- Deck PowerPoint di Mac bisa diputar Native: animasi per klik clicker, transisi, video bergerak.
- Suara dari PowerPoint (video, audio di slide) keluar lewat jalur suara Bridgecast (Local/OMT/Both,
  volume deck x master), dan **hanya** suara PowerPoint: notifikasi dan aplikasi lain tidak ikut.
- Aturan yang sama dengan Windows: never black, never desktop; PowerPoint mati/macet -> PNG slide
  yang sama (Fallback), lalu kembali Native setelah pulih; chip Native · Opening / Ready / Fallback.
- Operator tidak terganggu: jendela slideshow tidak perlu terlihat dan tidak mencuri fokus keyboard.
- Syarat sistem mengikuti PowerPoint for Mac (Microsoft 365 hanya mendukung 3 versi macOS terbaru,
  jadi selalu macOS 13+, yang dibutuhkan ScreenCaptureKit untuk suara per aplikasi).

## Non-goals (versi ini)

- Edit in PowerPoint / Revert di Mac (tetap Windows saja).
- Keynote atau LibreOffice sebagai engine Native di Mac. Tanpa PowerPoint, deck tetap Vector.
- Tanda tangan Apple Developer ID / notarization (lihat Risiko).
- Label "klik 2 dari 4" yang presisi untuk efek yang dipicu waktu (After Previous): mengikuti
  penghitung klik, sama seperti engine LibreOffice.

## Anti-goals

- Suara seluruh Mac masuk ke output (notifikasi WhatsApp di speaker venue, atau suara Bridgecast
  sendiri terdengar dobel).
- Output menampilkan desktop, jendela lain, title bar jendela, atau layar "End of slide show".
- PowerPoint milik operator (file lain yang sedang dibuka) ditutup atau dimatikan oleh Bridgecast.
- Build/test membebani laptop Windows user (dipakai untuk VJ LED): build Mac selalu di GitHub
  Actions, build uji selalu sebagai aplikasi terpisah "Bridgecast Beta".

## Hasil uji coba (fakta yang design ini pegang)

| Hal | Hasil |
| --- | --- |
| Slideshow dalam jendela | `set show type of slide show settings ... to slide show type window` OK, `run slide show` OK |
| Nomor jendela | Jendela "PowerPoint Slide Show - [<nama>]", CGWindowID 1400, terlihat di ScreenCaptureKit (sama dengan sumber `window:<id>:0` desktopCapturer) |
| Rekam jendela | PNG 1600x900 berisi slide, juga saat `onScreen=false` (tertutup / di desktop lain). Gambar **termasuk title bar** |
| next / prev / goto | 30-160 ms per perintah (NSAppleScript di dalam proses) |
| Posisi | `current show position` («class ScSp») = nomor slide 1-based. Tidak ada indeks klik animasi |
| Lewat slide terakhir | ScSp = jumlah slide + 1 dan slide kosong: layar "End of slide show" |
| Ukuran jendela | `set bounds` hanya menggeser; ukuran tetap 1600x900 (ikut layar) |
| Suara | ScreenCaptureKit, filter app `com.microsoft.Powerpoint`, 48 kHz stereo float, peak 0.86 |
| Lain-lain | PowerPoint juga membuka jendela "start" (New/Open) dan jendela editor; diabaikan |

## Approaches

1. **Bridge Swift dengan protokol ppt-bridge** (dipilih). Satu helper `mac-ppt-bridge` (Swift,
   universal arm64+x86_64, macOS 13+) bicara JSON per baris yang sama dengan `ppt-bridge.exe`.
   AppleScript dijalankan di dalam proses (cepat), CGWindowID dicari dari ScreenCaptureKit, suara
   diambil dengan ScreenCaptureKit (filter aplikasi PowerPoint) dan dikirim lewat Unix socket dalam
   format yang sama dengan named pipe Windows. Sisi aplikasi hampir semuanya dipakai ulang.
2. **Tanpa helper** (`osascript` per perintah dari Node, suara loopback seluruh sistem dari
   Electron): ditolak. Tiap klik memulai proses baru (lebih lambat) dan suara seluruh Mac ikut keluar
   (anti-goal).
3. **Helper merekam gambar sendiri** (ScreenCaptureKit -> frame ke aplikasi): tidak perlu.
   desktopCapturer Electron di macOS sudah memakai ScreenCaptureKit dan alur StreamLayer sudah ada.

## Design

### 1. Engine dan pemilihan

- `detectEngine`: `darwin` dengan `/Applications/Microsoft PowerPoint.app` dan macOS 13+ ->
  engine `powerpoint` (Mac); tanpa PowerPoint -> `none` dengan pesan yang ada (Vector saja).
- `PowerPointEngine` dipakai ulang; hanya path helper (`bridgeExePath`: di Mac
  `resources/mac-ppt-bridge/mac-ppt-bridge`, dev `native/mac-ppt-bridge/.build/...`) dan cara
  membuka pipa suara (Unix socket) yang berbeda per platform.

### 2. Helper `native/mac-ppt-bridge` (Swift Package)

Protokol sama dengan README `native/ppt-bridge` (open/next/prev/goto/close/setVolume/ping, event
position/error/app/exited, kode error yang sama). Perbedaan di Mac:

- `open`: buka file (read-only bila bisa), set show type window, presenter view off, loop off,
  `run slide show`. Cari jendela "PowerPoint Slide Show - [<nama file>]" lewat ScreenCaptureKit
  (judul + PID PowerPoint) dan balas `windowId` = CGWindowID desimal, `slides`, `audio: "pipe"`,
  `audioPipe` = path socket. Setelah show jalan, kirim jendela slideshow ke belakang dan aktifkan
  kembali Bridgecast (PID pemanggil) supaya fokus keyboard tidak pindah ke PowerPoint.
- Posisi: `current show position` dipoll (50 ms seperti Windows) dan setelah tiap perintah.
  `index` = posisi - 1. `step`/`clicks` dari penghitung klik (port `StepCounter` LibreOffice);
  `clicks` per slide dihitung saat `open` dari XML slide di dalam file (`/usr/bin/unzip -p`,
  efek `clickEffect` di `p:timing`).
- Akhir show: kalau `next` membuat posisi > jumlah slide, helper langsung `go to slide <terakhir>`
  dan membalas `ended` (sama dengan Windows), jadi output tidak pernah menampilkan layar akhir.
- Suara: SCStream dengan `SCContentFilter(display:, including: [PowerPoint app])`,
  `capturesAudio`, `excludesCurrentProcessAudio`, 48 kHz stereo. Sampel non-interleaved diubah ke
  float32 interleaved LE (format `PcmBlocker`) dan ditulis ke Unix socket
  `$TMPDIR/bridgecast-ppt-<pid>.sock`. `setVolume` dijawab `ignored` (volume diatur di aplikasi).
- Hang detection: `ping` dijawab thread pembaca; tidak dijawab bila perintah AppleScript macet
  > 1 s atau `open` > 20 s (aturan `PingPolicy` Windows).
- Shutdown: tutup show dan presentasi yang dibuka helper; PowerPoint di-quit hanya kalau helper yang
  menjalankannya dan tidak ada presentasi lain yang terbuka. Tidak pernah mematikan PowerPoint.

### 3. Rekaman dan title bar

Sumber `window:<windowId>:0` seperti Windows. Gambar jendela di Mac termasuk title bar dan pita
hitam: helper melaporkan juga `contentRect` (area slide di dalam jendela, dalam proporsi
0..1 dari ukuran jendela, dihitung dari ukuran jendela dan rasio slide) dan StreamLayer memotong
ke area itu. Ukuran jendela tidak dipaksa (spike: tidak bisa diubah); resolusi rekaman diminta
sebesar ukuran jendela x skala layar (Retina 2x).

### 4. Import dan mode putar

Import PPT di Mac tetap lewat PDF (PowerPoint dulu, lalu Keynote/LibreOffice) untuk PNG slide dan
Vector. Bila engine Mac tersedia, deck hasil import file PowerPoint disimpan dengan
`playback: 'native'` dan `original.*` = file PowerPoint (sudah dilakukan), jadi deck bisa
diputar Native dan jatuh ke PNG/Vector saat gagal. Deck dari PDF asli tetap tidak pernah Native.

### 5. Izin macOS

- Automation (Bridgecast -> PowerPoint): sudah diminta oleh import.
- Screen & System Audio Recording: dibutuhkan untuk merekam jendela dan suara. Pertama kali deck
  Native dibuka tanpa izin: chip Fallback + pesan operator "Allow Bridgecast in System Settings >
  Privacy & Security > Screen & System Audio Recording, then reopen Bridgecast." Show tetap jalan
  sebagai still.
- `Info.plist`: `NSAppleEventsUsageDescription` (sudah) dan keterangan perekaman layar/suara.

### 6. Build dan pengujian

- Helper dibangun di GitHub Actions (`macos-latest`, `swift build -c release` arm64 + x86_64,
  `lipo`, ad-hoc sign) sebagai langkah dalam workflow Mac, sebelum `electron-builder`.
  `electron-builder.yml` (mac) memasukkannya ke `resources/mac-ppt-bridge/`.
- Build uji: aplikasi terpisah **"Bridgecast Beta"** (appId, productName, nama userData berbeda)
  supaya tidak menimpa Bridgecast yang terpasang dan tidak berbagi library acara. Rilis resmi tidak
  berubah.
- Laptop Windows user tidak dipakai untuk build atau e2e. Unit test TS jalan di CI Mac juga.
- Tes otomatis: unit test TS (pemilihan engine, path helper, contentRect crop, socket suara) dan
  unit test Swift untuk penghitung klik dan parser `clickEffect`. Perilaku nyata (AppleScript,
  rekaman, suara) hanya bisa dites di Mac: daftar cek baru di `docs/test-checklist.md`.

## Risiko

- **Izin terikat tanda tangan.** Build ad-hoc: izin Screen Recording kemungkinan diminta ulang
  setiap update. Solusi permanen: Apple Developer ID + notarization (di luar versi ini).
- PowerPoint memakai full-screen Space bila show type salah: helper membaca ulang show type dan
  gagal (`open`) bila bukan window, seperti Windows.
- Jendela slideshow mengambil fokus saat `run slide show`: helper mengembalikan fokus ke Bridgecast;
  bila tidak berhasil, fitur "Clicker in the background" tetap membuat clicker bekerja.

## Diserahkan ke builder

Struktur Swift Package, nama file, format log stderr, cara tepat mendeteksi PID pemanggil,
detail parser XML, dan susunan unit test.
