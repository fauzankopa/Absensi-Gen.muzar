import React, { useState, useMemo } from 'react';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  writeBatch 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Generus, Gender, JobStatus, hitungUmur, KELOMPOK_OPTIONS } from '../types';
import { getLocalGenerus, saveLocalGenerus, mergeAndSaveGenerus, syncFirestoreInBackground } from '../storage';
import { exportGenerusToExcel } from '../exportUtils';
import { 
  Users, 
  UserPlus, 
  FileSpreadsheet, 
  Upload, 
  Search, 
  Check, 
  X, 
  Edit2, 
  Trash2, 
  AlertCircle, 
  CheckCircle2,
  Filter,
  Download,
  Phone,
  Briefcase,
  ArrowUpDown,
  Calendar,
  Sparkles
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface DataGenerusPageProps {
  generusList: Generus[];
  onRefresh: () => void;
  onOpenGoogleSheets?: () => void;
}

const JOB_STATUS_OPTIONS: JobStatus[] = [
  'Karyawan',
  'PNS',
  'Guru',
  'Freelancer',
  'Pelajar / Mahasiswa',
  'Wiraswasta',
  'Belum Bekerja',
  'Lainnya'
];

type SortField = 'nama' | 'kelompok' | 'umur' | 'gender';
type SortDirection = 'asc' | 'desc';

export const DataGenerusPage: React.FC<DataGenerusPageProps> = ({ generusList, onRefresh, onOpenGoogleSheets }) => {
  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterKelompok, setFilterKelompok] = useState<string>('Semua');
  const [filterStatusAktif, setFilterStatusAktif] = useState<string>('Semua');

  // Fitur Sorting: Nama, Kelompok, Umur, Gender
  const [sortBy, setSortBy] = useState<SortField>('nama');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Modal Single Generus Form (Create / Edit)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingGenerus, setEditingGenerus] = useState<Generus | null>(null);

  // Form State Single
  const [namaLengkap, setNamaLengkap] = useState<string>('');
  const [jenisKelamin, setJenisKelamin] = useState<Gender>('Laki-laki');
  const [tempatLahir, setTempatLahir] = useState<string>('');
  const [tanggalLahir, setTanggalLahir] = useState<string>('2005-01-01');
  const [umurInput, setUmurInput] = useState<string>('21');
  const [statusKerja, setStatusKerja] = useState<JobStatus>('Pelajar / Mahasiswa');
  const [kelompok, setKelompok] = useState<string>('Gamprit 1');
  const [noTelpon, setNoTelpon] = useState<string>('');
  const [namaBapak, setNamaBapak] = useState<string>('');
  const [statusAktif, setStatusAktif] = useState<boolean>(true);

  // Delete State
  const [generusToDelete, setGenerusToDelete] = useState<Generus | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  // Bulk Modal
  const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);
  const [bulkParsedData, setBulkParsedData] = useState<Omit<Generus, 'id'>[]>([]);
  const [bulkFileName, setBulkFileName] = useState<string>('');
  const [bulkIsSubmitting, setBulkIsSubmitting] = useState<boolean>(false);

  // Alert Notifications
  const [alertSuccess, setAlertSuccess] = useState<string | null>(null);
  const [alertError, setAlertError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Unique kelompok list (including predefined KELOMPOK_OPTIONS)
  const kelompokList = useMemo(() => {
    const set = new Set<string>(KELOMPOK_OPTIONS);
    generusList.forEach(g => {
      if (g.kelompok) set.add(g.kelompok);
    });
    return Array.from(set);
  }, [generusList]);

  // Filtered & Sorted List
  const filteredAndSortedGenerus = useMemo(() => {
    // 1. Filter
    let list = generusList.filter(g => {
      if (deletedIds.has(g.id)) return false;

      const matchSearch =
        g.namaLengkap.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.namaBapak.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.noTelpon.includes(searchQuery);

      const matchKelompok = filterKelompok === 'Semua' || g.kelompok.toLowerCase() === filterKelompok.toLowerCase();
      const matchStatus =
        filterStatusAktif === 'Semua'
          ? true
          : filterStatusAktif === 'Aktif'
          ? g.statusAktif
          : !g.statusAktif;

      return matchSearch && matchKelompok && matchStatus;
    });

    // 2. Sorting: nama, kelompok, umur, gender
    list.sort((a, b) => {
      let comp = 0;

      if (sortBy === 'nama') {
        comp = a.namaLengkap.localeCompare(b.namaLengkap, 'id');
      } else if (sortBy === 'kelompok') {
        comp = a.kelompok.localeCompare(b.kelompok, 'id');
      } else if (sortBy === 'gender') {
        comp = a.jenisKelamin.localeCompare(b.jenisKelamin, 'id');
      } else if (sortBy === 'umur') {
        const umurA = hitungUmur(a.tanggalLahir, a.umur || a.usia) ?? 999;
        const umurB = hitungUmur(b.tanggalLahir, b.umur || b.usia) ?? 999;
        comp = umurA - umurB;
      }

      return sortDirection === 'asc' ? comp : -comp;
    });

    return list;
  }, [generusList, deletedIds, searchQuery, filterKelompok, filterStatusAktif, sortBy, sortDirection]);

  // Toggle sorting helper
  const handleSortToggle = (field: SortField) => {
    if (sortBy === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('asc');
    }
  };

  // Open modal create
  const handleOpenCreate = () => {
    setEditingGenerus(null);
    setNamaLengkap('');
    setJenisKelamin('Laki-laki');
    setTempatLahir('');
    setTanggalLahir('2005-01-01');
    const autoUmur = hitungUmur('2005-01-01');
    setUmurInput(autoUmur !== null ? String(autoUmur) : '21');
    setStatusKerja('Pelajar / Mahasiswa');
    setKelompok('Gamprit 1');
    setNoTelpon('');
    setNamaBapak('');
    setStatusAktif(true);
    setIsModalOpen(true);
  };

  // Open modal edit
  const handleOpenEdit = (g: Generus) => {
    setEditingGenerus(g);
    setNamaLengkap(g.namaLengkap);
    setJenisKelamin(g.jenisKelamin);
    setTempatLahir(g.tempatLahir);
    setTanggalLahir(g.tanggalLahir || '');
    const currentUmur = hitungUmur(g.tanggalLahir, g.umur || g.usia);
    setUmurInput(currentUmur !== null ? String(currentUmur) : (g.umur ? String(g.umur) : ''));
    setStatusKerja(g.statusKerja);
    setKelompok(g.kelompok || 'Gamprit 1');
    setNoTelpon(g.noTelpon);
    setNamaBapak(g.namaBapak);
    setStatusAktif(g.statusAktif);
    setIsModalOpen(true);
  };

  // Sinkronisasi Umur dan Tanggal Lahir
  const handleUmurInputChange = (val: string) => {
    setUmurInput(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 120) {
      const year = new Date().getFullYear() - parsed;
      setTanggalLahir(`${year}-01-01`);
    }
  };

  const handleTanggalLahirChange = (val: string) => {
    setTanggalLahir(val);
    const calculated = hitungUmur(val);
    if (calculated !== null) {
      setUmurInput(String(calculated));
    }
  };

  // Submit Single Form (Add / Edit)
  const handleSubmitSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaLengkap.trim()) {
      setAlertError('Nama Lengkap generus wajib diisi.');
      return;
    }

    setIsSaving(true);
    setAlertError(null);
    setAlertSuccess(null);

    try {
      const calculatedUmur = hitungUmur(tanggalLahir, umurInput);
      const finalUmur = calculatedUmur ?? (umurInput ? parseInt(umurInput, 10) : undefined);
      const finalTanggal = tanggalLahir || (finalUmur ? `${new Date().getFullYear() - finalUmur}-01-01` : '2005-01-01');

      const rawPayload: Record<string, any> = {
        namaLengkap: namaLengkap.trim(),
        jenisKelamin,
        tempatLahir: tempatLahir.trim(),
        tanggalLahir: finalTanggal,
        statusKerja,
        kelompok: kelompok.trim() || 'Gamprit 1',
        noTelpon: noTelpon.trim(),
        namaBapak: namaBapak.trim(),
        statusAktif,
        updatedAt: new Date().toISOString()
      };
      if (finalUmur !== undefined) {
        rawPayload.umur = finalUmur;
        rawPayload.usia = finalUmur;
      }

      const payload = rawPayload;

      // 1. Simpan ke Local Storage seketika agar tidak hilang dan UI responsif 0ms
      const currentList = getLocalGenerus();
      if (editingGenerus) {
        const updated = currentList.map(g => g.id === editingGenerus.id ? { ...g, ...payload, id: editingGenerus.id } : g);
        saveLocalGenerus(updated);
        setAlertSuccess(`Profil generus "${namaLengkap}" berhasil diperbarui.`);
      } else {
        const newDocId = `gen_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newItem: Generus = {
          ...payload,
          id: newDocId,
          createdAt: new Date().toISOString()
        } as Generus;
        saveLocalGenerus([...currentList, newItem]);
        setAlertSuccess(`Generus baru "${namaLengkap}" berhasil ditambahkan.`);
      }

      // Langsung tutup modal seketika (0ms)
      setIsSaving(false);
      setIsModalOpen(false);
      onRefresh();

      // 2. Sync ke Cloud Firestore di background tanpa membuat modal menunggu
      syncFirestoreInBackground(async () => {
        if (editingGenerus) {
          await updateDoc(doc(db, 'generus', editingGenerus.id), payload);
        } else {
          await addDoc(collection(db, 'generus'), {
            ...payload,
            createdAt: new Date().toISOString()
          });
        }
      });
    } catch (err: any) {
      console.error('Error saving generus:', err);
      setAlertError(`Gagal menyimpan data: ${err.message || 'Kesalahan sistem'}`);
      setIsSaving(false);
    }
  };

  // Konfirmasi dan eksekusi penghapusan generus (Optimistic UI: Instan 0ms)
  const handleConfirmDelete = () => {
    if (!generusToDelete) return;
    const target = generusToDelete;
    const targetId = target.id;

    // 1. Langsung tutup modal, hapus visual dan simpan di local storage dalam 0ms
    setGenerusToDelete(null);
    setDeletedIds(prev => new Set(prev).add(targetId));
    const currentList = getLocalGenerus().filter(g => g.id !== targetId);
    saveLocalGenerus(currentList);
    setAlertSuccess(`Data generus "${target.namaLengkap}" berhasil dihapus.`);
    setAlertError(null);
    onRefresh();

    // 2. Eksekusi penghapusan di Cloud Firestore di background tanpa memblokir
    syncFirestoreInBackground(async () => {
      await deleteDoc(doc(db, 'generus', targetId));
    });
  };

  // Toggle status aktif/nonaktif generus
  const handleToggleStatusAktif = (generus: Generus) => {
    const newStatus = !generus.statusAktif;
    // 1. Update lokal seketika (0ms)
    const currentList = getLocalGenerus().map(g => g.id === generus.id ? { ...g, statusAktif: newStatus, updatedAt: new Date().toISOString() } : g);
    saveLocalGenerus(currentList);
    setAlertSuccess(
      `Status generus "${generus.namaLengkap}" diubah menjadi ${newStatus ? 'AKTIF' : 'NONAKTIF'}.`
    );
    onRefresh();

    // 2. Sync ke Firestore di background tanpa memblokir
    syncFirestoreInBackground(async () => {
      await updateDoc(doc(db, 'generus', generus.id), {
        statusAktif: newStatus,
        updatedAt: new Date().toISOString()
      });
    });
  };

  // Handle Excel Bulk File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBulkFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(ws);

        if (!rawJson || rawJson.length === 0) {
          setAlertError('File Excel kosong atau format tidak sesuai.');
          return;
        }

        // Map column variations
        const parsed: Omit<Generus, 'id'>[] = rawJson.map((row) => {
          const rawGender = String(row['Jenis Kelamin'] || row['Gender'] || row['JK'] || 'Laki-laki').trim();
          const gender: Gender = rawGender.toLowerCase().startsWith('p') ? 'Perempuan' : 'Laki-laki';

          const rawJob = String(row['Status Kerja'] || row['Pekerjaan'] || row['Profesi'] || 'Pelajar / Mahasiswa').trim();
          let matchedJob: JobStatus = 'Pelajar / Mahasiswa';
          for (const opt of JOB_STATUS_OPTIONS) {
            if (opt.toLowerCase() === rawJob.toLowerCase()) {
              matchedJob = opt;
              break;
            }
          }

          const rawActive = row['Status Aktif'] ?? row['Status'] ?? true;
          const isActive = String(rawActive).toLowerCase() !== 'nonaktif' && String(rawActive).toLowerCase() !== 'false';

          // Ekstraksi Tanggal Lahir dan Umur secara fleksibel
          const rawTgl = row['Tanggal Lahir'] ?? row['Tgl Lahir'] ?? row['Tgl. Lahir'] ?? row['DOB'];
          const rawAge = row['Umur'] ?? row['Usia'] ?? row['Age'] ?? row['Umur (Tahun)'] ?? row['Usia (Tahun)'];
          const detectedAge = hitungUmur(rawTgl, rawAge);
          const finalTanggal = rawTgl ? String(rawTgl).trim() : (detectedAge ? `${new Date().getFullYear() - detectedAge}-01-01` : '2005-01-01');

          return {
            namaLengkap: String(row['Nama Lengkap'] || row['Nama'] || 'Generus Tanpa Nama').trim(),
            jenisKelamin: gender,
            tempatLahir: String(row['Tempat Lahir'] || row['Kota'] || '-').trim(),
            tanggalLahir: finalTanggal,
            umur: detectedAge ?? (rawAge ? parseInt(String(rawAge).replace(/\D/g, ''), 10) : undefined),
            usia: detectedAge ?? (rawAge ? parseInt(String(rawAge).replace(/\D/g, ''), 10) : undefined),
            statusKerja: matchedJob,
            kelompok: String(row['Kelompok'] || row['Kelas'] || 'Gamprit 1').trim(),
            noTelpon: String(row['No Telpon'] || row['No HP'] || row['Telepon'] || '-').trim(),
            namaBapak: String(row['Nama Bapak'] || row['Ayah'] || '-').trim(),
            statusAktif: isActive,
            createdAt: new Date().toISOString()
          };
        });

        setBulkParsedData(parsed);
      } catch (err: any) {
        console.error('Error parsing excel:', err);
        setAlertError(`Gagal membaca file excel: ${err.message}`);
      }
    };

    reader.readAsBinaryString(file);
  };

  // Submit Massal / Bulk Import (Instan & Non-blocking)
  const handleSaveBulk = () => {
    if (bulkParsedData.length === 0) return;

    setBulkIsSubmitting(true);
    setAlertError(null);
    setAlertSuccess(null);

    try {
      // 1. Simpan ke local storage seketika
      const mergeRes = mergeAndSaveGenerus(bulkParsedData as any, 'append');

      setAlertSuccess(`Alhamdulillah! Berhasil mengimpor massal ${bulkParsedData.length} data generus ke database aplikasi.`);
      setIsBulkModalOpen(false);
      setBulkParsedData([]);
      setBulkFileName('');
      setBulkIsSubmitting(false);
      onRefresh();

      // 2. Sync ke Cloud Firestore di background
      syncFirestoreInBackground(async () => {
        const batch = writeBatch(db);
        const generusCol = collection(db, 'generus');
        bulkParsedData.forEach((item) => {
          const newDocRef = doc(generusCol);
          const cleanItem = Object.fromEntries(
            Object.entries(item).filter(([_, v]) => v !== undefined)
          );
          batch.set(newDocRef, cleanItem);
        });
        await batch.commit();
      });
    } catch (err: any) {
      console.error('Error bulk saving:', err);
      setAlertError(`Gagal mengimpor data massal: ${err.message}`);
      setBulkIsSubmitting(false);
    }
  };

  // Download template Excel untuk import massal
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Nama Lengkap': 'Ahmad Fauzan',
        'Jenis Kelamin': 'Laki-laki',
        'Tempat Lahir': 'Jakarta',
        'Tanggal Lahir': '2005-05-15',
        'Status Kerja': 'Pelajar / Mahasiswa',
        Kelompok: 'Gamprit 1',
        'No Telpon': '081234567890',
        'Nama Bapak': 'Bambang Muzammil',
        'Status Aktif': 'Aktif'
      },
      {
        'Nama Lengkap': 'Siti Nur Aisyah',
        'Jenis Kelamin': 'Perempuan',
        'Tempat Lahir': 'Bekasi',
        'Tanggal Lahir': '2004-08-20',
        'Status Kerja': 'Karyawan',
        Kelompok: 'TMII 1',
        'No Telpon': '081398765432',
        'Nama Bapak': 'Suryadi',
        'Status Aktif': 'Aktif'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Generus');
    XLSX.writeFile(wb, 'Template_Import_Massal_Generus.xlsx');
  };

  return (
    <div id="data-generus-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Alert Banner */}
      {alertSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="font-medium text-sm">{alertSuccess}</p>
          </div>
          <button 
            onClick={() => setAlertSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 text-sm font-semibold cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {alertError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <p className="font-medium text-sm">{alertError}</p>
          </div>
          <button 
            onClick={() => setAlertError(null)}
            className="text-rose-700 hover:text-rose-900 text-sm font-semibold cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Header Card */}
      <div id="generus-header-card" className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FDF2F2] border border-[#F2CECF] text-[#A83236] text-xs font-semibold mb-2">
              <Users className="w-3.5 h-3.5 text-[#A83236]" />
              Manajemen Data Generus (Admin)
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Kelola Data & Profil Generus
            </h1>
            <p className="text-slate-600 text-sm mt-1">
              Data tanggal lahir dan umur terhitung otomatis, pengurutan cerdas berdasarkan nama, kelompok, umur, dan gender.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {onOpenGoogleSheets && (
              <button
                id="btn-open-sheets-sync-generus"
                type="button"
                onClick={onOpenGoogleSheets}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
                title="Sambungkan dan sinkronkan data dengan Google Spreadsheet otomatis"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Google Sheets Otomatis</span>
              </button>
            )}
            <button
              id="btn-tambah-generus"
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#A83236] hover:bg-[#92272B] active:bg-[#7A1F22] text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              Tambah Generus
            </button>
            <button
              id="btn-import-massal-modal"
              onClick={() => setIsBulkModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Unggah Massal (Excel)
            </button>
            <button
              id="btn-export-generus-excel"
              onClick={() => exportGenerusToExcel(generusList)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-500" />
              Unduh File Excel
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Cari Nama Generus / Bapak / No Telp
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                id="input-cari-generus"
                type="text"
                placeholder="Ketik pencarian..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Filter Kelompok
            </label>
            <select
              id="select-filter-kelompok-list"
              value={filterKelompok}
              onChange={(e) => setFilterKelompok(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden focus:bg-white"
            >
              <option value="Semua">Semua Kelompok</option>
              {kelompokList.map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Status Keaktifan
            </label>
            <select
              id="select-filter-status-aktif"
              value={filterStatusAktif}
              onChange={(e) => setFilterStatusAktif(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden focus:bg-white"
            >
              <option value="Semua">Semua Status</option>
              <option value="Aktif">Hanya Aktif</option>
              <option value="Nonaktif">Hanya Nonaktif</option>
            </select>
          </div>
        </div>

        {/* Quick Sorting Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
            <ArrowUpDown className="w-4 h-4 text-[#A83236]" />
            <span>Urutkan Data Berdasarkan:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              id="btn-sort-data-nama"
              onClick={() => handleSortToggle('nama')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                sortBy === 'nama'
                  ? 'bg-[#A83236] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Nama {sortBy === 'nama' ? (sortDirection === 'asc' ? 'A-Z ↑' : 'Z-A ↓') : ''}
            </button>

            <button
              type="button"
              id="btn-sort-data-kelompok"
              onClick={() => handleSortToggle('kelompok')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                sortBy === 'kelompok'
                  ? 'bg-[#A83236] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Kelompok {sortBy === 'kelompok' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
            </button>

            <button
              type="button"
              id="btn-sort-data-umur"
              onClick={() => handleSortToggle('umur')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                sortBy === 'umur'
                  ? 'bg-[#A83236] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Umur {sortBy === 'umur' ? (sortDirection === 'asc' ? 'Termuda ↑' : 'Tertua ↓') : ''}
            </button>

            <button
              type="button"
              id="btn-sort-data-gender"
              onClick={() => handleSortToggle('gender')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                sortBy === 'gender'
                  ? 'bg-[#A83236] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Gender {sortBy === 'gender' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
            </button>
          </div>
        </div>
      </div>

      {/* Table Data Generus */}
      <div id="tabel-generus-container" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-800">
            Menampilkan {filteredAndSortedGenerus.length} Generus
          </span>
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              Aktif: {generusList.filter(g => g.statusAktif).length}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
              Nonaktif: {generusList.filter(g => !g.statusAktif).length}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="py-3.5 px-4">No</th>
                <th 
                  className="py-3.5 px-4 cursor-pointer hover:text-[#A83236]"
                  onClick={() => handleSortToggle('nama')}
                >
                  <div className="flex items-center gap-1">
                    <span>Nama Lengkap</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th 
                  className="py-3.5 px-4 cursor-pointer hover:text-[#A83236]"
                  onClick={() => handleSortToggle('gender')}
                >
                  <div className="flex items-center gap-1">
                    <span>Gender</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th 
                  className="py-3.5 px-4 cursor-pointer hover:text-[#A83236]"
                  onClick={() => handleSortToggle('umur')}
                >
                  <div className="flex items-center gap-1">
                    <span>Tanggal Lahir & Umur</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th 
                  className="py-3.5 px-4 cursor-pointer hover:text-[#A83236]"
                  onClick={() => handleSortToggle('kelompok')}
                >
                  <div className="flex items-center gap-1">
                    <span>Kelompok</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3.5 px-4">Status Kerja</th>
                <th className="py-3.5 px-4">Nama Bapak & Kontak</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAndSortedGenerus.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-600">
                    <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                    <p className="font-bold text-base text-slate-800">
                      {generusList.length === 0
                        ? 'Database Generus Kosong (0 Generus)'
                        : 'Tidak ada data generus yang cocok dengan pencarian / filter'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      {generusList.length === 0
                        ? 'Klik tombol "+ Tambah Generus" di atas untuk menambahkan generus secara satuan, atau klik "Unggah Massal (Excel)" untuk mengimpor dari berkas Excel.'
                        : 'Coba ubah kata kunci pencarian atau reset filter kelompok.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredAndSortedGenerus.map((g, idx) => {
                  const umur = hitungUmur(g.tanggalLahir, g.umur || g.usia);
                  return (
                    <tr 
                      key={g.id} 
                      id={`generus-item-${g.id}`}
                      className={`hover:bg-slate-50/80 transition-colors ${!g.statusAktif ? 'bg-slate-50/50 opacity-75' : ''}`}
                    >
                      <td className="py-3.5 px-4 text-xs font-mono text-slate-600">{idx + 1}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {g.namaLengkap}
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        <span className={`px-2 py-0.5 rounded-md font-medium ${
                          g.jenisKelamin === 'Laki-laki' 
                            ? 'bg-blue-50 text-blue-800' 
                            : 'bg-rose-50 text-rose-800'
                        }`}>
                          {g.jenisKelamin}
                        </span>
                      </td>
                      {/* Tanggal Lahir dan Umur Otomatis */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-800 font-medium">
                            {g.tanggalLahir || '-'}
                          </span>
                          {umur !== null ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold whitespace-nowrap">
                              {umur} th
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </div>
                        {g.tempatLahir && g.tempatLahir !== '-' && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Kelahiran: {g.tempatLahir}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-xs px-2.5 py-1 rounded-full bg-[#FDF2F2] border border-[#F2CECF] text-[#A83236] font-semibold whitespace-nowrap">
                          {g.kelompok}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 font-medium whitespace-nowrap">
                          <Briefcase className="w-3 h-3 text-slate-500" />
                          {g.statusKerja}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        <div className="font-medium text-slate-900">Bapak: {g.namaBapak || '-'}</div>
                        <div className="text-slate-600 flex items-center gap-1 mt-0.5 font-mono text-[11px]">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {g.noTelpon || '-'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleToggleStatusAktif(g)}
                          title="Klik untuk ubah aktif/nonaktif"
                          className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full transition-all cursor-pointer ${
                            g.statusAktif
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                          }`}
                        >
                          {g.statusAktif ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                              Aktif
                            </>
                          ) : (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                              Nonaktif
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(g)}
                            title="Perbarui Profil"
                            className="p-1.5 rounded-lg text-slate-600 hover:text-[#A83236] hover:bg-[#FDF2F2] transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setGenerusToDelete(g)}
                            title="Hapus Data Generus"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Single Generus (Add / Edit) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-lg">
                {editingGenerus ? 'Perbarui Profil Generus' : 'Tambah Generus Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitSingle} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Nama Lengkap Generus *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Muhammad Ilham Muzammil"
                  value={namaLengkap}
                  onChange={(e) => setNamaLengkap(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Jenis Kelamin *
                  </label>
                  <select
                    value={jenisKelamin}
                    onChange={(e) => setJenisKelamin(e.target.value as Gender)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden"
                  >
                    <option value="Laki-laki">Laki-laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Kelompok *
                  </label>
                  <select
                    value={kelompok}
                    onChange={(e) => setKelompok(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden font-semibold"
                  >
                    {kelompokList.map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Tanggal Lahir
                  </label>
                  <input
                    type="date"
                    value={tanggalLahir}
                    onChange={(e) => handleTanggalLahirChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Umur / Usia (Tahun) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    placeholder="Contoh: 19"
                    value={umurInput}
                    onChange={(e) => handleUmurInputChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Tempat Lahir
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Jakarta"
                    value={tempatLahir}
                    onChange={(e) => setTempatLahir(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden"
                  />
                </div>
              </div>

              {(umurInput || tanggalLahir) && (
                <div className="px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Usia Generus Terhitung: <strong>{hitungUmur(tanggalLahir, umurInput) ?? umurInput ?? 0} Tahun</strong>
                    {tanggalLahir ? ` • Tanggal Lahir: ${tanggalLahir}` : ''}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Status Kerja *
                  </label>
                  <select
                    value={statusKerja}
                    onChange={(e) => setStatusKerja(e.target.value as JobStatus)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden"
                  >
                    {JOB_STATUS_OPTIONS.map(j => (
                      <option key={j} value={j}>{j}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    No Telpon / WhatsApp
                  </label>
                  <input
                    type="tel"
                    placeholder="081234567890"
                    value={noTelpon}
                    onChange={(e) => setNoTelpon(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Nama Bapak *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nama Orang Tua / Bapak"
                    value={namaBapak}
                    onChange={(e) => setNamaBapak(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Status Keaktifan
                  </label>
                  <select
                    value={statusAktif ? 'true' : 'false'}
                    onChange={(e) => setStatusAktif(e.target.value === 'true')}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden font-semibold"
                  >
                    <option value="true">Aktif Mengikuti Kegiatan</option>
                    <option value="false">Nonaktif / Tidak Aktif</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-[#A83236] hover:bg-[#92272B] active:bg-[#7A1F22] text-white text-sm font-semibold shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  {isSaving ? 'Menyimpan...' : editingGenerus ? 'Simpan Perubahan' : 'Tambahkan Generus'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Bulk Upload Excel */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">
                  Unggah Massal Profil Generus (Excel)
                </h3>
                <p className="text-xs text-slate-600">
                  Impor banyak generus sekaligus ke Firestore menggunakan file spreadsheet (.xlsx / .xls)
                </p>
              </div>
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Format Template Excel
                  </h4>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Gunakan template kolom standar agar parsing data berjalan akurat.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold cursor-pointer shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Unduh Template
                </button>
              </div>

              {/* Upload Dropzone */}
              <div className="border-2 border-dashed border-slate-300 hover:border-[#A83236] rounded-2xl p-6 text-center transition-colors">
                <input
                  type="file"
                  id="excel-file-input"
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <label htmlFor="excel-file-input" className="cursor-pointer block">
                  <Upload className="w-10 h-10 mx-auto text-[#A83236] mb-2" />
                  <span className="text-sm font-bold text-slate-900 block">
                    {bulkFileName ? `File Terpilih: ${bulkFileName}` : 'Klik untuk memilih file Excel'}
                  </span>
                  <span className="text-xs text-slate-500 mt-1 block">
                    Format yang didukung: .xlsx, .xls
                  </span>
                </label>
              </div>

              {/* Preview Parsed Rows */}
              {bulkParsedData.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Pratinjau Data ({bulkParsedData.length} baris siap diimpor):
                    </span>
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                      Valid
                    </span>
                  </div>

                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 text-xs">
                    {bulkParsedData.slice(0, 10).map((row, i) => (
                      <div key={i} className="p-2.5 flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-slate-900">{row.namaLengkap}</span>
                          <span className="text-slate-500 ml-2">({row.jenisKelamin})</span>
                          <span className="text-slate-600 ml-2">• Kelompok: {row.kelompok}</span>
                        </div>
                        <span className="text-slate-500 font-mono text-[11px]">
                          Tgl Lahir: {row.tanggalLahir}
                        </span>
                      </div>
                    ))}
                    {bulkParsedData.length > 10 && (
                      <div className="p-2 text-center text-slate-500 text-[11px] bg-slate-50">
                        ...dan {bulkParsedData.length - 10} baris lainnya
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveBulk}
                disabled={bulkParsedData.length === 0 || bulkIsSubmitting}
                className="px-5 py-2.5 rounded-xl bg-[#A83236] hover:bg-[#92272B] active:bg-[#7A1F22] disabled:bg-slate-300 text-white text-sm font-semibold shadow-xs flex items-center gap-2 cursor-pointer"
              >
                {bulkIsSubmitting ? 'Mengimpor ke Firestore...' : `Simpan Massal (${bulkParsedData.length} Generus)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Generus */}
      {generusToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 text-center mb-2">
              Hapus Data Generus?
            </h3>
            <p className="text-sm text-slate-600 text-center mb-6">
              Apakah Anda yakin ingin menghapus data <strong className="text-slate-900 font-semibold">{generusToDelete.namaLengkap}</strong> dari kelompok <strong className="text-[#A83236]">{generusToDelete.kelompok}</strong>? Tindakan ini permanen dan akan menghapus generus ini dari database Cloud Firestore.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setGenerusToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
              >
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
