export type Gender = 'Laki-laki' | 'Perempuan';

export const KELOMPOK_OPTIONS = ['Gamprit 1', 'Gamprit 2', 'TMII 1', 'TMII 2'] as const;
export type KelompokType = (typeof KELOMPOK_OPTIONS)[number];

export const TEMPAT_OPTIONS = ['Gamprit', 'TMII 1', 'TMII 2'] as const;
export type TempatType = (typeof TEMPAT_OPTIONS)[number];

export type JobStatus =
  | 'Karyawan'
  | 'PNS'
  | 'Guru'
  | 'Freelancer'
  | 'Pelajar / Mahasiswa'
  | 'Wiraswasta'
  | 'Belum Bekerja'
  | 'Lainnya';

export const JOB_STATUS_OPTIONS: JobStatus[] = [
  'Karyawan',
  'PNS',
  'Guru',
  'Freelancer',
  'Pelajar / Mahasiswa',
  'Wiraswasta',
  'Belum Bekerja',
  'Lainnya'
];

export interface Generus {
  id: string;
  namaLengkap: string;
  jenisKelamin: Gender;
  tempatLahir: string;
  tanggalLahir: string; // YYYY-MM-DD atau DD/MM/YYYY atau teks
  umur?: number | string; // Umur / usia numerik langsung
  usia?: number | string; // Alias
  statusKerja: JobStatus;
  kelompok: string; // Gamprit 1, Gamprit 2, TMII 1, TMII 2
  noTelpon: string;
  namaBapak: string;
  statusAktif: boolean; // aktif atau dinonaktifkan
  createdAt?: string;
  updatedAt?: string;
}

function calculateAgeFromDate(birthDate: Date): number | null {
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 && age <= 120 ? age : null;
}

export function hitungUmur(tanggalLahir?: string | number | null, fallbackUmur?: number | string | null): number | null {
  // 1. Cek fallbackUmur (jika pengguna memasukkan data umur/usia secara langsung)
  if (fallbackUmur !== undefined && fallbackUmur !== null && fallbackUmur !== '') {
    if (typeof fallbackUmur === 'number' && fallbackUmur > 0 && fallbackUmur <= 120) {
      return Math.round(fallbackUmur);
    }
    const parsedFallback = parseInt(String(fallbackUmur).replace(/\D/g, ''), 10);
    if (!isNaN(parsedFallback) && parsedFallback > 0 && parsedFallback <= 120) {
      return parsedFallback;
    }
  }

  if (tanggalLahir === undefined || tanggalLahir === null || tanggalLahir === '') return null;

  // 2. Jika tanggalLahir berupa angka murni (misal user menginput umur di kolom tanggalLahir atau Excel menganggapnya integer umur)
  if (typeof tanggalLahir === 'number') {
    if (tanggalLahir > 0 && tanggalLahir <= 120) {
      return Math.round(tanggalLahir);
    }
    // Jika angka berupa serial date Excel (misal 10000..65000)
    if (tanggalLahir > 10000 && tanggalLahir < 65000) {
      const excelEpoch = new Date(1899, 11, 30);
      const birthDate = new Date(excelEpoch.getTime() + tanggalLahir * 86400000);
      return calculateAgeFromDate(birthDate);
    }
  }

  const str = String(tanggalLahir).trim();
  if (!str || str === '-') return null;

  // 3. Cek jika string adalah angka umur murni atau format "18 th", "20 tahun", "usia 21"
  const ageMatch = str.match(/^(\d{1,3})(\s*(th|thn|tahun))?$/i);
  if (ageMatch) {
    const parsedAge = parseInt(ageMatch[1], 10);
    if (parsedAge > 0 && parsedAge <= 120) {
      return parsedAge;
    }
  }

  // 4. Cek format Indonesia DD/MM/YYYY atau DD-MM-YYYY atau DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const birthDate = new Date(year, month, day);
    return calculateAgeFromDate(birthDate);
  }

  // 5. Cek format standar YYYY/MM/DD atau YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const birthDate = new Date(year, month, day);
    return calculateAgeFromDate(birthDate);
  }

  // 6. Cek serial number Excel dalam bentuk teks ("38450")
  if (/^\d{5}$/.test(str)) {
    const serial = parseInt(str, 10);
    const excelEpoch = new Date(1899, 11, 30);
    const birthDate = new Date(excelEpoch.getTime() + serial * 86400000);
    return calculateAgeFromDate(birthDate);
  }

  // 7. Fallback standar JS Date parse
  const birthDate = new Date(str);
  if (!isNaN(birthDate.getTime())) {
    return calculateAgeFromDate(birthDate);
  }

  return null;
}

export type StatusKehadiran = 'Hadir' | 'Izin' | 'Sakit' | 'Alpa';

export interface KehadiranDetail {
  generusId: string;
  generusNama: string;
  kelompok: string;
  status: StatusKehadiran;
  keterangan?: string;
}

export interface SesiAbsensiDanJurnal {
  id: string;
  tanggal: string; // YYYY-MM-DD
  waktuMulai?: string; // HH:mm (opsional / legacy)
  pengajar?: string; // legacy / fallback
  kelompok?: string; // Kelompok sasaran atau 'Semua'
  
  // Format Jurnal Materi Terbaru:
  pemateri1: string;
  alquranMateri: string; // Alquran dari ayat.. - ayat...
  pemateri2: string;
  hadistMateri: string; // Hadist Dari hal...- hal...
  penasehat: string;
  catatan: string;
  tempat: string; // Gamprit, TMII 1, TMII 2

  // Legacy fields untuk kompatibilitas data lama:
  judulMateri?: string;
  babHalaman?: string;
  catatanJurnal?: string;
  tugasRumah?: string;

  totalGenerus: number;
  totalHadir: number;
  totalIzin: number;
  totalSakit: number;
  totalAlpa: number;
  daftarKehadiran: KehadiranDetail[];
  createdAt: string;
}

export interface PengingatHarianConfig {
  aktif: boolean;
  jamPengingat: string; // '17:00' atau '07:00'
  pesanPengingat: string;
  targetNoWaGuru?: string;
  terakhirDikirim?: string;
}

