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
