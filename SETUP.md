# Menyalakan login email dan Google Calendar

Sebelum langkah ini selesai, aplikasi tetap jalan penuh di HP, tapi bagian "Akun dan kalender" belum muncul.

Semua layanan di bawah punya paket gratis, dan untuk dipakai sendiri paket gratisnya cukup. Harga dan batasnya bisa berubah, jadi cek lagi di halaman masing-masing.

**Yang boleh dikirim ke chat:** Project URL dan publishable key Supabase. Keduanya memang publik.

**Yang tidak boleh dikirim ke mana pun:** password database, secret key Supabase, app password Gmail, dan client secret Google.

## 1. Supabase

1. Daftar di [supabase.com](https://supabase.com).
2. Buat project baru: nama `istiqomah`, region Singapore. Simpan password database di password manager.
3. Buka **Project Settings > API Keys**, lalu catat **Project URL** dan **publishable key** (`sb_publishable_...`).
4. Pasang pengirim email sendiri. Di project gratis yang baru, template email baru bisa diubah setelah custom SMTP aktif, dan email bawaannya hanya berisi link, bukan kode. Cara paling cepat pakai Gmail:
   - Buat app password di [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords). Verifikasi 2 langkah harus aktif dulu.
   - Buka **Authentication > Emails > SMTP Settings**, nyalakan custom SMTP, lalu isi: host `smtp.gmail.com`, port `587`, username dan sender email memakai alamat Gmail, sender name `Istiqomah`, dan password memakai app password tadi.
5. Buka **Authentication > Emails > Magic link or OTP**, lalu ganti isinya supaya email berisi kode:
   - Subject: `Kode masuk Istiqomah`
   - Body: `<h2>Kode masuk Istiqomah</h2><p>Kode kamu: <strong>{{ .Token }}</strong></p>`

## 2. Google Cloud

Urutannya penting. Publikasikan aplikasi **sebelum** membuat client. Kalau statusnya masih Testing, sambungan Google putus sendiri setiap 7 hari.

1. Buka [console.cloud.google.com](https://console.cloud.google.com), lalu buat project bernama `Istiqomah`.
2. Buka **APIs & Services > Library**, cari **Google Calendar API**, lalu ketuk **Enable**.
3. Buka **Google Auth Platform**, isi nama aplikasi dan email, pilih audience **External**.
4. Di **Audience**, ketuk **Publish app** sampai statusnya **In production**.
5. Di **Clients**, buat client baru bertipe **Web application**, lalu isi **Authorized redirect URIs** dengan alamat ini (`REF` adalah bagian depan Project URL Supabase):

   ```text
   https://REF.supabase.co/functions/v1/google-callback
   ```

6. Catat **Client ID** dan **Client secret** untuk langkah berikutnya.

## 3. Pasang server

Jalankan di terminal dari folder `istiqomah`, satu per satu. Password database diketik sendiri saat diminta.

```bash
npx supabase login
```

```bash
npx supabase link --project-ref REF
```

```bash
npx supabase db push
```

```bash
npx supabase functions deploy google-api --use-api
```

```bash
npx supabase functions deploy google-callback --use-api
```

Lalu isi rahasia server. Ganti `ISI_CLIENT_ID` dan `ISI_CLIENT_SECRET` dengan nilai dari Google:

```bash
npx supabase secrets set APP_URL=https://sudenb31.github.io/istiqomah GOOGLE_CLIENT_ID=ISI_CLIENT_ID GOOGLE_CLIENT_SECRET=ISI_CLIENT_SECRET
```

```bash
npx supabase secrets set TOKEN_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
```

## 4. Sambungkan aplikasi

1. Isi Project URL dan publishable key di `js/config.js`.
2. Jalankan `npm run stamp`, lalu commit dan push.
3. Buka aplikasi di HP, masuk ke **Pengaturan > Akun dan kalender**, lalu masuk pakai kode dari email.
4. Ketuk **Hubungkan Google Calendar**. Halaman Google terbuka di Safari. Kalau muncul peringatan aplikasi belum diverifikasi, ketuk **Advanced** lalu lanjutkan. Centang semua izin, lalu balik ke aplikasi.
5. **Tutup pendaftaran:** setelah berhasil masuk, buka **Authentication > Sign In / Providers** di Supabase dan matikan **Allow new users to sign up**. Tanpa ini, siapa pun yang tahu alamat server bisa mendaftar.

## Yang perlu diingat

- **Proyek gratis bisa dijeda:** Supabase menjeda proyek gratis kalau aktivitasnya rendah selama 7 hari. Aplikasi tetap jalan di HP. Buka dashboard untuk menyalakannya lagi.
- **App password Gmail:** nilainya hanya disimpan di pengaturan Supabase. Kalau tidak dipakai lagi, cabut di halaman app password Google.

## Kalau nanti dibuka untuk orang lain

Struktur datanya sudah terpisah per pengguna, tapi ada tiga hal yang perlu dibereskan dulu:

1. Ganti pengirim Gmail dengan layanan kirim email khusus aplikasi supaya email login lebih aman dari folder spam.
2. Ajukan verifikasi aplikasi ke Google, lengkap dengan halaman kebijakan privasi. Tanpa verifikasi, peringatan tetap muncul dan pengguna dibatasi 100 orang.
3. Nyalakan lagi pendaftaran akun baru.
