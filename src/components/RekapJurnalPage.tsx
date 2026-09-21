import React, { useState, useMemo } from 'react';
import { SesiAbsensiDanJurnal, TEMPAT_OPTIONS, TempatType } from '../types';
import { exportJurnalToPDF, exportJurnalToExcel } from '../exportUtils';
import { 
  BookText, 
  Search, 
  Download, 
  FileText, 
  FileSpreadsheet, 
  Filter, 
  UserCheck, 
  Calendar, 
  ChevronRight,
  BookOpen,
  MapPin,
  ShieldCheck,
  FileEdit,
  X
} from 'lucide-react';

interface RekapJurnalPageProps {
  sesiList: SesiAbsensiDanJurnal[];
  onOpenGoogleSheets?: () => void;
}

export const RekapJurnalPage: React.FC<RekapJurnalPageProps> = ({ sesiList, onOpenGoogleSheets }) => {
  // Filter States
  const [filterPengajar, setFilterPengajar] = useState<string>('Semua');
  const [filterTempat, setFilterTempat] = useState<string>('Semua');
  const [filterTanggalMulai, setFilterTanggalMulai] = useState<string>('');
  const [filterTanggalAkhir, setFilterTanggalAkhir] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Selected detail modal / drawer
  const [selectedSesi, setSelectedSesi] = useState<SesiAbsensiDanJurnal | null>(null);

  // List unique pengajar/pemateri
  const pengajarOptions = useMemo(() => {
    const set = new Set<string>();
    sesiList.forEach(s => {
      if (s.pemateri1) set.add(s.pemateri1);
      if (s.pemateri2) set.add(s.pemateri2);
      if (s.pengajar && !s.pemateri1) set.add(s.pengajar);
    });
    return Array.from(set).filter(Boolean);
  }, [sesiList]);

  // Filtered session list
  const filteredSesiList = useMemo(() => {
    return sesiList.filter(s => {
      // Filter Pengajar / Pemateri
      let matchPengajar = true;
      if (filterPengajar !== 'Semua') {
        const p1 = s.pemateri1?.toLowerCase() || '';
        const p2 = s.pemateri2?.toLowerCase() || '';
        const legacyP = s.pengajar?.toLowerCase() || '';
        const target = filterPengajar.toLowerCase();
        matchPengajar = p1.includes(target) || p2.includes(target) || legacyP.includes(target);
      }

      // Filter Tempat
      let matchTempat = true;
      if (filterTempat !== 'Semua') {
        matchTempat = s.tempat === filterTempat || (!s.tempat && filterTempat === 'Gamprit');
      }

      // Filter Tanggal
      let matchTanggal = true;
      if (filterTanggalMulai && s.tanggal < filterTanggalMulai) {
        matchTanggal = false;
      }
      if (filterTanggalAkhir && s.tanggal > filterTanggalAkhir) {
        matchTanggal = false;
      }

      // Filter Search Query
      let matchQuery = true;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        matchQuery = Boolean(
          (s.alquranMateri && s.alquranMateri.toLowerCase().includes(q)) ||
          (s.hadistMateri && s.hadistMateri.toLowerCase().includes(q)) ||
          (s.catatan && s.catatan.toLowerCase().includes(q)) ||
          (s.penasehat && s.penasehat.toLowerCase().includes(q)) ||
          (s.judulMateri && s.judulMateri.toLowerCase().includes(q)) ||
          (s.catatanJurnal && s.catatanJurnal.toLowerCase().includes(q)) ||
          (s.pemateri1 && s.pemateri1.toLowerCase().includes(q)) ||
          (s.pemateri2 && s.pemateri2.toLowerCase().includes(q))
        );
      }

      return matchPengajar && matchTempat && matchTanggal && matchQuery;
    });
  }, [sesiList, filterPengajar, filterTempat, filterTanggalMulai, filterTanggalAkhir, searchQuery]);

  // Export handlers
  const handleExportPDF = () => {
    exportJurnalToPDF(filteredSesiList, {
      pengajar: filterPengajar !== 'Semua' ? filterPengajar : undefined,
      tempat: filterTempat !== 'Semua' ? filterTempat : undefined,
      tanggalMulai: filterTanggalMulai || undefined,
      tanggalAkhir: filterTanggalAkhir || undefined
    });
  };

  const handleExportExcel = () => {
    exportJurnalToExcel(filteredSesiList);
  };

  const handleResetFilter = () => {
    setFilterPengajar('Semua');
    setFilterTempat('Semua');
    setFilterTanggalMulai('');
    setFilterTanggalAkhir('');
    setSearchQuery('');
  };

  return (
    <div id="rekap-jurnal-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header Card */}
      <div id="rekap-jurnal-header-card" className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FDF2F2] border border-[#F2CECF] text-[#A83236] text-xs font-semibold mb-2">
              <BookText className="w-3.5 h-3.5 text-[#A83236]" />
              Arsip Pembelajaran Harian Terpusat
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Rekap Jurnal Materi Pengajaran
            </h1>
            <p className="text-slate-600 text-sm mt-1">
              Catatan materi Al-Qur'an, Hadist, Pemateri, Penasehat, Catatan, dan Tempat kegiatan yang dapat difilter dan diunduh.
            </p>
          </div>

          {/* Export Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {onOpenGoogleSheets && (
              <button
                id="btn-open-sheets-sync-jurnal"
                type="button"
                onClick={onOpenGoogleSheets}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
                title="Sinkronkan rekap jurnal langsung ke Google Spreadsheet"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Google Sheets Otomatis</span>
              </button>
            )}
            <button
              id="btn-export-jurnal-pdf"
              onClick={handleExportPDF}
              disabled={filteredSesiList.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#A83236] hover:bg-[#92272B] active:bg-[#7A1F22] disabled:bg-slate-300 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              Unduh Jurnal PDF
            </button>
            <button
              id="btn-export-jurnal-excel"
              onClick={handleExportExcel}
              disabled={filteredSesiList.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 disabled:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-500" />
              Unduh Excel (.xlsx)
            </button>
          </div>
        </div>

        {/* Filter Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Tempat Kegiatan
            </label>
            <select
              id="select-filter-tempat"
              value={filterTempat}
              onChange={(e) => setFilterTempat(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden focus:bg-white"
            >
              <option value="Semua">Semua Tempat</option>
              {TEMPAT_OPTIONS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Guru / Pemateri
            </label>
            <select
              id="select-filter-guru"
              value={filterPengajar}
              onChange={(e) => setFilterPengajar(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden focus:bg-white"
            >
              <option value="Semua">Semua Pengajar ({sesiList.length} Sesi)</option>
              {pengajarOptions.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Mulai Tanggal
            </label>
            <input
              id="input-filter-tgl-mulai"
              type="date"
              value={filterTanggalMulai}
              onChange={(e) => setFilterTanggalMulai(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Sampai Tanggal
            </label>
            <input
              id="input-filter-tgl-akhir"
              type="date"
              value={filterTanggalAkhir}
              onChange={(e) => setFilterTanggalAkhir(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Cari Topik / Catatan
            </label>
            <div className="relative">
              <input
                id="input-search-materi"
                type="text"
                placeholder="Cari materi / ayat..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* Filter Summary & Reset */}
        {(filterPengajar !== 'Semua' || filterTempat !== 'Semua' || filterTanggalMulai || filterTanggalAkhir || searchQuery) && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 text-xs">
            <span className="text-slate-600">
              Menampilkan <span className="font-semibold text-[#A83236]">{filteredSesiList.length}</span> dari {sesiList.length} total jurnal tersimpan.
            </span>
            <button
              onClick={handleResetFilter}
              className="text-[#A83236] hover:text-[#92272B] font-semibold underline cursor-pointer"
            >
              Reset Semua Filter
            </button>
          </div>
        )}
      </div>

      {/* List Rekap Jurnal Cards */}
      <div className="space-y-4">
        {filteredSesiList.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center text-slate-600 border border-slate-200">
            <BookOpen className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <h3 className="text-base font-semibold text-slate-800">Tidak ada jurnal materi yang cocok</h3>
            <p className="text-xs text-slate-600 mt-1">
              Coba sesuaikan filter tempat, pengajar, rentang tanggal, atau lakukan pencatatan jurnal baru.
            </p>
          </div>
        ) : (
          filteredSesiList.map((sesi) => (
            <div
              key={sesi.id}
              id={`jurnal-card-${sesi.id}`}
              className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs hover:border-[#F2CECF] hover:shadow-sm transition-all"
            >
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                <div className="space-y-4 flex-1">
                  {/* Badge Header: Tanggal, Tempat, Kelompok */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-1 rounded-md bg-[#FDF2F2] border border-[#F2CECF] text-[#A83236] text-xs font-bold">
                      {sesi.tanggal}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 font-semibold">
                      <MapPin className="w-3.5 h-3.5 text-[#A83236]" />
                      Tempat: {sesi.tempat || 'Gamprit'}
                    </span>
                    {sesi.penasehat && (
                      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                        Penasehat: {sesi.penasehat}
                      </span>
                    )}
                  </div>

                  {/* Grid 2 Materi: Al-Qur'an & Hadist */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {/* Al-Qur'an Box */}
                    <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-100/80">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 mb-1">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Al-Qur'an</span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900">
                        {sesi.alquranMateri || sesi.judulMateri || 'Materi Al-Qur\'an'}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        Pemateri 1: <span className="font-semibold text-slate-800">{sesi.pemateri1 || sesi.pengajar || '-'}</span>
                      </div>
                    </div>

                    {/* Hadist Box */}
                    <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100/80">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-blue-800 mb-1">
                        <BookText className="w-3.5 h-3.5" />
                        <span>Hadist</span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900">
                        {sesi.hadistMateri || sesi.babHalaman || 'Materi Hadist'}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        Pemateri 2: <span className="font-semibold text-slate-800">{sesi.pemateri2 || '-'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Catatan Jurnal */}
                  {(sesi.catatan || sesi.catatanJurnal) && (
                    <div className="text-sm text-slate-700 bg-slate-50/80 p-3.5 rounded-xl border border-slate-100 leading-relaxed">
                      <span className="font-semibold text-xs text-slate-500 uppercase tracking-wider block mb-1">
                        Catatan Kegiatan:
                      </span>
                      {sesi.catatan || sesi.catatanJurnal}
                    </div>
                  )}
                </div>

                {/* Sidebar Ringkasan Absensi Sesi Ini */}
                <div className="lg:w-64 shrink-0 bg-slate-50/80 rounded-xl p-4 border border-slate-100 flex flex-col justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block mb-2">
                      Kehadiran Generus
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white p-2 rounded-lg border border-slate-100 text-center">
                        <span className="text-slate-500 block text-[10px]">Hadir</span>
                        <span className="font-bold text-emerald-700 text-sm">{sesi.totalHadir}</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-100 text-center">
                        <span className="text-slate-500 block text-[10px]">Izin</span>
                        <span className="font-bold text-blue-700 text-sm">{sesi.totalIzin}</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-100 text-center">
                        <span className="text-slate-500 block text-[10px]">Sakit</span>
                        <span className="font-bold text-amber-700 text-sm">{sesi.totalSakit}</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-100 text-center">
                        <span className="text-slate-500 block text-[10px]">Alpa</span>
                        <span className="font-bold text-rose-700 text-sm">{sesi.totalAlpa}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedSesi(sesi)}
                    className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-[#A83236] hover:bg-[#92272B] active:bg-[#7A1F22] text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Rincian Absen</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal / Dialog Detail Daftar Hadir Sesi */}
      {selectedSesi && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Rincian Presensi Sesi: {selectedSesi.tanggal}
                </h3>
                <p className="text-xs text-slate-600">
                  Tempat: {selectedSesi.tempat || 'Gamprit'} • Pemateri: {selectedSesi.pemateri1 || selectedSesi.pengajar || '-'}
                </p>
              </div>
              <button
                onClick={() => setSelectedSesi(null)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 divide-y divide-slate-100">
              {selectedSesi.daftarKehadiran && selectedSesi.daftarKehadiran.length > 0 ? (
                selectedSesi.daftarKehadiran.map((k, i) => (
                  <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-slate-900">{k.generusNama}</span>
                      <span className="text-slate-500 ml-2">({k.kelompok})</span>
                      {k.keterangan && (
                        <p className="text-slate-600 text-[11px] italic mt-0.5">Ket: {k.keterangan}</p>
                      )}
                    </div>
                    <div>
                      <span
                        className={`px-2 py-0.5 rounded-full font-semibold ${
                          k.status === 'Hadir'
                            ? 'bg-emerald-100 text-emerald-800'
                            : k.status === 'Izin'
                            ? 'bg-blue-100 text-blue-800'
                            : k.status === 'Sakit'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {k.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-slate-600 text-xs py-4">Data rincian individu tidak tersedia.</p>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedSesi(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
