import React, { useState, useMemo } from 'react';
import { SesiAbsensiDanJurnal, Generus, KELOMPOK_OPTIONS } from '../types';
import { 
  exportPerformaKehadiranPDF, 
  exportPerformaKehadiranExcel,
  captureElementAsImage 
} from '../exportUtils';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { 
  TrendingUp, 
  Calendar, 
  FileSpreadsheet, 
  FileText, 
  Award, 
  UserX, 
  CheckCircle2, 
  PieChart as PieChartIcon, 
  BarChart3, 
  LineChart as LineChartIcon,
  Users,
  Loader2,
  Image as ImageIcon,
  AlertCircle
} from 'lucide-react';

interface GrafikPerformaPageProps {
  sesiList: SesiAbsensiDanJurnal[];
  generusList: Generus[];
}

type TabGrafik = 'antar_kelompok' | 'per_kelompok' | 'keseluruhan';
type TipeDiagram = 'batang' | 'garis' | 'lingkaran';

const WARNA_STATUS = {
  Hadir: '#10B981', // Emerald
  Izin: '#3B82F6',  // Blue
  Sakit: '#F59E0B', // Amber
  Alpa: '#EF4444',  // Red
  Brand: '#A83236'  // Muzar Crimson
};

const WARNA_KELOMPOK = ['#A83236', '#2563EB', '#059669', '#D97706'];

export const GrafikPerformaPage: React.FC<GrafikPerformaPageProps> = ({ sesiList, generusList }) => {
  // Filter Periode Bulan & Tahun
  const now = new Date();
  const [selectedBulan, setSelectedBulan] = useState<number>(now.getMonth());
  const [selectedTahun, setSelectedTahun] = useState<number>(now.getFullYear());

  // Tab Tampilan Grafik & Tipe Diagram
  const [activeTab, setActiveTab] = useState<TabGrafik>('antar_kelompok');
  const [tipeDiagram, setTipeDiagram] = useState<TipeDiagram>('batang');
  const [selectedKelompokDetail, setSelectedKelompokDetail] = useState<string>('Gamprit 1');

  // Export Loading States
  const [isExportingPDF, setIsExportingPDF] = useState<boolean>(false);
  const [isExportingPNG, setIsExportingPNG] = useState<boolean>(false);

  // Daftar Nama Bulan Bahasa Indonesia
  const daftarBulan = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  // Filter Sesi Berdasarkan Bulan & Tahun Terpilih
  const monthlySessions = useMemo(() => {
    return sesiList.filter(sesi => {
      if (!sesi.tanggal) return false;
      const [yearStr, monthStr] = sesi.tanggal.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10) - 1; // 0-indexed
      return year === selectedTahun && month === selectedBulan;
    });
  }, [sesiList, selectedBulan, selectedTahun]);

  // Statistik Keseluruhan
  const overallStats = useMemo(() => {
    const totalSesi = monthlySessions.length;
    let totalHadir = 0;
    let totalIzin = 0;
    let totalSakit = 0;
    let totalAlpa = 0;
    let totalKehadiranRecord = 0;

    monthlySessions.forEach(sesi => {
      sesi.daftarKehadiran.forEach(d => {
        totalKehadiranRecord++;
        if (d.status === 'Hadir') totalHadir++;
        else if (d.status === 'Izin') totalIzin++;
        else if (d.status === 'Sakit') totalSakit++;
        else if (d.status === 'Alpa') totalAlpa++;
      });
    });

    const rataRataHadir = totalKehadiranRecord > 0 
      ? (totalHadir / totalKehadiranRecord) * 100 
      : 0;

    const totalGenerus = generusList.filter(g => g.statusAktif).length;

    return {
      totalSesi,
      totalHadir,
      totalIzin,
      totalSakit,
      totalAlpa,
      totalKehadiranRecord,
      rataRataHadir,
      totalGenerus
    };
  }, [monthlySessions, generusList]);

  // Rekapitulasi Performa Masing-Masing Generus di Bulan Ini
  const generusPerformanceList = useMemo(() => {
    const statsMap = new Map<string, { hadir: number; izin: number; sakit: number; alpa: number }>();

    monthlySessions.forEach(sesi => {
      sesi.daftarKehadiran.forEach(d => {
        const prev = statsMap.get(d.generusId) || { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
        if (d.status === 'Hadir') prev.hadir++;
        else if (d.status === 'Izin') prev.izin++;
        else if (d.status === 'Sakit') prev.sakit++;
        else if (d.status === 'Alpa') prev.alpa++;
        statsMap.set(d.generusId, prev);
      });
    });

    return generusList
      .filter(g => g.statusAktif)
      .map(g => {
        const item = statsMap.get(g.id) || { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
        const total = item.hadir + item.izin + item.sakit + item.alpa;
        const persenHadir = total > 0 ? (item.hadir / total) * 100 : 0;

        return {
          id: g.id,
          nama: g.namaLengkap,
          kelompok: g.kelompok,
          gender: g.jenisKelamin,
          hadir: item.hadir,
          izin: item.izin,
          sakit: item.sakit,
          alpa: item.alpa,
          totalSesi: total,
          persenHadir
        };
      })
      .sort((a, b) => b.persenHadir - a.persenHadir);
  }, [monthlySessions, generusList]);

  // Top 5 Generus Paling Disiplin
  const topGenerusList = useMemo(() => {
    return generusPerformanceList.filter(g => g.hadir > 0).slice(0, 5);
  }, [generusPerformanceList]);

  // Generus yang Memerlukan Evaluasi (<60% hadir & pernah absen)
  const lowAttendanceList = useMemo(() => {
    return generusPerformanceList
      .filter(g => g.totalSesi > 0 && g.persenHadir < 60)
      .slice(0, 5);
  }, [generusPerformanceList]);

  // 1. Data Grafik Keseluruhan Generus
  const dataPieKeseluruhan = useMemo(() => {
    return [
      { name: 'Hadir', value: overallStats.totalHadir, color: WARNA_STATUS.Hadir },
      { name: 'Izin', value: overallStats.totalIzin, color: WARNA_STATUS.Izin },
      { name: 'Sakit', value: overallStats.totalSakit, color: WARNA_STATUS.Sakit },
      { name: 'Alpa', value: overallStats.totalAlpa, color: WARNA_STATUS.Alpa }
    ].filter(d => d.value > 0);
  }, [overallStats]);

  const dataBarKeseluruhanPerSesi = useMemo(() => {
    return monthlySessions.map(sesi => {
      const persen = sesi.totalGenerus > 0 ? Math.round((sesi.totalHadir / sesi.totalGenerus) * 100) : 0;
      return {
        tanggal: sesi.tanggal.slice(5), // MM-DD
        tanggalFull: sesi.tanggal,
        pemateri: sesi.pemateri1 || sesi.pengajar,
        tempat: sesi.tempat || 'Gamprit',
        Hadir: sesi.totalHadir,
        Izin: sesi.totalIzin,
        Sakit: sesi.totalSakit,
        Alpa: sesi.totalAlpa,
        persentase: persen
      };
    });
  }, [monthlySessions]);

  // 2. Data Grafik Antar Kelompok (Gamprit 1, Gamprit 2, TMII 1, TMII 2)
  const dataAntarKelompok = useMemo(() => {
    return KELOMPOK_OPTIONS.map((kelompokNama, idx) => {
      let hadir = 0;
      let izin = 0;
      let sakit = 0;
      let alpa = 0;

      monthlySessions.forEach(sesi => {
        sesi.daftarKehadiran.forEach(d => {
          if (d.kelompok && d.kelompok.toLowerCase() === kelompokNama.toLowerCase()) {
            if (d.status === 'Hadir') hadir++;
            else if (d.status === 'Izin') izin++;
            else if (d.status === 'Sakit') sakit++;
            else if (d.status === 'Alpa') alpa++;
          }
        });
      });

      const total = hadir + izin + sakit + alpa;
      const persentase = total > 0 ? Number(((hadir / total) * 100).toFixed(1)) : 0;
      const generusCount = generusList.filter(g => g.statusAktif && g.kelompok.toLowerCase() === kelompokNama.toLowerCase()).length;

      return {
        kelompok: kelompokNama,
        Hadir: hadir,
        Izin: izin,
        Sakit: sakit,
        Alpa: alpa,
        total,
        persentase,
        totalGenerus: generusCount,
        color: WARNA_KELOMPOK[idx % WARNA_KELOMPOK.length]
      };
    });
  }, [monthlySessions, generusList]);

  // 3. Data Grafik Kehadiran Per Kelompok Tertentu
  const dataPerKelompokDetail = useMemo(() => {
    const target = dataAntarKelompok.find(k => k.kelompok === selectedKelompokDetail) || dataAntarKelompok[0];
    if (!target) return { pieData: [], barData: [], target: null };

    const pieData = [
      { name: 'Hadir', value: target.Hadir, color: WARNA_STATUS.Hadir },
      { name: 'Izin', value: target.Izin, color: WARNA_STATUS.Izin },
      { name: 'Sakit', value: target.Sakit, color: WARNA_STATUS.Sakit },
      { name: 'Alpa', value: target.Alpa, color: WARNA_STATUS.Alpa }
    ].filter(d => d.value > 0);

    // Kehadiran kelompok ini di setiap sesi pertemuan
    const barData = monthlySessions.map(sesi => {
      let h = 0, i = 0, s = 0, a = 0;
      sesi.daftarKehadiran.forEach(d => {
        if (d.kelompok && d.kelompok.toLowerCase() === selectedKelompokDetail.toLowerCase()) {
          if (d.status === 'Hadir') h++;
          else if (d.status === 'Izin') i++;
          else if (d.status === 'Sakit') s++;
          else if (d.status === 'Alpa') a++;
        }
      });
      const tot = h + i + s + a;
      return {
        tanggal: sesi.tanggal.slice(5),
        tanggalFull: sesi.tanggal,
        Hadir: h,
        Izin: i,
        Sakit: s,
        Alpa: a,
        persen: tot > 0 ? Math.round((h / tot) * 100) : 0
      };
    });

    return { pieData, barData, target };
  }, [dataAntarKelompok, selectedKelompokDetail, monthlySessions]);

  // Export handlers dengan Embedding Gambar Grafik Otomatis
  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    try {
      const labelBulan = `${daftarBulan[selectedBulan]} ${selectedTahun}`;
      const kelompokBreakdown = dataAntarKelompok.map(k => ({
        kelompok: k.kelompok,
        hadir: k.Hadir,
        total: k.total,
        persen: k.persentase
      }));

      // Tangkap elemen visual grafik utama (batang/garis/lingkaran) dan distribusi donat
      const mainChartImg = await captureElementAsImage('main-chart-render-box');
      const distChartImg = await captureElementAsImage('distribution-donut-chart-box');

      exportPerformaKehadiranPDF(
        labelBulan, 
        generusPerformanceList, 
        overallStats, 
        kelompokBreakdown,
        {
          mainChart: mainChartImg,
          distribusiChart: distChartImg
        }
      );
    } catch (err) {
      console.error('Gagal membuat laporan PDF dengan grafik:', err);
    } finally {
      setIsExportingPDF(false);
    }
  };

  // Unduh Grafik Langsung Sebagai File Gambar PNG
  const handleDownloadChartPNG = async () => {
    setIsExportingPNG(true);
    try {
      const dataUrl = await captureElementAsImage('main-chart-render-box');
      if (dataUrl) {
        const link = document.createElement('a');
        link.download = `Grafik_${activeTab}_${daftarBulan[selectedBulan]}_${selectedTahun}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      console.error('Gagal mengunduh gambar grafik:', err);
    } finally {
      setIsExportingPNG(false);
    }
  };

  const handleExportExcel = () => {
    const labelBulan = `${daftarBulan[selectedBulan]} ${selectedTahun}`;
    exportPerformaKehadiranExcel(labelBulan, generusPerformanceList);
  };

  const labelBulan = `${daftarBulan[selectedBulan]} ${selectedTahun}`;

  return (
    <div id="grafik-performa-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header Card */}
      <div id="grafik-header-card" className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FDF2F2] border border-[#F2CECF] text-[#A83236] text-xs font-semibold mb-2">
              <TrendingUp className="w-3.5 h-3.5 text-[#A83236]" />
              Visualisasi Analitik & Evaluasi Kehadiran
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Grafik Performa Kehadiran Generus
            </h1>
            <p className="text-slate-600 text-sm mt-1">
              Pantau grafik antar kelompok, per kelompok, dan keseluruhan generus dengan pilihan diagram batang, garis, atau lingkaran serta unduh laporan lengkap berserta grafiknya.
            </p>
          </div>

          {/* Download Export Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              id="btn-export-performa-pdf"
              onClick={handleExportPDF}
              disabled={isExportingPDF}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#A83236] hover:bg-[#92272B] active:bg-[#7A1F22] disabled:bg-slate-400 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
            >
              {isExportingPDF ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Menyusun PDF & Grafik...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Unduh Laporan PDF (+Grafik)
                </>
              )}
            </button>

            <button
              id="btn-download-chart-png"
              onClick={handleDownloadChartPNG}
              disabled={isExportingPNG}
              title="Unduh visual grafik aktif sebagai file gambar PNG"
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 active:bg-black text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
            >
              {isExportingPNG ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ImageIcon className="w-4 h-4" />
              )}
              Unduh Gambar Grafik
            </button>

            <button
              id="btn-export-performa-excel"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Unduh Excel (.xlsx)
            </button>
          </div>
        </div>

        {/* Filter Bulan, Tahun & Controls Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Pilih Bulan
            </label>
            <select
              id="select-filter-bulan"
              value={selectedBulan}
              onChange={(e) => setSelectedBulan(parseInt(e.target.value, 10))}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-semibold focus:ring-2 focus:ring-[#A83236] focus:outline-hidden focus:bg-white"
            >
              {daftarBulan.map((bulan, idx) => (
                <option key={bulan} value={idx}>
                  {bulan}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Pilih Tahun
            </label>
            <select
              id="select-filter-tahun"
              value={selectedTahun}
              onChange={(e) => setSelectedTahun(parseInt(e.target.value, 10))}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-semibold focus:ring-2 focus:ring-[#A83236] focus:outline-hidden focus:bg-white"
            >
              {[2024, 2025, 2026, 2027].map(yr => (
                <option key={yr} value={yr}>
                  Tahun {yr}
                </option>
              ))}
            </select>
          </div>

          {/* Toggle Tab Grafik */}
          <div className="lg:col-span-2 flex flex-col justify-end">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Pilih Tampilan Grafik
            </label>
            <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                id="btn-tab-antar-kelompok"
                onClick={() => setActiveTab('antar_kelompok')}
                className={`py-2 px-2 text-xs font-semibold rounded-lg transition-all cursor-pointer truncate ${
                  activeTab === 'antar_kelompok'
                    ? 'bg-[#A83236] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Antar Kelompok
              </button>

              <button
                type="button"
                id="btn-tab-per-kelompok"
                onClick={() => setActiveTab('per_kelompok')}
                className={`py-2 px-2 text-xs font-semibold rounded-lg transition-all cursor-pointer truncate ${
                  activeTab === 'per_kelompok'
                    ? 'bg-[#A83236] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Per Kelompok
              </button>

              <button
                type="button"
                id="btn-tab-keseluruhan"
                onClick={() => setActiveTab('keseluruhan')}
                className={`py-2 px-2 text-xs font-semibold rounded-lg transition-all cursor-pointer truncate ${
                  activeTab === 'keseluruhan'
                    ? 'bg-[#A83236] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Keseluruhan
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Stats Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-600 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Rata-rata Hadir</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900">
            {overallStats.rataRataHadir.toFixed(1)}%
          </div>
          <p className="text-xs text-slate-600 mt-1">{overallStats.totalHadir} akumulasi presensi hadir</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-600 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Sesi Bulan Ini</span>
            <Calendar className="w-4 h-4 text-[#A83236]" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900">
            {overallStats.totalSesi}
          </div>
          <p className="text-xs text-slate-600 mt-1">Pertemuan di bulan {labelBulan}</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-600 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Izin & Sakit</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900">
            {overallStats.totalIzin + overallStats.totalSakit}
          </div>
          <p className="text-xs text-slate-600 mt-1">{overallStats.totalIzin} Izin, {overallStats.totalSakit} Sakit</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-600 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Alpa (Tanpa Ket.)</span>
            <UserX className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-3xl font-extrabold text-rose-600">
            {overallStats.totalAlpa}
          </div>
          <p className="text-xs text-slate-600 mt-1">Perlu perhatian & bimbingan</p>
        </div>
      </div>

      {/* Main Interactive Chart Section with Target Box for HTML2Canvas */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
        {/* Header Grafik & Toggle Tipe Diagram (Batang, Garis, Lingkaran) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              {activeTab === 'antar_kelompok' && 'Grafik Perbandingan Antar Kelompok (Gamprit 1, 2 & TMII 1, 2)'}
              {activeTab === 'per_kelompok' && `Grafik Kehadiran Per Kelompok: ${selectedKelompokDetail}`}
              {activeTab === 'keseluruhan' && 'Grafik Kehadiran Keseluruhan Generus'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              Periode {labelBulan} • Visualisasi interaktif real-time
            </p>
          </div>

          {/* Toggle Diagram Batang / Garis / Lingkaran */}
          <div className="flex items-center gap-2 self-start sm:self-center">
            <span className="text-xs text-slate-600 font-semibold mr-1">Tipe Diagram:</span>
            <div className="flex items-center p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                id="btn-diagram-batang"
                onClick={() => setTipeDiagram('batang')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  tipeDiagram === 'batang'
                    ? 'bg-white text-[#A83236] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Batang
              </button>
              <button
                type="button"
                id="btn-diagram-garis"
                onClick={() => setTipeDiagram('garis')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  tipeDiagram === 'garis'
                    ? 'bg-white text-[#A83236] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LineChartIcon className="w-3.5 h-3.5" />
                Garis
              </button>
              <button
                type="button"
                id="btn-diagram-lingkaran"
                onClick={() => setTipeDiagram('lingkaran')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  tipeDiagram === 'lingkaran'
                    ? 'bg-white text-[#A83236] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <PieChartIcon className="w-3.5 h-3.5" />
                Lingkaran
              </button>
            </div>
          </div>
        </div>

        {/* Sub-selector jika Tab 'Per Kelompok' */}
        {activeTab === 'per_kelompok' && (
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-xs font-semibold text-slate-700">Pilih Kelompok:</span>
            <div className="flex flex-wrap gap-2">
              {KELOMPOK_OPTIONS.map(kel => (
                <button
                  key={kel}
                  type="button"
                  onClick={() => setSelectedKelompokDetail(kel)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    selectedKelompokDetail === kel
                      ? 'bg-[#A83236] text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {kel}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Dedicated Chart Container with id for High-Res Image Capture */}
        <div id="main-chart-render-box" className="p-4 bg-white rounded-xl">
          {monthlySessions.length === 0 ? (
            <div className="py-16 text-center text-slate-600">
              <Calendar className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-base font-semibold text-slate-800">Belum ada data sesi presensi di bulan {labelBulan}.</p>
              <p className="text-xs text-slate-600 mt-1">Lakukan absensi di menu "Absensi & Jurnal" untuk memunculkan visualisasi grafik.</p>
            </div>
          ) : (
            <div className="w-full">
              {/* 1. TAB ANTAR KELOMPOK */}
              {activeTab === 'antar_kelompok' && (
                <div>
                  {tipeDiagram === 'batang' && (
                    <div className="w-full h-80 sm:h-96">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dataAntarKelompok} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="kelompok" stroke="#64748B" fontSize={12} tickLine={false} />
                          <YAxis stroke="#64748B" fontSize={12} tickLine={false} />
                          <Tooltip 
                            formatter={(value: any, name: any) => [
                              `${value} orang`,
                              name === 'Hadir' ? 'Hadir' : name === 'Izin' ? 'Izin' : name === 'Sakit' ? 'Sakit' : 'Alpa'
                            ]}
                            contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0' }}
                          />
                          <Legend />
                          <Bar dataKey="Hadir" fill={WARNA_STATUS.Hadir} radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Izin" fill={WARNA_STATUS.Izin} radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Sakit" fill={WARNA_STATUS.Sakit} radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Alpa" fill={WARNA_STATUS.Alpa} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {tipeDiagram === 'garis' && (
                    <div className="w-full h-80 sm:h-96">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dataAntarKelompok} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="kelompok" stroke="#64748B" fontSize={12} tickLine={false} />
                          <YAxis stroke="#64748B" fontSize={12} tickLine={false} />
                          <Tooltip 
                            formatter={(val: any, name: any) => [`${val} orang`, name]}
                            contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0' }}
                          />
                          <Legend />
                          <Line type="monotone" dataKey="Hadir" stroke={WARNA_STATUS.Hadir} strokeWidth={3} dot={{ r: 5 }} activeDot={{ r: 7 }} />
                          <Line type="monotone" dataKey="Izin" stroke={WARNA_STATUS.Izin} strokeWidth={2.5} dot={{ r: 4 }} />
                          <Line type="monotone" dataKey="Sakit" stroke={WARNA_STATUS.Sakit} strokeWidth={2.5} dot={{ r: 4 }} />
                          <Line type="monotone" dataKey="Alpa" stroke={WARNA_STATUS.Alpa} strokeWidth={2.5} dot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {tipeDiagram === 'lingkaran' && (
                    <div className="w-full h-80 sm:h-96 flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={dataAntarKelompok.map(k => ({ name: k.kelompok, value: k.Hadir }))}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={115}
                            innerRadius={50}
                            paddingAngle={2}
                            label={({ name, percent }: any) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          >
                            {dataAntarKelompok.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={WARNA_KELOMPOK[index % WARNA_KELOMPOK.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(val: any) => [`${val} Kehadiran`, 'Total Hadir']} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Ringkasan Persentase Antar Kelompok */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-100">
                    {dataAntarKelompok.map(item => (
                      <div key={item.kelompok} className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800">{item.kelompok}</span>
                          <span className="text-[11px] text-slate-500">{item.totalGenerus} Generus</span>
                        </div>
                        <div className="text-xl font-extrabold text-[#A83236] mt-1">
                          {item.persentase}%
                        </div>
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-2">
                          <div 
                            className="bg-[#A83236] h-full rounded-full" 
                            style={{ width: `${Math.min(item.persentase, 100)}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1.5">
                          {item.Hadir} hadir dari {item.total} presensi
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. TAB PER KELOMPOK */}
              {activeTab === 'per_kelompok' && (
                <div>
                  {tipeDiagram === 'batang' && (
                    <div className="w-full h-80 sm:h-96">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dataPerKelompokDetail.barData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="tanggal" stroke="#64748B" fontSize={12} tickLine={false} />
                          <YAxis stroke="#64748B" fontSize={12} tickLine={false} />
                          <Tooltip 
                            formatter={(value: any, name: any) => [`${value} orang`, name]}
                            contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0' }}
                          />
                          <Legend />
                          <Bar dataKey="Hadir" fill={WARNA_STATUS.Hadir} radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Izin" fill={WARNA_STATUS.Izin} radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Sakit" fill={WARNA_STATUS.Sakit} radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Alpa" fill={WARNA_STATUS.Alpa} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {tipeDiagram === 'garis' && (
                    <div className="w-full h-80 sm:h-96">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={dataPerKelompokDetail.barData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                          <defs>
                            <linearGradient id="colorHadirGroup" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={WARNA_STATUS.Hadir} stopOpacity={0.8}/>
                              <stop offset="95%" stopColor={WARNA_STATUS.Hadir} stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="tanggal" stroke="#64748B" fontSize={12} tickLine={false} />
                          <YAxis stroke="#64748B" fontSize={12} tickLine={false} />
                          <Tooltip 
                            formatter={(value: any, name: any) => [`${value} orang`, name]}
                            contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0' }}
                          />
                          <Legend />
                          <Area type="monotone" dataKey="Hadir" stroke={WARNA_STATUS.Hadir} fillOpacity={1} fill="url(#colorHadirGroup)" strokeWidth={2.5} />
                          <Line type="monotone" dataKey="Izin" stroke={WARNA_STATUS.Izin} strokeWidth={2} dot={{ r: 3 }} />
                          <Line type="monotone" dataKey="Sakit" stroke={WARNA_STATUS.Sakit} strokeWidth={2} dot={{ r: 3 }} />
                          <Line type="monotone" dataKey="Alpa" stroke={WARNA_STATUS.Alpa} strokeWidth={2} dot={{ r: 3 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {tipeDiagram === 'lingkaran' && (
                    <div className="w-full h-80 sm:h-96 flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={dataPerKelompokDetail.pieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={115}
                            innerRadius={50}
                            paddingAngle={2}
                            label={({ name, percent }: any) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          >
                            {dataPerKelompokDetail.pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(val: any, name: any) => [`${val} orang`, name]} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Detail Summary Card Kelompok Ini */}
                  {dataPerKelompokDetail.target && (
                    <div className="p-4 bg-[#FDF2F2] border border-[#F2CECF] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6">
                      <div>
                        <h4 className="font-bold text-[#A83236] text-sm">
                          Capaian Kehadiran: {dataPerKelompokDetail.target.kelompok}
                        </h4>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Tingkat kehadiran: <span className="font-bold text-slate-900">{dataPerKelompokDetail.target.persentase}%</span> • Total Anggota Aktif: {dataPerKelompokDetail.target.totalGenerus} Generus
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <span className="px-2.5 py-1 bg-white rounded-lg text-emerald-700 border border-emerald-200">
                          {dataPerKelompokDetail.target.Hadir} Hadir
                        </span>
                        <span className="px-2.5 py-1 bg-white rounded-lg text-blue-700 border border-blue-200">
                          {dataPerKelompokDetail.target.Izin} Izin
                        </span>
                        <span className="px-2.5 py-1 bg-white rounded-lg text-amber-700 border border-amber-200">
                          {dataPerKelompokDetail.target.Sakit} Sakit
                        </span>
                        <span className="px-2.5 py-1 bg-white rounded-lg text-rose-700 border border-rose-200">
                          {dataPerKelompokDetail.target.Alpa} Alpa
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 3. TAB KESELURUHAN GENERUS */}
              {activeTab === 'keseluruhan' && (
                <div>
                  {tipeDiagram === 'batang' && (
                    <div className="w-full h-80 sm:h-96">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dataBarKeseluruhanPerSesi} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="tanggal" stroke="#64748B" fontSize={12} tickLine={false} />
                          <YAxis stroke="#64748B" fontSize={12} tickLine={false} />
                          <Tooltip 
                            formatter={(value: any, name: any) => [`${value} orang`, name]}
                            labelFormatter={(label, payload) => {
                              if (payload && payload[0]) {
                                const item = payload[0].payload;
                                return `${item.tanggalFull} (${item.tempat}) - Pemateri: ${item.pemateri}`;
                              }
                              return label;
                            }}
                            contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0' }}
                          />
                          <Legend />
                          <Bar dataKey="Hadir" fill={WARNA_STATUS.Hadir} radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Izin" fill={WARNA_STATUS.Izin} radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Sakit" fill={WARNA_STATUS.Sakit} radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Alpa" fill={WARNA_STATUS.Alpa} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {tipeDiagram === 'garis' && (
                    <div className="w-full h-80 sm:h-96">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={dataBarKeseluruhanPerSesi} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                          <defs>
                            <linearGradient id="colorHadirOverall" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={WARNA_STATUS.Hadir} stopOpacity={0.8}/>
                              <stop offset="95%" stopColor={WARNA_STATUS.Hadir} stopOpacity={0.05}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="tanggal" stroke="#64748B" fontSize={12} tickLine={false} />
                          <YAxis stroke="#64748B" fontSize={12} tickLine={false} />
                          <Tooltip 
                            formatter={(value: any, name: any) => [`${value} orang`, name]}
                            contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0' }}
                          />
                          <Legend />
                          <Area type="monotone" dataKey="Hadir" stroke={WARNA_STATUS.Hadir} fillOpacity={1} fill="url(#colorHadirOverall)" strokeWidth={2.5} />
                          <Line type="monotone" dataKey="Izin" stroke={WARNA_STATUS.Izin} strokeWidth={2} dot={{ r: 3 }} />
                          <Line type="monotone" dataKey="Sakit" stroke={WARNA_STATUS.Sakit} strokeWidth={2} dot={{ r: 3 }} />
                          <Line type="monotone" dataKey="Alpa" stroke={WARNA_STATUS.Alpa} strokeWidth={2} dot={{ r: 3 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {tipeDiagram === 'lingkaran' && (
                    <div className="w-full h-80 sm:h-96 flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={dataPieKeseluruhan}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={115}
                            innerRadius={55}
                            paddingAngle={2}
                            label={({ name, percent }: any) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          >
                            {dataPieKeseluruhan.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(val: any, name: any) => [`${val} Presensi (${((val / overallStats.totalKehadiranRecord) * 100).toFixed(1)}%)`, name]} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Grid Side-by-Side: Distribusi Donat & Highlight Peringkat Generus */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Distribusi Donat Box (Captured for PDF Report) */}
        <div 
          id="distribution-donut-chart-box" 
          className="lg:col-span-6 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-[#A83236]" />
                Distribusi Proporsi Presensi ({labelBulan})
              </h3>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                {overallStats.totalKehadiranRecord} Total Presensi
              </span>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Perbandingan akumulasi Hadir, Izin, Sakit, dan Alpa di seluruh kelompok
            </p>

            <div className="w-full h-64 flex items-center justify-center">
              {dataPieKeseluruhan.length === 0 ? (
                <div className="text-center text-slate-400 text-xs">Belum ada data presensi</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dataPieKeseluruhan}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={85}
                      innerRadius={45}
                      paddingAngle={3}
                      label={({ name, percent }: any) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {dataPieKeseluruhan.map((entry, index) => (
                        <Cell key={`donut-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: any, name: any) => [`${val} kali`, name]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 pt-4 border-t border-slate-100 text-center">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-800">
              <div className="text-xs font-semibold">Hadir</div>
              <div className="text-base font-bold mt-0.5">{overallStats.totalHadir}</div>
            </div>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-800">
              <div className="text-xs font-semibold">Izin</div>
              <div className="text-base font-bold mt-0.5">{overallStats.totalIzin}</div>
            </div>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-800">
              <div className="text-xs font-semibold">Sakit</div>
              <div className="text-base font-bold mt-0.5">{overallStats.totalSakit}</div>
            </div>
            <div className="p-2 rounded-lg bg-rose-50 text-rose-800">
              <div className="text-xs font-semibold">Alpa</div>
              <div className="text-base font-bold mt-0.5">{overallStats.totalAlpa}</div>
            </div>
          </div>
        </div>

        {/* Papan Peringkat & Evaluasi Generus */}
        <div className="lg:col-span-6 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                Papan Peringkat Kehadiran Generus
              </h3>
              <span className="text-xs text-slate-500">Top 5 Disiplin</span>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Generus dengan persentase kehadiran paling konsisten di bulan {labelBulan}
            </p>

            {topGenerusList.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-xs">Belum ada riwayat kehadiran</div>
            ) : (
              <div className="space-y-2.5">
                {topGenerusList.map((g, idx) => (
                  <div key={g.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0 ? 'bg-amber-400 text-amber-950 shadow-xs' :
                        idx === 1 ? 'bg-slate-300 text-slate-800' :
                        idx === 2 ? 'bg-amber-700/20 text-amber-900' :
                        'bg-slate-200 text-slate-700'
                      }`}>
                        {idx + 1}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-900">{g.nama}</div>
                        <div className="text-[11px] text-slate-500">{g.kelompok} • {g.gender}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-block font-mono font-bold text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                        {g.persenHadir.toFixed(0)}% Hadir
                      </span>
                      <div className="text-[10px] text-slate-500 mt-0.5">{g.hadir} sesi hadir</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {lowAttendanceList.length > 0 && (
            <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                Catatan Bimbingan Pembina
              </div>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Terdapat {lowAttendanceList.length} generus dengan presensi di bawah 60%. Mohon dilakukan pendekatan dan silaturahmi oleh penasehat kelompok.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Tabel Rekapitulasi Kehadiran Individu Generus */}
      <div id="tabel-performa-generus" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Tabel Rekapitulasi Kehadiran Individu Generus
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Urutan berdasarkan persentase kehadiran tertinggi pada periode {labelBulan}
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 bg-slate-100 text-slate-700 rounded-lg">
            {generusPerformanceList.length} Generus Terdaftar
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="py-3.5 px-4">Peringkat</th>
                <th className="py-3.5 px-4">Nama Generus</th>
                <th className="py-3.5 px-4">Kelompok</th>
                <th className="py-3.5 px-4">Gender</th>
                <th className="py-3.5 px-4 text-center">Hadir</th>
                <th className="py-3.5 px-4 text-center">Izin</th>
                <th className="py-3.5 px-4 text-center">Sakit</th>
                <th className="py-3.5 px-4 text-center">Alpa</th>
                <th className="py-3.5 px-4 text-right">Persentase</th>
                <th className="py-3.5 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {generusPerformanceList.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-600 text-sm">
                    Tidak ada data generus.
                  </td>
                </tr>
              ) : (
                generusPerformanceList.map((g, idx) => {
                  const isTop3 = idx < 3 && g.persenHadir > 0;
                  return (
                    <tr key={g.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          {isTop3 ? (
                            <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-xs font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-600 font-mono pl-1.5">
                              {idx + 1}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {g.nama}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#FDF2F2] border border-[#F2CECF] text-[#A83236] font-medium">
                          {g.kelompok}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        {g.gender}
                      </td>
                      <td className="py-3.5 px-4 text-center font-semibold text-emerald-700">{g.hadir}</td>
                      <td className="py-3.5 px-4 text-center text-blue-700">{g.izin}</td>
                      <td className="py-3.5 px-4 text-center text-amber-700">{g.sakit}</td>
                      <td className="py-3.5 px-4 text-center text-rose-700 font-semibold">{g.alpa}</td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="font-mono font-bold text-slate-900">
                          {g.persenHadir.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                          g.persenHadir >= 80
                            ? 'bg-emerald-100 text-emerald-800'
                            : g.persenHadir >= 60
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {g.persenHadir >= 80 ? 'Sangat Baik' : g.persenHadir >= 60 ? 'Cukup' : 'Perlu Binaan'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
