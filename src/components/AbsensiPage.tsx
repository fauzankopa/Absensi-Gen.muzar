import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { getLocalSesi, saveLocalSesi, syncFirestoreInBackground } from '../storage';
import { 
  Generus, 
  StatusKehadiran, 
  KehadiranDetail, 
  SesiAbsensiDanJurnal, 
  KELOMPOK_OPTIONS, 
  TEMPAT_OPTIONS,
  TempatType,
  KelompokType
} from '../types';
import { 
  CheckCircle2, 
  AlertCircle, 
  BookOpen, 
  Save, 
  Calendar, 
  User, 
  Search, 
  Users, 
  MapPin,
  ArrowUpDown,
  BookText,
  UserCheck,
  ShieldCheck,
  FileEdit,
  Sparkles
} from 'lucide-react';

interface AbsensiPageProps {
  generusList: Generus[];
  onSuccessSave?: () => void;
}

type SortField = 'nama' | 'kelompok' | 'gender';
type SortDirection = 'asc' | 'desc';

export const AbsensiPage: React.FC<AbsensiPageProps> = ({ generusList, onSuccessSave }) => {
  // Tanggal Hari Ini (YYYY-MM-DD)
  const [tanggal, setTanggal] = useState<string>(new Date().toISOString().split('T')[0]);

  // Filter Kelompok: HANYA Gamprit 1, Gamprit 2, TMII 1, TMII 2
  const [filterKelompok, setFilterKelompok] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Fitur Sorting Generus: Nama, Kelompok, atau Gender
  const [sortBy, setSortBy] = useState<SortField>('nama');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Jurnal Materi Guru (Format Terbaru Sesuai Instruksi)
  const [tempat, setTempat] = useState<TempatType>('Gamprit');
  const [pemateri1, setPemateri1] = useState<string>('');
  const [alquranMateri, setAlquranMateri] = useState<string>('');
  const [pemateri2, setPemateri2] = useState<string>('');
  const [hadistMateri, setHadistMateri] = useState<string>('');
  const [penasehat, setPenasehat] = useState<string>('');
  const [catatan, setCatatan] = useState<string>('');

  // Kehadiran Map: generusId -> { status, keterangan }
  const [attendanceMap, setAttendanceMap] = useState<Record<string, { status: StatusKehadiran; keterangan: string }>>({});
  
  // Submit state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [notifSuccess, setNotifSuccess] = useState<string | null>(null);
  const [notifError, setNotifError] = useState<string | null>(null);

  // Filter generus aktif
  const activeGenerus = useMemo(() => generusList.filter(g => g.statusAktif), [generusList]);

  // Initialize attendanceMap saat activeGenerus berubah atau pertama kali load
  useEffect(() => {
    setAttendanceMap(prev => {
      const nextMap = { ...prev };
      activeGenerus.forEach(g => {
        if (!nextMap[g.id]) {
          nextMap[g.id] = { status: 'Hadir', keterangan: '' };
        }
      });
      return nextMap;
    });
  }, [activeGenerus]);

  // Filtered & Sorted generus for view
  const displayGenerus = useMemo(() => {
    // 1. Filter Kelompok & Search
    let list = activeGenerus.filter(g => {
      const matchKelompok = filterKelompok === 'Semua' || g.kelompok.toLowerCase() === filterKelompok.toLowerCase();
      const matchSearch = g.namaLengkap.toLowerCase().includes(searchQuery.toLowerCase());
      return matchKelompok && matchSearch;
    });

    // 2. Sorting (Nama, Kelompok, Gender)
    list.sort((a, b) => {
      let comp = 0;
      if (sortBy === 'nama') {
        comp = a.namaLengkap.localeCompare(b.namaLengkap, 'id');
      } else if (sortBy === 'kelompok') {
        comp = a.kelompok.localeCompare(b.kelompok, 'id');
      } else if (sortBy === 'gender') {
        comp = a.jenisKelamin.localeCompare(b.jenisKelamin, 'id');
      }

      return sortDirection === 'asc' ? comp : -comp;
    });

    return list;
  }, [activeGenerus, filterKelompok, searchQuery, sortBy, sortDirection]);

  // Toggle sorting
  const handleSortToggle = (field: SortField) => {
    if (sortBy === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('asc');
    }
  };

  // Calculate live stats
  let countHadir = 0;
  let countIzin = 0;
  let countSakit = 0;
  let countAlpa = 0;

  activeGenerus.forEach(g => {
    const item = attendanceMap[g.id];
    if (item) {
      if (item.status === 'Hadir') countHadir++;
      else if (item.status === 'Izin') countIzin++;
      else if (item.status === 'Sakit') countSakit++;
      else if (item.status === 'Alpa') countAlpa++;
    } else {
      countHadir++;
    }
  });

  // Set Semua Kehadiran sekaligus
  const setAllStatus = (status: StatusKehadiran) => {
    setAttendanceMap(prev => {
      const updated = { ...prev };
      displayGenerus.forEach(g => {
        updated[g.id] = { ...updated[g.id], status };
      });
      return updated;
    });
  };

  const handleStatusChange = (generusId: string, status: StatusKehadiran) => {
    setAttendanceMap(prev => ({
      ...prev,
      [generusId]: {
        ...(prev[generusId] || { keterangan: '' }),
        status
      }
    }));
  };

  const handleKeteranganChange = (generusId: string, keterangan: string) => {
    setAttendanceMap(prev => ({
      ...prev,
      [generusId]: {
        status: prev[generusId]?.status || 'Hadir',
        keterangan
      }
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pemateri1.trim() && !pemateri2.trim()) {
      setNotifError('Harap mengisi setidaknya Nama Pemateri 1 atau Pemateri 2.');
      window.scrollTo({ top: 300, behavior: 'smooth' });
      return;
    }

    if (!alquranMateri.trim() && !hadistMateri.trim()) {
      setNotifError('Harap cantumkan rincian materi Al-Qur\'an (ayat..) atau Hadist (hal..).');
      return;
    }

    setIsSubmitting(true);
    setNotifError(null);
    setNotifSuccess(null);

    try {
      const daftarKehadiran: KehadiranDetail[] = activeGenerus.map(g => ({
        generusId: g.id,
        generusNama: g.namaLengkap,
        kelompok: g.kelompok,
        status: attendanceMap[g.id]?.status || 'Hadir',
        keterangan: attendanceMap[g.id]?.keterangan || ''
      }));

      // Backward compatible pengajar & judulMateri
      const pengajarString = [pemateri1.trim(), pemateri2.trim()].filter(Boolean).join(' & ');
      const judulMateriString = `Al-Qur'an: ${alquranMateri.trim() || '-'} | Hadist: ${hadistMateri.trim() || '-'}`;

      const newSesi: Omit<SesiAbsensiDanJurnal, 'id'> = {
        tanggal,
        tempat,
        pemateri1: pemateri1.trim(),
        alquranMateri: alquranMateri.trim(),
        pemateri2: pemateri2.trim(),
        hadistMateri: hadistMateri.trim(),
        penasehat: penasehat.trim(),
        catatan: catatan.trim(),
        
        // Kompatibilitas data lama:
        pengajar: pengajarString || 'Guru Pengajar',
        kelompok: filterKelompok === 'Semua' ? 'Semua Kelompok' : filterKelompok,
        judulMateri: judulMateriString,
        babHalaman: hadistMateri.trim(),
        catatanJurnal: catatan.trim(),
        
        totalGenerus: activeGenerus.length,
        totalHadir: countHadir,
        totalIzin: countIzin,
        totalSakit: countSakit,
        totalAlpa: countAlpa,
        daftarKehadiran,
        createdAt: new Date().toISOString()
      };

      // 1. Simpan ke local storage seketika (0ms) agar data kehadiran langsung tersimpan aman
      const localSesi = getLocalSesi();
      const localId = `sesi_${Date.now()}`;
      saveLocalSesi([{ ...newSesi, id: localId } as SesiAbsensiDanJurnal, ...localSesi]);

      setNotifSuccess(`Alhamdulillah! Presensi dan Jurnal Materi pembelajaran berhasil disimpan.`);
      
      // Reset form jurnal
      setAlquranMateri('');
      setHadistMateri('');
      setCatatan('');

      if (onSuccessSave) {
        onSuccessSave();
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });

      // 2. Sync ke Cloud Firestore di background tanpa membuat UI menunggu/loading
      syncFirestoreInBackground(async () => {
        await addDoc(collection(db, 'sesi_absensi'), newSesi);
      });
    } catch (err: any) {
      console.error('Error saving absensi:', err);
      setNotifError(`Gagal menyimpan data: ${err.message || 'Terjadi kesalahan sistem'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="absensi-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Alert Notifications */}
      {notifSuccess && (
        <div id="alert-success" className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="font-medium text-sm">{notifSuccess}</p>
          </div>
          <button 
            onClick={() => setNotifSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 text-sm font-semibold cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {notifError && (
        <div id="alert-error" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <p className="font-medium text-sm">{notifError}</p>
          </div>
          <button 
            onClick={() => setNotifError(null)}
            className="text-rose-700 hover:text-rose-900 text-sm font-semibold cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Top Header Card */}
      <div id="absensi-header-card" className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 pb-6 border-b border-slate-100">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FDF2F2] border border-[#F2CECF] text-[#A83236] text-xs font-semibold mb-2">
              <span className="w-2 h-2 rounded-full bg-[#A83236] animate-pulse"></span>
              Pencatatan Presensi Guru Real-time
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Absensi Generus & Jurnal Materi
            </h1>
            <p className="text-slate-600 text-sm sm:text-base mt-1">
              Catat kehadiran generus dan dokumentasikan jurnal materi pengajaran secara langsung.
            </p>
          </div>

          {/* Quick Counter Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-emerald-50/80 border border-emerald-100 rounded-xl p-3 text-center">
              <span className="text-xs font-medium text-emerald-800 uppercase tracking-wider block">Hadir</span>
              <span className="text-2xl font-bold text-emerald-700">{countHadir}</span>
            </div>
            <div className="bg-blue-50/80 border border-blue-100 rounded-xl p-3 text-center">
              <span className="text-xs font-medium text-blue-800 uppercase tracking-wider block">Izin</span>
              <span className="text-2xl font-bold text-blue-700">{countIzin}</span>
            </div>
            <div className="bg-amber-50/80 border border-amber-100 rounded-xl p-3 text-center">
              <span className="text-xs font-medium text-amber-800 uppercase tracking-wider block">Sakit</span>
              <span className="text-2xl font-bold text-amber-700">{countSakit}</span>
            </div>
            <div className="bg-rose-50/80 border border-rose-100 rounded-xl p-3 text-center">
              <span className="text-xs font-medium text-rose-800 uppercase tracking-wider block">Alpa</span>
              <span className="text-2xl font-bold text-rose-700">{countAlpa}</span>
            </div>
          </div>
        </div>

        {/* Filter & Tanggal Section (Kolom Waktu Dihilangkan) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Tanggal Presensi
            </label>
            <div className="relative">
              <input
                id="input-tanggal-absensi"
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden focus:bg-white transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Filter Kelompok
            </label>
            <select
              id="select-filter-kelompok-absensi"
              value={filterKelompok}
              onChange={(e) => setFilterKelompok(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden focus:bg-white transition-all font-medium"
            >
              <option value="Semua">Semua Kelompok ({activeGenerus.length} Generus)</option>
              {KELOMPOK_OPTIONS.map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col justify-end">
            <span className="text-xs text-slate-600 mb-1.5">Status Filter Tampil:</span>
            <div className="px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm font-semibold text-slate-800 flex items-center justify-between">
              <span>{displayGenerus.length} Generus Terpilih</span>
              <span className="text-xs font-normal text-slate-500">dari {activeGenerus.length} aktif</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Daftar Kehadiran (Kiri) & Jurnal Materi Form (Kanan) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Kolom Kiri: Tabel Presensi Generus */}
        <div id="panel-kehadiran" className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-[#A83236]" />
                Daftar Generus ({displayGenerus.length})
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">Tentukan status kehadiran tiap generus</p>
            </div>

            {/* Quick Bulk Action */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600 font-medium">Setel Semua:</span>
              <button
                type="button"
                id="btn-set-all-hadir"
                onClick={() => setAllStatus('Hadir')}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors cursor-pointer"
              >
                Hadir
              </button>
              <button
                type="button"
                id="btn-set-all-izin"
                onClick={() => setAllStatus('Izin')}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors cursor-pointer"
              >
                Izin
              </button>
            </div>
          </div>

          {/* Search Bar & Sorting Controls */}
          <div className="p-4 bg-slate-50/80 border-b border-slate-100 space-y-3">
            <div className="flex items-center gap-3 bg-white px-3 py-2 rounded-xl border border-slate-200">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                id="input-cari-generus-absensi"
                type="text"
                placeholder="Cari nama generus..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-slate-500 hover:text-slate-700 font-semibold cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Tombol Pengurutan: Nama, Kelompok, Gender */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-600 flex items-center gap-1">
                <ArrowUpDown className="w-3.5 h-3.5 text-[#A83236]" />
                Urutkan Berdasarkan:
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  id="btn-sort-nama"
                  onClick={() => handleSortToggle('nama')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                    sortBy === 'nama'
                      ? 'bg-[#A83236] text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Nama {sortBy === 'nama' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </button>

                <button
                  type="button"
                  id="btn-sort-kelompok"
                  onClick={() => handleSortToggle('kelompok')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                    sortBy === 'kelompok'
                      ? 'bg-[#A83236] text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Kelompok {sortBy === 'kelompok' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </button>

                <button
                  type="button"
                  id="btn-sort-gender"
                  onClick={() => handleSortToggle('gender')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                    sortBy === 'gender'
                      ? 'bg-[#A83236] text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Gender {sortBy === 'gender' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </button>
              </div>
            </div>
          </div>

          {/* Generus List Container (Nama Bapak dan Status Dihilangkan) */}
          <div className="divide-y divide-slate-100 max-h-[620px] overflow-y-auto">
            {displayGenerus.length === 0 ? (
              <div className="p-12 text-center text-slate-600">
                <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-semibold text-slate-800">
                  {generusList.length === 0
                    ? 'Belum ada data generus di database (0 Generus).'
                    : 'Tidak ada generus yang sesuai filter / pencarian.'}
                </p>
                {generusList.length === 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    Silakan tambahkan data generus baru atau unggah file Excel di tab "Data Generus".
                  </p>
                )}
              </div>
            ) : (
              displayGenerus.map((generus, idx) => {
                const cur = attendanceMap[generus.id] || { status: 'Hadir', keterangan: '' };
                return (
                  <div 
                    key={generus.id}
                    id={`generus-row-${generus.id}`}
                    className="p-4 hover:bg-slate-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-medium text-slate-500">{idx + 1}.</span>
                        <h3 className="text-sm font-bold text-slate-900">{generus.namaLengkap}</h3>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 rounded-md bg-[#FDF2F2] border border-[#F2CECF] text-[#A83236] font-semibold text-[11px]">
                          {generus.kelompok}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium">
                          {generus.jenisKelamin}
                        </span>
                      </div>

                      {/* Input Keterangan Jika Sakit/Izin/Alpa */}
                      {cur.status !== 'Hadir' && (
                        <div className="pt-1">
                          <input
                            type="text"
                            placeholder="Catatan (alasan sakit/izin/keterangan)..."
                            value={cur.keterangan || ''}
                            onChange={(e) => handleKeteranganChange(generus.id, e.target.value)}
                            className="text-xs px-2.5 py-1 bg-white border border-slate-200 rounded-lg w-full max-w-sm text-slate-700 placeholder-slate-400 focus:outline-[#A83236]"
                          />
                        </div>
                      )}
                    </div>

                    {/* Status Toggle Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-center">
                      <button
                        type="button"
                        id={`btn-status-hadir-${generus.id}`}
                        onClick={() => handleStatusChange(generus.id, 'Hadir')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          cur.status === 'Hadir'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
                        }`}
                      >
                        Hadir
                      </button>

                      <button
                        type="button"
                        id={`btn-status-izin-${generus.id}`}
                        onClick={() => handleStatusChange(generus.id, 'Izin')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          cur.status === 'Izin'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700'
                        }`}
                      >
                        Izin
                      </button>

                      <button
                        type="button"
                        id={`btn-status-sakit-${generus.id}`}
                        onClick={() => handleStatusChange(generus.id, 'Sakit')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          cur.status === 'Sakit'
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-amber-50 hover:text-amber-700'
                        }`}
                      >
                        Sakit
                      </button>

                      <button
                        type="button"
                        id={`btn-status-alpa-${generus.id}`}
                        onClick={() => handleStatusChange(generus.id, 'Alpa')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          cur.status === 'Alpa'
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700'
                        }`}
                      >
                        Alpa
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Kolom Kanan: Jurnal Materi Pengajaran (Format Terbaru) */}
        <div id="panel-jurnal-materi" className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-5 sticky top-24">
          <div className="border-b border-slate-100 pb-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#A83236]" />
                Jurnal Materi Pembelajaran
              </h2>
              <span className="text-[11px] font-semibold px-2 py-0.5 bg-[#FDF2F2] text-[#A83236] rounded-md">
                Wajib Diisi Guru
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Catat pemateri, ayat Al-Qur'an, rujukan Hadist, nasihat, dan tempat kegiatan.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Tempat Kegiatan */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#A83236]" />
                Tempat Kegiatan *
              </label>
              <div className="grid grid-cols-3 gap-2">
                {TEMPAT_OPTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTempat(t)}
                    className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-all text-center cursor-pointer ${
                      tempat === t
                        ? 'bg-[#A83236] text-white border-[#A83236] shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Pemateri 1 & Al-Qur'an */}
            <div className="p-3.5 bg-slate-50/90 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#A83236]">
                <UserCheck className="w-4 h-4" />
                <span>Sesi 1: Materi Al-Qur'an</span>
              </div>
              
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Pemateri 1 *
                </label>
                <input
                  id="input-pemateri-1"
                  type="text"
                  required
                  placeholder="Contoh: Ust. Ahmad Fauzan"
                  value={pemateri1}
                  onChange={(e) => setPemateri1(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Al-Qur'an (Dari Ayat.. - Ayat..) *
                </label>
                <input
                  id="input-alquran-materi"
                  type="text"
                  required
                  placeholder="Contoh: Surat Al-Baqarah ayat 1 - 15"
                  value={alquranMateri}
                  onChange={(e) => setAlquranMateri(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden"
                />
              </div>
            </div>

            {/* Pemateri 2 & Hadist */}
            <div className="p-3.5 bg-slate-50/90 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#A83236]">
                <BookText className="w-4 h-4" />
                <span>Sesi 2: Materi Hadist</span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Pemateri 2
                </label>
                <input
                  id="input-pemateri-2"
                  type="text"
                  placeholder="Contoh: Ust. Rizky Pratama"
                  value={pemateri2}
                  onChange={(e) => setPemateri2(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Hadist (Dari Hal.. - Hal..)
                </label>
                <input
                  id="input-hadist-materi"
                  type="text"
                  placeholder="Contoh: Kitab Himpunan Thaharah hal 14 - 18"
                  value={hadistMateri}
                  onChange={(e) => setHadistMateri(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden"
                />
              </div>
            </div>

            {/* Penasehat */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#A83236]" />
                Penasehat
              </label>
              <input
                id="input-penasehat"
                type="text"
                placeholder="Contoh: Bpk. H. Bambang Muzammil"
                value={penasehat}
                onChange={(e) => setPenasehat(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden focus:bg-white transition-all"
              />
            </div>

            {/* Catatan */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <FileEdit className="w-3.5 h-3.5 text-[#A83236]" />
                Catatan
              </label>
              <textarea
                id="textarea-catatan"
                rows={3}
                placeholder="Tuliskan evaluasi pembelajaran, keaktifan generus, atau catatan penting lainnya..."
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden focus:bg-white transition-all"
              />
            </div>

            {/* Ringkasan Jumlah yang akan disimpan */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5 text-slate-600">
              <div className="flex justify-between">
                <span>Tanggal & Tempat:</span>
                <span className="font-semibold text-slate-800">{tanggal} di {tempat}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Generus:</span>
                <span className="font-semibold text-slate-800">{activeGenerus.length} Orang</span>
              </div>
              <div className="flex justify-between">
                <span>Rasio Kehadiran:</span>
                <span className="font-semibold text-emerald-700">
                  {activeGenerus.length > 0 ? `${((countHadir / activeGenerus.length) * 100).toFixed(0)}% (${countHadir} hadir)` : '0%'}
                </span>
              </div>
            </div>

            <button
              type="submit"
              id="btn-simpan-absensi-jurnal"
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-[#A83236] hover:bg-[#92272B] active:bg-[#7A1F22] disabled:bg-slate-300 text-white font-semibold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Menyimpan ke Cloud...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Simpan Absensi & Jurnal Materi
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
