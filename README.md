# Kalkulator Videotron

Kalkulator spesifikasi LED display berbasis satu halaman HTML. Buka `index.html` di browser. Tampilan dan ekspor PDF menggunakan dependensi CDN sehingga membutuhkan internet.

## Fitur

- Preset modul/cabinet LED dan spesifikasi custom.
- Input target meter/cm atau susunan kolom × baris.
- Pembulatan **Kelipatan terdekat** (default), **Minimal memenuhi target**, atau **Maksimal sesuai ruang**.
- Ukuran akhir, selisih terhadap target dalam mm, luas, jumlah unit, resolusi, rasio, daya dan estimasi port.
- Salin ringkasan dan ekspor PDF A4 satu halaman dengan layout tetap pada HP/desktop; keduanya diblokir ketika input tidak valid.
- Preview grid proporsional: modul 320 × 160 mm tampil persegi panjang; cabinet 500 × 500 mm tetap persegi.

### Aturan ukuran dan validasi

Dimensi, pitch dan daya harus positif dan terhingga. Jumlah kolom/baris serta piksel harus bilangan bulat positif. PF mengikuti rentang input 0,5–1. Input kosong, nol dan negatif tidak diganti otomatis dengan nilai bawaan.

Untuk target 3,30 × 2,00 m dengan modul 320 × 160 mm:

| Pembulatan | Ukuran akhir |
|---|---|
| Kelipatan terdekat | 3,20 × 2,08 m |
| Minimal memenuhi target | 3,52 × 2,08 m |
| Maksimal sesuai ruang | 3,20 × 1,92 m |

Mode terdekat/minimal menghasilkan sedikitnya satu unit per sumbu. Mode maksimal menolak ruang yang tidak cukup untuk satu unit. Selisih ukuran selalu ditampilkan. Setiap sumbu dibatasi 10.000 unit, total 1.000.000 unit; hasil resolusi harus dalam rentang integer aman JavaScript. Batas ini merupakan batas kalkulator, bukan spesifikasi perangkat.

### Asumsi estimasi yang masih perlu dikembangkan

- Daya preset: indoor 600 W/m², outdoor 800 W/m²; daya rata-rata 40% maksimum.
- Tegangan: 220 V satu fasa atau 380 V tiga fasa dengan asumsi beban seimbang.
- Seleksi nominal MCB memakai arus × 1,25, lalu memilih rating umum terkecil yang memenuhi: 1P = 2/4/6/10/16/20/25/32/40/50/63 A; 3P = 6/10/16/20/25/32/40/50/63 A. Di atas daftar 63 A, hasil meminta evaluasi MCCB/pembagian beban, bukan membatasi rekomendasi ke 63 A. Daftar ini bukan batas maksimum semua produk MCB. Kemampuan kabel, kurva trip, kapasitas pemutusan, arus awal PSU dan kondisi instalasi tetap perlu diperiksa.
- Port masih menggunakan 650.000 piksel/port, belum memverifikasi batas model controller dan mapping.
- Cabinet dan modul belum dibedakan pada semua label. Grid mengikuti proporsi fisik unit dan menampilkan semua baris/kolom sebagai gambar statis.
- RAB, penyimpanan proyek dan agregasi beberapa layar belum tersedia.

## Pengujian

Gunakan Node.js 20 atau lebih baru:

```sh
npm test
```

Tidak perlu memasang paket npm. Pengujian menjalankan JavaScript asli dari `index.html` dengan simulasi DOM: contoh P1.53, konversi satuan, tiga pembulatan, kelipatan floating point, input tidak valid, batas numerik, pemulihan hasil dan pencegahan ekspor hasil tidak valid. GitHub Actions menjalankannya pada push dan pull request.

Pengujian ini tidak memverifikasi tampilan browser, clipboard sistem, atau hasil render PDF.

## Rujukan rating MCB

Daftar nominal mengacu pada rating produk retail, bukan jaminan stok toko atau penetapan kepatuhan suatu instalasi:

- [Schneider Electric Indonesia Easy9 1P 2 A](https://www.se.com/id/id/product/EZ9F54102/)
- [Schneider Electric Indonesia Easy9 1P 4 A](https://www.se.com/id/id/product/EZ9F54104/)
- [Katalog resmi Easy9: rating 6–63 A, 1P/3P](https://download.schneider-electric.com/files?p_Doc_Ref=Catalogue_Easy9&p_File_Name=Easy+9+Catalogue.pdf&p_enDocType=Catalog)

Contoh: perhitungan bawaan memilih MCB 1P 25 A; P1.53 4,80 × 1,92 m memilih MCB 1P 40 A. Pemilihan kurva dan kapasitas pemutusan tidak ditetapkan otomatis dari rating nominal saja.
