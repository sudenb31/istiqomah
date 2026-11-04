# Istiqomah

Aplikasi to-do harian (PWA) dengan kalender, pengingat, dan jadwal sholat. Tanpa build step dan tanpa dependensi. Semua data tersimpan di perangkat.

## Fitur

- Garis waktu harian yang menyatu dengan jadwal sholat, kalender bulanan dengan tanggal Hijriah, dan catatan sholat
- Tambah tugas pakai kalimat biasa, contoh `tilawah setiap hari setelah subuh #ibadah`
- 8 tema, 7 background, dan foto sendiri. Tema disimpan sebagai data di `js/themes.js`, dan kontrasnya dites otomatis
- Confetti saat tugas selesai, progres harian, dan hitungan hari beruntun

## Menjalankan

```bash
npm run dev
```

Buka http://localhost:5190. Service worker dimatikan di localhost supaya perubahan langsung terlihat. Tambahkan `?sw` di alamat untuk menguji mode offline.

## Tes

```bash
npm test
```

Jadwal sholat diuji terhadap 112 baris data Kemenag di `tests/fixtures`, mencakup 44 kota di daftar aplikasi. Data diambil dari API publik MyQuran lewat `tools/fetch-kemenag-fixture.mjs` dan `tools/calibrate-cities.mjs`.

## Merilis

Jalankan `npm run stamp` setiap kali ada berkas yang berubah. Perintah ini memperbarui versi dan daftar berkas di `sw.js`, sehingga aplikasi yang sudah terpasang mendapat tawaran "Versi baru tersedia".

Unggah `index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/`, dan `icons/` ke hosting HTTPS. Semua alamat di aplikasi relatif, jadi bisa dipasang di subfolder.

## Batasan yang perlu diketahui

- **Pengingat saat aplikasi tertutup:** iPhone tidak mengizinkan web app menjadwalkan notifikasi sendiri. Tanpa server push, pengingat hanya berbunyi saat aplikasi terbuka. Jalan keluarnya saat ini adalah ekspor `.ics` ke kalender perangkat.
- **Widget layar utama:** PWA tidak bisa memasang widget iOS.
- **Sinkron antarperangkat:** belum ada. Pindah data lewat Simpan cadangan dan Pulihkan cadangan di Pengaturan.
- **Jadwal sholat:** selisih terhadap data Kemenag paling banyak 1 menit pada data uji. Lokasi GPS di luar radius 40 km dari kota di daftar tidak memakai koreksi ketinggian.

## Struktur

- `js/prayer.js` perhitungan waktu sholat dan daftar kota
- `js/repeat.js` aturan pengulangan
- `js/quickadd.js` penguraian kalimat bahasa Indonesia
- `js/agenda.js` penyusunan isi hari dan daftar pengingat
- `js/ics.js` ekspor kalender
- `js/sky.js` warna langit
- `js/store.js` penyimpanan IndexedDB
- `js/reminders.js` pengingat di dalam aplikasi dan badge ikon
- `js/ui/` tampilan
