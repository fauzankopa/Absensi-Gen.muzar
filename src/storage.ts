import { Generus, SesiAbsensiDanJurnal, PengingatHarianConfig } from './types';

const GENERUS_KEY = 'muzar_generus_data_v1';
const SESI_KEY = 'muzar_sesi_absensi_v1';
const PENGATURAN_KEY = 'muzar_pengaturan_v1';

// Event nama untuk sinkronisasi state antar komponen secara instan
export const DATA_UPDATED_EVENT = 'muzar_data_updated';

export function notifyDataUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DATA_UPDATED_EVENT));
  }
}

// 1. GENERUS STORAGE
export function getLocalGenerus(): Generus[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(GENERUS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error reading local generus:', err);
    return [];
  }
}

export function saveLocalGenerus(list: Generus[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GENERUS_KEY, JSON.stringify(list));
    notifyDataUpdated();
  } catch (err) {
    console.error('Error saving local generus:', err);
  }
}

// 2. SESI ABSENSI STORAGE
export function getLocalSesi(): SesiAbsensiDanJurnal[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SESI_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error reading local sesi:', err);
    return [];
  }
}

export function saveLocalSesi(list: SesiAbsensiDanJurnal[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SESI_KEY, JSON.stringify(list));
    notifyDataUpdated();
  } catch (err) {
    console.error('Error saving local sesi:', err);
  }
}

// 3. PENGATURAN STORAGE
export function getLocalPengaturan(): PengingatHarianConfig {
  const defaultCfg: PengingatHarianConfig = {
    aktif: true,
    jamPengingat: '17:00',
    pesanPengingat: `Assalamu'alaikum Wr. Wb. Pengingat Harian: Kepada Bapak/Ibu Guru pengajar, mohon untuk mengisi Presensi Kehadiran Generus dan Jurnal Materi pembelajaran hari ini di aplikasi Absensi Gen.muzar. Terima kasih.`
  };
  if (typeof window === 'undefined') return defaultCfg;
  try {
    const raw = localStorage.getItem(PENGATURAN_KEY);
    if (!raw) return defaultCfg;
    return { ...defaultCfg, ...JSON.parse(raw) };
  } catch (err) {
    return defaultCfg;
  }
}

export function saveLocalPengaturan(cfg: PengingatHarianConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PENGATURAN_KEY, JSON.stringify(cfg));
    notifyDataUpdated();
  } catch (err) {
    console.error('Error saving local pengaturan:', err);
  }
}

// 4. SMART MERGE GENERUS IMPORT
export function mergeAndSaveGenerus(
  incoming: Omit<Generus, 'id'>[],
  mode: 'append' | 'replace'
): { total: number; added: number; updated: number; currentList: Generus[] } {
  const existingList = getLocalGenerus();
  let addedCount = 0;
  let updatedCount = 0;
  let resultList: Generus[] = [];

  const sanitizeItem = (item: any) => ({
    namaLengkap: String(item.namaLengkap || '').trim(),
    jenisKelamin: item.jenisKelamin === 'Perempuan' ? ('Perempuan' as const) : ('Laki-laki' as const),
    tempatLahir: String(item.tempatLahir || '-').trim(),
    tanggalLahir: String(item.tanggalLahir || '2005-01-01').trim(),
    umur: typeof item.umur === 'number' && !isNaN(item.umur) ? item.umur : 0,
    usia: typeof item.usia === 'number' && !isNaN(item.usia) ? item.usia : (typeof item.umur === 'number' && !isNaN(item.umur) ? item.umur : 0),
    statusKerja: item.statusKerja || 'Pelajar / Mahasiswa',
    kelompok: String(item.kelompok || 'Gamprit 1').trim(),
    noTelpon: String(item.noTelpon || '-').trim(),
    namaBapak: String(item.namaBapak || '-').trim(),
    statusAktif: item.statusAktif !== false,
    updatedAt: new Date().toISOString()
  });

  if (mode === 'replace') {
    resultList = incoming.map((item, idx) => ({
      ...sanitizeItem(item),
      id: `gen_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString()
    }));
    addedCount = resultList.length;
  } else {
    // Mode 'append' aman: cocokkan nama agar tidak terjadi duplikat dan ID tetap konsisten
    const existingMap = new Map<string, Generus>();
    existingList.forEach(g => {
      if (g.namaLengkap) {
        existingMap.set(g.namaLengkap.trim().toLowerCase(), g);
      }
    });

    resultList = [...existingList];

    incoming.forEach((item, idx) => {
      const clean = sanitizeItem(item);
      const normName = clean.namaLengkap.toLowerCase();
      const existing = existingMap.get(normName);

      if (existing) {
        // Update data profil generus yang ada
        const index = resultList.findIndex(g => g.id === existing.id);
        if (index !== -1) {
          resultList[index] = {
            ...resultList[index],
            ...clean
          };
          updatedCount++;
        }
      } else {
        // Tambahkan generus baru
        const newGen: Generus = {
          ...clean,
          id: `gen_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
          createdAt: new Date().toISOString()
        };
        resultList.push(newGen);
        existingMap.set(normName, newGen);
        addedCount++;
      }
    });
  }

  // Urutkan alfabetis berdasarkan nama
  resultList.sort((a, b) => a.namaLengkap.localeCompare(b.namaLengkap));

  // Simpan secara instan ke local storage
  saveLocalGenerus(resultList);

  return {
    total: incoming.length,
    added: addedCount,
    updated: updatedCount,
    currentList: resultList
  };
}

// 5. HELPER UNTUK FIRESTORE DENGAN SAFETY TIMEOUT
export async function runFirestoreWithTimeout<T>(
  promiseFn: () => Promise<T>,
  timeoutMs: number = 4000
): Promise<{ success: boolean; data?: T; error?: string }> {
  let timeoutHandle: any;
  const timeoutPromise = new Promise<{ success: boolean; error: string }>((resolve) => {
    timeoutHandle = setTimeout(() => {
      resolve({ success: false, error: 'Koneksi Cloud Firestore timeout (berjalan dalam mode penyimpanan aman lokal)' });
    }, timeoutMs);
  });

  const execPromise = (async () => {
    try {
      const res = await promiseFn();
      clearTimeout(timeoutHandle);
      return { success: true, data: res };
    } catch (err: any) {
      clearTimeout(timeoutHandle);
      return { success: false, error: err.message || 'Firestore error' };
    }
  })();

  return Promise.race([execPromise, timeoutPromise]);
}

// 6. HELPER SINKRONISASI BACKGROUND (NON-BLOCKING)
// Memastikan UI aplikasi 100% responsif tanpa jeda/loading, sementara sync ke cloud berjalan di latar belakang
export function syncFirestoreInBackground(task: () => Promise<any>): void {
  setTimeout(async () => {
    try {
      await runFirestoreWithTimeout(task, 4000);
    } catch (err: any) {
      console.warn('Background Cloud Firestore sync notice (data lokal aman):', err?.message || err);
    }
  }, 10);
}
