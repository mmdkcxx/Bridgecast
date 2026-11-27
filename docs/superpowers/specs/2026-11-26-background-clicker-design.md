# Clicker saat Bridgecast di latar belakang (design singkat)

Tanggal: 2026-11-26. Status: disetujui user (opsi A). Plan: `docs/superpowers/plans/2026-11-26-background-clicker.md`.

## Intent

Saat show berjalan, operator sering pindah ke aplikasi lain (menyiapkan file sesi berikutnya, membalas WhatsApp). Sekarang clicker hanya bekerja saat jendela operator fokus (spec 2026-10-06), jadi clicker pembicara mati begitu operator pindah jendela. Tujuannya: tombol maju/mundur clicker tetap menggeser slide walau Bridgecast tidak fokus.

## Goals / non-goals / anti-goals

- Goal: PageDown = Next, PageUp = Prev saat tidak ada jendela Bridgecast yang fokus, di Windows, macOS dan Linux X11.
- Goal: bisa dinyalakan/dimatikan operator; default mati.
- Non-goal: clicker yang mengirim panah atau Spasi (tidak didaftarkan global karena merusak pengetikan di aplikasi lain). Tombol Black (`.`), F, K, B, N, D tidak ikut.
- Non-goal: mengenali perangkat clicker tertentu (opsi B, helper Raw Input/IOKit, menyusul untuk Windows).
- Anti-goal: tombol global aktif saat jendela Bridgecast fokus (dobel aksi atau melewati aturan jendela itu); aksi global yang melewati jeda yang ada (Home, tour, Interact); default menyala.

## Approaches

- **A. `globalShortcut` Electron untuk PageDown/PageUp** (dipilih): sederhana, lintas OS, tanpa izin sistem. Trade-off: PageDown/PageUp dari keyboard laptop juga menggeser slide yang tayang, dan kedua tombol itu tidak sampai ke aplikasi lain selama aktif. Karena itu ada saklar, default mati.
- **B. Mendengarkan perangkat clicker saja** (Raw Input Windows, IOKit macOS): paling aman, tapi butuh helper native, izin Input Monitoring dan tanda tangan Developer ID di macOS. Ditunda; nanti menggantikan A di Windows.
- Panah/Spasi global: ditolak, operator tidak bisa mengetik.

## Design

- **Setting** `clickerBackground: boolean` di `Settings` (`src/shared/settings.ts`, sanitize -> default `false`), disimpan di `settings.json`. Ditampilkan sebagai switch di `SettingsDialog`: "Clicker works when Bridgecast is in the background", dengan keterangan bahwa PageDown/PageUp akan menggeser slide dari aplikasi apa pun dan hanya tombol itu yang didukung. Berlaku langsung tanpa restart.
- **Main** (modul baru `src/main/background-clicker.ts`): saat setting menyala dan **tidak ada** jendela Bridgecast yang fokus (`BrowserWindow.getFocusedWindow() === null`, dicek setelah event `browser-window-blur`, ditunda satu tick), daftarkan `globalShortcut` `PageDown` dan `PageUp`. Saat jendela Bridgecast mana pun fokus (`browser-window-focus`), setting dimatikan, atau app keluar: lepas. Pendaftaran yang gagal (tombol dipakai app lain, Wayland) dicatat sekali di log, tidak melempar error.
- **Jalur aksi**: shortcut tidak memanggil reducer langsung. Main mengirim Broadcast baru `clickerKey` (`'next' | 'prev'`) ke jendela operator saja. Renderer (`App.tsx`) menjalankan guard yang sama dengan `keydown` (Home, tour, `keysClaimed`) lalu `dispatch({ type: 'next' | 'prev' })`. Jadi aturan yang ada (auto advance, section, frozen, web ready gate) tetap berlaku.
- **Repeat**: shortcut global tidak punya flag `repeat`. Clicker mengirim satu tekan per klik, jadi tidak ada debounce di versi ini; tombol yang ditahan di keyboard bisa maju lebih dari sekali (diterima karena fitur opt-in).
- **Tes**: unit test untuk logika register/unregister (diekstrak ke fungsi murni dengan `globalShortcut` palsu) dan sanitize setting. E2E tidak bisa menekan tombol global; tambahkan cek manual di `docs/test-checklist.md` (Windows: fokus ke Notepad, clicker maju/mundur; Bridgecast fokus: tidak ada aksi ganda; setting mati: tidak ada efek).
- **Docs**: `PRODUCT.md` (perilaku clicker), `CHANGELOG.md`.

## Tambahan 2026-11-26: pilihan tombol

User memakai Perfect Cue (default kirim panah kanan/kiri). Setting baru `clickerKeys: 'page' | 'arrows'` (default `page`) di bawah switch, Segmented "Clicker keys": PageDown / PageUp atau Right / Left arrows. Hanya pasangan yang dipilih yang didaftarkan global; ganti pilihan saat aktif langsung menukar tombol. Panah atas/bawah tetap tidak pernah diambil. Trade-off untuk `arrows`: panah kiri/kanan tidak menggerakkan kursor di aplikasi lain selama aktif.

## Diserahkan ke builder

Teks keterangan switch, posisi di SettingsDialog (dekat pengaturan keyboard/output), nama channel IPC, dan struktur unit test.
