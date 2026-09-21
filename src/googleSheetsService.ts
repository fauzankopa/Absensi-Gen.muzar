import { Generus, Gender, JobStatus, JOB_STATUS_OPTIONS, hitungUmur, SesiAbsensiDanJurnal } from './types';

/**
 * Ekstrak ID spreadsheet dari tautan URL atau teks ID langsung
 * Contoh: https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0
 * -> 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
 */
export function extractSpreadsheetId(input: string): string {
  if (!input) return '';
  // Bersihkan spasi, tanda kutip (' atau "), tanda kurung, atau backtick di awal/akhir
  const cleaned = input.trim().replace(/^['"`<\s]+|['"`>\s]+$/g, '');
  const match = cleaned.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  // Jika pengguna memasukkan ID langsung
  const idMatch = cleaned.match(/^[a-zA-Z0-9-_]{20,}$/);
  if (idMatch) {
    return idMatch[0];
  }
  // Fallback: hapus karakter selain a-z, 0-9, -, _
  const pureId = cleaned.replace(/[^a-zA-Z0-9-_]/g, '');
  if (pureId.length >= 20) {
    return pureId;
  }
  return cleaned;
}

export interface SheetMetadata {
  id: string;
  title: string;
  sheets: {
    sheetId: number;
    title: string;
    rowCount?: number;
    columnCount?: number;
  }[];
}

/**
 * Ambil metadata Spreadsheet (nama file dan tab-tab di dalamnya)
 */
export async function getSpreadsheetDetails(
  spreadsheetId: string,
  accessToken: string
): Promise<SheetMetadata> {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    const message = errJson.error?.message || `Gagal mengakses Google Sheets (Status: ${res.status})`;
    throw new Error(message);
  }

  const data = await res.json();
  return {
    id: data.spreadsheetId,
    title: data.properties?.title || 'Spreadsheet Tanpa Judul',
    sheets: (data.sheets || []).map((s: any) => ({
      sheetId: s.properties?.sheetId,
      title: s.properties?.title || 'Sheet1',
      rowCount: s.properties?.gridProperties?.rowCount,
      columnCount: s.properties?.gridProperties?.columnCount
    }))
  };
}

/**
 * Baca nilai range dari Google Sheets
 */
export async function readSheetValues(
  spreadsheetId: string,
  range: string,
  accessToken: string
): Promise<any[][]> {
  const encodedRange = encodeURIComponent(range);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    const message = errJson.error?.message || `Gagal membaca data sheet (Status: ${res.status})`;
    throw new Error(message);
  }

  const data = await res.json();
  return data.values || [];
}

/**
 * Parsing baris Google Sheets menjadi array Generus
 */
export function parseSheetRowsToGenerus(rows: any[][]): Omit<Generus, 'id'>[] {
  if (!rows || rows.length < 2) return [];

  // Baris pertama adalah Header
  const headers = rows[0].map(h => String(h || '').trim().toLowerCase());

  // Helper pencocokan index header
  const findColIndex = (keywords: string[]): number => {
    return headers.findIndex(h => keywords.some(k => h.includes(k)));
  };

  const idxNama = findColIndex(['nama lengkap', 'nama generus', 'nama']);
  const idxGender = findColIndex(['jenis kelamin', 'gender', 'jk']);
  const idxTempat = findColIndex(['tempat lahir', 'kota lahir', 'kota']);
  const idxTgl = findColIndex(['tanggal lahir', 'tgl lahir', 'tgl. lahir', 'dob', 'tgl']);
  const idxUmur = findColIndex(['umur', 'usia', 'age']);
  const idxKerja = findColIndex(['status kerja', 'pekerjaan', 'profesi', 'status']);
  const idxKelompok = findColIndex(['kelompok', 'kelas', 'group', 'klp']);
  const idxTelp = findColIndex(['no telpon', 'no hp', 'telepon', 'whatsapp', 'wa', 'hp', 'telp']);
  const idxBapak = findColIndex(['nama bapak', 'nama orang tua', 'nama ayah', 'bapak', 'ayah', 'ortu']);
  const idxAktif = findColIndex(['status aktif', 'keaktifan', 'aktif']);

  const results: Omit<Generus, 'id'>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rawNama = idxNama !== -1 ? String(row[idxNama] || '').trim() : '';
    // Skip baris jika nama kosong
    if (!rawNama) continue;

    // Gender
    const rawGender = idxGender !== -1 ? String(row[idxGender] || '').trim() : '';
    const gender: Gender = rawGender.toLowerCase().startsWith('p') ? 'Perempuan' : 'Laki-laki';

    // Pekerjaan / Status Kerja
    const rawJob = idxKerja !== -1 ? String(row[idxKerja] || '').trim() : '';
    let matchedJob: JobStatus = 'Pelajar / Mahasiswa';
    for (const opt of JOB_STATUS_OPTIONS) {
      if (opt.toLowerCase() === rawJob.toLowerCase()) {
        matchedJob = opt;
        break;
      }
    }

    // Tanggal Lahir & Umur
    const rawTgl = idxTgl !== -1 ? row[idxTgl] : undefined;
    const rawAge = idxUmur !== -1 ? row[idxUmur] : undefined;
    const detectedAge = hitungUmur(rawTgl, rawAge);
    const finalTanggal = rawTgl ? String(rawTgl).trim() : (detectedAge ? `${new Date().getFullYear() - detectedAge}-01-01` : '2005-01-01');

    // Kelompok
    const rawKelompok = idxKelompok !== -1 ? String(row[idxKelompok] || '').trim() : 'Gamprit 1';

    // Status Aktif
    const rawActive = idxAktif !== -1 ? String(row[idxAktif] || '').trim() : '';
    const isActive = rawActive.toLowerCase() !== 'nonaktif' && rawActive.toLowerCase() !== 'tidak' && rawActive.toLowerCase() !== 'false';

    results.push({
      namaLengkap: rawNama,
      jenisKelamin: gender,
      tempatLahir: idxTempat !== -1 ? String(row[idxTempat] || '-').trim() : '-',
      tanggalLahir: finalTanggal,
      umur: detectedAge ?? (rawAge ? parseInt(String(rawAge).replace(/\D/g, ''), 10) : undefined),
      usia: detectedAge ?? (rawAge ? parseInt(String(rawAge).replace(/\D/g, ''), 10) : undefined),
      statusKerja: matchedJob,
      kelompok: rawKelompok || 'Gamprit 1',
      noTelpon: idxTelp !== -1 ? String(row[idxTelp] || '-').trim() : '-',
      namaBapak: idxBapak !== -1 ? String(row[idxBapak] || '-').trim() : '-',
      statusAktif: isActive,
      createdAt: new Date().toISOString()
    });
  }

  return results;
}

/**
 * Ekspor Data Generus ke Google Sheet baru / tab yang dipilih
 */
export async function writeGenerusToSheet(
  spreadsheetId: string,
  sheetTitle: string,
  generusList: Generus[],
  accessToken: string
) {
  const header = [
    'Nama Lengkap',
    'Jenis Kelamin',
    'Tempat Lahir',
    'Tanggal Lahir',
    'Umur',
    'Status Kerja',
    'Kelompok',
    'No Telpon',
    'Nama Bapak',
    'Status Aktif'
  ];

  const rows = generusList.map(g => [
    g.namaLengkap,
    g.jenisKelamin,
    g.tempatLahir || '-',
    g.tanggalLahir || '-',
    hitungUmur(g.tanggalLahir, g.umur || g.usia) ?? '-',
    g.statusKerja,
    g.kelompok,
    g.noTelpon || '-',
    g.namaBapak || '-',
    g.statusAktif ? 'Aktif' : 'Nonaktif'
  ]);

  const body = {
    values: [header, ...rows]
  };

  const range = `${sheetTitle}!A1:J${rows.length + 1}`;
  const encodedRange = encodeURIComponent(range);

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal menulis ke Google Sheet (Status: ${res.status})`);
  }

  return await res.json();
}

/**
 * Ekspor Riwayat Absensi & Jurnal ke tab Rekap di Spreadsheet
 */
export async function writeRekapAbsensiToSheet(
  spreadsheetId: string,
  sheetTitle: string,
  sesiList: SesiAbsensiDanJurnal[],
  accessToken: string
) {
  const header = [
    'Tanggal',
    'Tempat Pengajian',
    'Kelompok',
    'Pemateri 1',
    'Materi Al-Qur\'an',
    'Pemateri 2',
    'Materi Hadist',
    'Penasehat',
    'Catatan Pengajaran',
    'Total Generus',
    'Hadir',
    'Izin',
    'Sakit',
    'Alpa',
    'Persentase Hadir (%)'
  ];

  const rows = sesiList.map(s => {
    const total = s.totalGenerus || (s.totalHadir + s.totalIzin + s.totalSakit + s.totalAlpa) || 0;
    const hadir = s.totalHadir || 0;
    const izin = s.totalIzin || 0;
    const sakit = s.totalSakit || 0;
    const alpa = s.totalAlpa || 0;
    const pct = total > 0 ? Math.round((hadir / total) * 100) : 0;

    return [
      s.tanggal,
      s.tempat || 'Gamprit',
      s.kelompok || 'Semua',
      s.pemateri1 || s.pengajar || '-',
      s.alquranMateri || '-',
      s.pemateri2 || '-',
      s.hadistMateri || '-',
      s.penasehat || '-',
      s.catatan || '-',
      total,
      hadir,
      izin,
      sakit,
      alpa,
      `${pct}%`
    ];
  });

  const body = {
    values: [header, ...rows]
  };

  const range = `${sheetTitle}!A1:O${rows.length + 1}`;
  const encodedRange = encodeURIComponent(range);

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal menulis rekap ke Google Sheet (Status: ${res.status})`);
  }

  return await res.json();
}
