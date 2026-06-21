# Dashboard Takraw MSSD Hulu Langat

Dashboard pengurusan kejohanan sepak takraw bawah 12 tahun.

## Jalankan aplikasi

```powershell
npm install
npm run dev
```

Untuk bina versi produksi:

```powershell
npm run build
```

Semua perubahan sekolah, regu, kumpulan, gelanggang, keputusan dan statistik
disimpan secara automatik dalam LocalStorage pelayar. Jika Firebase dikonfigurasi,
data turut disegerakkan ke Firestore pada dokumen `tournaments/mssd-hulu-langat-2026`.
Butang `Cetak PDF` akan mengeksport tab yang sedang dibuka dalam format A4 landscape.

## Firebase

1. Salin `.env.example` kepada `.env`.
2. Isi nilai `VITE_FIREBASE_*` daripada Firebase Console.
3. Aktifkan Firestore Database dalam Firebase.
4. Jalankan semula aplikasi.

Untuk sambung ke akaun Firebase yang lain:

1. Buka Firebase Console pada akaun baru.
2. Buat atau pilih project Firebase.
3. Tambah app jenis Web, kemudian salin nilai `firebaseConfig`.
4. Gantikan nilai dalam `.env` dengan config akaun baru itu.
5. Pastikan Firestore Database sudah aktif.
6. Data aplikasi akan disimpan di dokumen `tournaments/<VITE_TOURNAMENT_ID>`.

Contoh rules Firestore untuk ujian dalaman:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tournaments/{tournamentId} {
      allow read, write: if true;
    }
  }
}
```

Nota: rules di atas sesuai untuk ujian tertutup sahaja. Untuk public/live, ketatkan
rules mengikut login admin atau domain yang dibenarkan.

## Netlify

Fail `netlify.toml` sudah disediakan:

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

Di Netlify, masukkan environment variables yang sama seperti `.env`.

## GitHub

Repo boleh dipush ke GitHub selepas `git init`, commit, dan tambah remote:

```powershell
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```
