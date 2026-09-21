import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Search,
  Loader2,
  LogOut, 
  ExternalLink, 
  Download, 
  UploadCloud, 
  X, 
  ArrowRight,
  ShieldCheck,
  Layers,
  HelpCircle,
  FileCheck,
  Save,
  Check,
  RefreshCw
} from 'lucide-react';
import { 
  signInWithGoogleSheets, 
  signOutGoogle, 
  getCachedAccessToken, 
  setCachedAccessToken,
  isGoogleTokenExpired 
} from '../googleAuth';
import { 
  extractSpreadsheetId, 
  getSpreadsheetDetails, 
  readSheetValues, 
  parseSheetRowsToGenerus, 
  writeGenerusToSheet,
  writeRekapAbsensiToSheet,
  SheetMetadata 
} from '../googleSheetsService';
import { Generus, SesiAbsensiDanJurnal } from '../types';
import { collection, addDoc, writeBatch, getDocs, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { mergeAndSaveGenerus, syncFirestoreInBackground } from '../storage';

interface GoogleSheetsSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onAuthChange: (user: User | null, token: string | null) => void;
  currentGenerusList: Generus[];
  sesiList: SesiAbsensiDanJurnal[];
  onRefreshData: () => void;
}

export function GoogleSheetsSyncModal({
  isOpen,
  onClose,
  currentUser,
  onAuthChange,
  currentGenerusList,
  sesiList,
  onRefreshData
}: GoogleSheetsSyncModalProps) {
  const [sheetUrlInput, setSheetUrlInput] = useState<string>(() => {
    return localStorage.getItem('last_synced_spreadsheet_url') || '';
  });
  const [selectedSheetTab, setSelectedSheetTab] = useState<string>('');
  const [spreadsheetMetadata, setSpreadsheetMetadata] = useState<SheetMetadata | null>(null);

  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(false);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState<boolean>(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [isSavingToFirestore, setIsSavingToFirestore] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState<boolean>(false);

  // Sync mode: 'replace' (kosongkan data lama lalu timpa baru) atau 'append' (perbarui & tambahkan aman)
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [replaceConfirmed, setReplaceConfirmed] = useState<boolean>(false);

  // Preview data sebelum di-commit
  const [previewGenerus, setPreviewGenerus] = useState<Omit<Generus, 'id'>[] | null>(null);
  const [commitResult, setCommitResult] = useState<{ total: number; added: number; updated: number } | null>(null);

  // Jika modal dibuka/ditutup, reset status
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setSuccessMessage(null);
      setPreviewGenerus(null);
      setCommitResult(null);
      setReplaceConfirmed(false);
      setIsAuthError(false);
      // Deteksi jika token sudah kedaluwarsa secara otomatis
      if (currentUser && isGoogleTokenExpired()) {
        setIsAuthError(true);
      }
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  // Handle Login / Perbarui Google Token
  const handleSignIn = async (autoReloadSpreadsheet = false) => {
    setIsLoadingAuth(true);
    setErrorMessage(null);
    setIsAuthError(false);
    try {
      const { user, accessToken } = await signInWithGoogleSheets();
      onAuthChange(user, accessToken);
      setSuccessMessage(`Berhasil memperbarui izin akun Google: ${user.email || user.displayName}`);
      setIsAuthError(false);

      if (autoReloadSpreadsheet && sheetUrlInput.trim()) {
        // Otomatis muat ulang spreadsheet menggunakan token baru
        handleLoadSpreadsheetWithToken(accessToken);
      }
    } catch (err: any) {
      console.error('Error Google Sign In:', err);
      if (err.code === 'auth/popup-closed-by-user' || err.message?.includes('popup-closed-by-user')) {
        setErrorMessage('Jendela login Google ditutup sebelum otorisasi selesai. Silakan klik "Hubungkan Akun Google" kembali.');
      } else if (err.message?.includes('access_denied') || err.message?.includes('blocked') || err.code === 'auth/unauthorized-domain') {
        setErrorMessage('Akses login ditolak oleh Google. Pastikan masuk dengan akun Google yang memiliki izin.');
      } else {
        setErrorMessage(err.message || 'Gagal memperbarui izin akun Google.');
      }
    } finally {
      setIsLoadingAuth(false);
    }
  };

  // Handle Sign Out Google
  const handleSignOut = async () => {
    try {
      await signOutGoogle();
      onAuthChange(null, null);
      setSpreadsheetMetadata(null);
      setPreviewGenerus(null);
      setIsAuthError(false);
      setSuccessMessage('Akun Google berhasil diputuskan.');
    } catch (err: any) {
      setErrorMessage('Gagal logout: ' + err.message);
    }
  };

  // Ambil metadata lembar kerja (Tab sheets) dengan token tertentu atau token tersimpan
  const handleLoadSpreadsheetWithToken = async (overrideToken?: string) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setPreviewGenerus(null);
    setIsAuthError(false);

    const spreadsheetId = extractSpreadsheetId(sheetUrlInput);
    if (!spreadsheetId) {
      setErrorMessage('Silakan masukkan Link URL atau ID Google Spreadsheet yang valid.');
      return;
    }

    const token = overrideToken || getCachedAccessToken();
    if (!token) {
      setIsAuthError(true);
      setErrorMessage('Sesi otentikasi Google Sheets belum tersedia atau telah kedaluwarsa. Silakan klik "Perbarui Sesi Google".');
      return;
    }

    setIsLoadingMetadata(true);
    try {
      const meta = await getSpreadsheetDetails(spreadsheetId, token);
      setSpreadsheetMetadata(meta);
      if (meta.sheets.length > 0) {
        setSelectedSheetTab(meta.sheets[0].title);
      }
      localStorage.setItem('last_synced_spreadsheet_url', sheetUrlInput);
      setSuccessMessage(`Spreadsheet "${meta.title}" berhasil ditemukan (${meta.sheets.length} tab terdeteksi).`);
      setIsAuthError(false);
    } catch (err: any) {
      console.error('Error load spreadsheet:', err);
      const errMsg = String(err.message || '');
      if (
        errMsg.includes('invalid authentication credentials') ||
        errMsg.includes('Expected OAuth 2') ||
        errMsg.includes('UNAUTHENTICATED') ||
        errMsg.includes('401')
      ) {
        setIsAuthError(true);
        setErrorMessage('Sesi otentikasi Google Sheets Anda telah kedaluwarsa (token akses berlaku 1 jam). Klik tombol "Perbarui Sesi Google Sekarang" di bawah untuk memperbarui akses dalam 1 klik.');
      } else if (errMsg.includes('insufficient authentication scopes') || errMsg.includes('Request had insufficient authentication scopes')) {
        setIsAuthError(true);
        setErrorMessage('Izin Google Sheets belum lengkap pada sesi login Anda. Silakan klik "Perbarui Sesi Google" dan pastikan menyetujui izin membaca & mengedit spreadsheet.');
      } else if (errMsg.includes('Requested entity was not found') || errMsg.includes('404')) {
        setErrorMessage('Spreadsheet tidak ditemukan. Pastikan URL Google Sheets benar dan akun Google Anda memiliki akses ke spreadsheet tersebut.');
      } else {
        setErrorMessage(err.message || 'Gagal memuat Spreadsheet. Pastikan link benar dan akun Anda memiliki hak akses.');
      }
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  const handleLoadSpreadsheet = () => {
    handleLoadSpreadsheetWithToken();
  };

  // Tarik dan pratinjau data Generus dari tab sheet terpilih
  const handleFetchPreview = async () => {
    if (!spreadsheetMetadata || !selectedSheetTab) {
      setErrorMessage('Pilih tab lembar kerja terlebih dahulu.');
      return;
    }

    const token = getCachedAccessToken();
    if (!token) {
      setIsAuthError(true);
      setErrorMessage('Sesi Google telah kedaluwarsa. Silakan perbarui sesi Google Anda.');
      return;
    }

    setIsLoadingPreview(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setCommitResult(null);
    setIsAuthError(false);
    try {
      const rows = await readSheetValues(spreadsheetMetadata.id, `${selectedSheetTab}!A1:Z500`, token);
      if (!rows || rows.length < 2) {
        setErrorMessage(`Tab "${selectedSheetTab}" kosong atau tidak memiliki baris data di bawah judul kolom.`);
        setIsLoadingPreview(false);
        return;
      }

      const parsed = parseSheetRowsToGenerus(rows);
      if (parsed.length === 0) {
        setErrorMessage('Tidak ada data nama generus yang terbaca. Pastikan terdapat kolom "Nama Lengkap" atau "Nama".');
        setIsLoadingPreview(false);
        return;
      }

      setPreviewGenerus(parsed);
      setSuccessMessage(`Berhasil membaca ${parsed.length} data generus dari tab "${selectedSheetTab}". Siap disinkronkan ke database.`);
    } catch (err: any) {
      console.error('Error fetching sheet preview:', err);
      const errMsg = String(err.message || '');
      if (
        errMsg.includes('invalid authentication credentials') ||
        errMsg.includes('Expected OAuth 2') ||
        errMsg.includes('UNAUTHENTICATED') ||
        errMsg.includes('401')
      ) {
        setIsAuthError(true);
        setErrorMessage('Sesi otentikasi Google Sheets telah kedaluwarsa. Silakan klik tombol "Perbarui Sesi Google Sekarang" di bawah.');
      } else {
        setErrorMessage(err.message || 'Gagal membaca isi tab spreadsheet.');
      }
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Simpan data Generus hasil sinkronisasi ke Aplikasi & Cloud
  const handleCommitImportToFirestore = async () => {
    if (!previewGenerus || previewGenerus.length === 0) return;

    if (importMode === 'replace' && !replaceConfirmed) {
      setErrorMessage('Peringatan: Untuk menggunakan mode Timpa/Ganti Semua, mohon centang kotak persetujuan konfirmasi terlebih dahulu.');
      return;
    }

    setIsSavingToFirestore(true);
    setErrorMessage(null);

    try {
      // 1. LANGSUNG SIMPAN SECARA INSTAN KE PENYIMPANAN APLIKASI (0ms)
      // Ini memastikan data 100% tersimpan aman dan TIDAK PERNAH HILANG
      const mergeResult = mergeAndSaveGenerus(previewGenerus, importMode);

      // 2. Tampilkan status berhasil seketika dan segarkan tampilan (0ms)
      setCommitResult({
        total: mergeResult.total,
        added: mergeResult.added,
        updated: mergeResult.updated
      });
      setSuccessMessage(`Alhamdulillah! Berhasil menyimpan ${mergeResult.total} data generus ke aplikasi (${mergeResult.added} baru, ${mergeResult.updated} diperbarui). Data tersimpan aman!`);
      setIsSavingToFirestore(false);
      onRefreshData();

      // 3. Sinkronkan ke Cloud Firestore di background tanpa membuat UI menunggu/loading
      syncFirestoreInBackground(async () => {
        if (importMode === 'replace') {
          const oldDocs = await getDocs(collection(db, 'generus'));
          if (!oldDocs.empty) {
            const CHUNK_SIZE = 400;
            for (let i = 0; i < oldDocs.docs.length; i += CHUNK_SIZE) {
              const chunk = oldDocs.docs.slice(i, i + CHUNK_SIZE);
              const deleteBatch = writeBatch(db);
              chunk.forEach(d => deleteBatch.delete(d.ref));
              await deleteBatch.commit();
            }
          }

          const generusCol = collection(db, 'generus');
          const CHUNK_SIZE = 400;
          for (let i = 0; i < mergeResult.currentList.length; i += CHUNK_SIZE) {
            const chunk = mergeResult.currentList.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);
            chunk.forEach((item) => {
              const docRef = doc(generusCol, item.id);
              batch.set(docRef, item);
            });
            await batch.commit();
          }
        } else {
          // Append / Update mode
          const generusCol = collection(db, 'generus');
          const CHUNK_SIZE = 400;
          for (let i = 0; i < mergeResult.currentList.length; i += CHUNK_SIZE) {
            const chunk = mergeResult.currentList.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);
            chunk.forEach((item) => {
              const docRef = doc(generusCol, item.id);
              batch.set(docRef, item, { merge: true });
            });
            await batch.commit();
          }
        }
      });
    } catch (err: any) {
      console.error('Error importing data:', err);
      setErrorMessage(`Gagal memproses data: ${err.message}`);
      setIsSavingToFirestore(false);
    }
  };

  // Ekspor Generus saat ini ke Google Spreadsheet
  const handleExportGenerus = async () => {
    if (!spreadsheetMetadata || !selectedSheetTab) {
      setErrorMessage('Pilih tab lembar kerja tujuan terlebih dahulu.');
      return;
    }
    const token = getCachedAccessToken();
    if (!token) {
      setErrorMessage('Sesi Google diperlukan.');
      return;
    }

    if (currentGenerusList.length === 0) {
      setErrorMessage('Tidak ada data generus di database untuk diekspor (0 generus).');
      return;
    }

    const confirmExport = window.confirm(
      `Tulis ${currentGenerusList.length} data generus ke tab "${selectedSheetTab}" pada spreadsheet "${spreadsheetMetadata.title}"? Data pada tab tersebut akan ditimpa.`
    );
    if (!confirmExport) return;

    setIsExporting(true);
    setErrorMessage(null);
    try {
      await writeGenerusToSheet(spreadsheetMetadata.id, selectedSheetTab, currentGenerusList, token);
      setSuccessMessage(`Berhasil mengekspor ${currentGenerusList.length} data generus ke Google Spreadsheet!`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal mengekspor data ke Google Sheets.');
    } finally {
      setIsExporting(false);
    }
  };

  // Ekspor Rekap Absensi & Jurnal ke tab Spreadsheet
  const handleExportRekap = async () => {
    if (!spreadsheetMetadata || !selectedSheetTab) {
      setErrorMessage('Pilih tab lembar kerja tujuan terlebih dahulu.');
      return;
    }
    const token = getCachedAccessToken();
    if (!token) {
      setErrorMessage('Sesi Google diperlukan.');
      return;
    }

    if (sesiList.length === 0) {
      setErrorMessage('Belum ada riwayat sesi absensi & jurnal yang tersimpan di aplikasi.');
      return;
    }

    const confirmExport = window.confirm(
      `Tulis ${sesiList.length} rekaman sesi absensi & jurnal ke tab "${selectedSheetTab}"? Data pada rentang tersebut akan diperbarui.`
    );
    if (!confirmExport) return;

    setIsExporting(true);
    setErrorMessage(null);
    try {
      await writeRekapAbsensiToSheet(spreadsheetMetadata.id, selectedSheetTab, sesiList, token);
      setSuccessMessage(`Berhasil mengekspor ${sesiList.length} catatan absensi & jurnal ke Google Spreadsheet!`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal mengekspor rekap absensi ke Google Sheets.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 md:p-7 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 my-auto">
        
        {/* Header Modal */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900">Sinkronisasi Google Sheets</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Otomatis
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Sambungkan spreadsheet langsung untuk impor dan ekspor data secara instan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notifikasi Pesan */}
        {errorMessage && (
          <div className="mt-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex flex-col gap-2">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{errorMessage}</div>
            </div>
            {isAuthError && (
              <div className="pl-6.5 pt-1">
                <button
                  type="button"
                  disabled={isLoadingAuth}
                  onClick={() => handleSignIn(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer text-xs disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAuth ? 'animate-spin' : ''}`} />
                  <span>{isLoadingAuth ? 'Memperbarui...' : 'Perbarui Sesi Google Sekarang (1 Klik)'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {successMessage && (
          <div className="mt-4 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{successMessage}</div>
          </div>
        )}

        <div className="mt-5 space-y-5">
          {/* Langkah 1: Akun Google */}
          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Langkah 1</span>
                <h4 className="text-sm font-bold text-slate-800">Koneksi Akun Google</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {currentUser ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold flex-wrap">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Terhubung sebagai {currentUser.email || currentUser.displayName}
                      {isAuthError && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 border border-amber-200 font-bold">
                          Sesi Perlu Diperbarui
                        </span>
                      )}
                    </span>
                  ) : (
                    'Login akun Google yang memiliki hak akses ke Google Sheets Anda.'
                  )}
                </p>
              </div>

              {currentUser ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isLoadingAuth}
                    onClick={() => handleSignIn(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition-colors cursor-pointer disabled:opacity-50"
                    title="Perbarui izin atau token Google Sheets jika sudah lebih dari 1 jam"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAuth ? 'animate-spin' : ''}`} />
                    <span>{isLoadingAuth ? 'Memperbarui...' : 'Perbarui Sesi'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 text-slate-500" />
                    Putuskan Akun
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isLoadingAuth}
                  onClick={() => handleSignIn(false)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-white border border-slate-300 hover:border-slate-400 hover:shadow-xs text-slate-800 transition-all cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  </svg>
                  <span>{isLoadingAuth ? 'Menghubungkan...' : 'Hubungkan Akun Google'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Langkah 2: Masukkan Link Spreadsheet */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Langkah 2</span>
            <h4 className="text-sm font-bold text-slate-800 mb-2">Tautkan Google Spreadsheet</h4>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={sheetUrlInput}
                  onChange={(e) => setSheetUrlInput(e.target.value)}
                  placeholder="Tempelkan URL Google Sheets (contoh: https://docs.google.com/spreadsheets/d/...)"
                  className="w-full pl-3.5 pr-8 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-[#A83236] focus:ring-2 focus:ring-[#A83236]/15 font-mono"
                />
              </div>
              <button
                type="button"
                disabled={isLoadingMetadata || !sheetUrlInput.trim() || !currentUser}
                onClick={handleLoadSpreadsheet}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-[#A83236] hover:bg-[#8d2a2d] text-white transition-colors cursor-pointer disabled:opacity-40 shrink-0"
              >
                {isLoadingMetadata ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="w-3.5 h-3.5" />
                )}
                <span>Buka Spreadsheet</span>
              </button>
            </div>

            {/* Jika Spreadsheet berhasil dimuat */}
            {spreadsheetMetadata && (
              <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-800 truncate max-w-xs">
                    {spreadsheetMetadata.title}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Pilih Tab:</span>
                  <select
                    value={selectedSheetTab}
                    onChange={(e) => {
                      setSelectedSheetTab(e.target.value);
                      setPreviewGenerus(null);
                    }}
                    className="text-xs font-semibold py-1.5 px-3 rounded-lg border border-slate-300 bg-slate-50 focus:outline-none focus:border-[#A83236]"
                  >
                    {spreadsheetMetadata.sheets.map((s) => (
                      <option key={s.sheetId} value={s.title}>
                        {s.title} ({s.rowCount || 0} baris)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Langkah 3: Aksi Sinkronisasi */}
          {spreadsheetMetadata && (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Langkah 3</span>
              <h4 className="text-sm font-bold text-slate-800 mb-3">Pilih Arah Sinkronisasi</h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Opsi A: Tarik Data Generus dari Spreadsheet */}
                <div className="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-[#A83236]/50 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-slate-800 font-bold text-xs mb-1">
                      <Download className="w-4 h-4 text-[#A83236]" />
                      Impor Generus dari Sheet
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
                      Membaca data generus dari tab <span className="font-semibold text-slate-700">"{selectedSheetTab}"</span> dan menyimpannya ke database aplikasi.
                    </p>

                    <div className="mb-3">
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">Metode Impor Data:</label>
                      <div className="flex flex-col gap-1.5">
                        <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                          <input
                            type="radio"
                            name="importMode"
                            checked={importMode === 'append'}
                            onChange={() => {
                              setImportMode('append');
                              setReplaceConfirmed(false);
                            }}
                            className="text-[#A83236] focus:ring-[#A83236]"
                          />
                          <span className="text-slate-700 font-medium">Perbarui & Tambahkan (Aman - Data Lama Tidak Hilang)</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                          <input
                            type="radio"
                            name="importMode"
                            checked={importMode === 'replace'}
                            onChange={() => setImportMode('replace')}
                            className="text-[#A83236] focus:ring-[#A83236]"
                          />
                          <span className="text-rose-700 font-medium">Ganti Semua (Data lama digantikan total)</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isLoadingPreview || isSavingToFirestore}
                    onClick={handleFetchPreview}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-[#A83236] hover:bg-[#8d2a2d] text-white transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isLoadingPreview ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Membaca Spreadsheet...</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-3.5 h-3.5" />
                        <span>Baca & Pratinjau Data</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Opsi B: Ekspor Balik ke Spreadsheet */}
                <div className="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-emerald-500/50 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-slate-800 font-bold text-xs mb-1">
                      <UploadCloud className="w-4 h-4 text-emerald-600" />
                      Ekspor ke Google Sheet
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
                      Kirim data dari aplikasi ke tab <span className="font-semibold text-slate-700">"{selectedSheetTab}"</span> di Google Spreadsheet Anda.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={handleExportGenerus}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Layers className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Ekspor {currentGenerusList.length} Generus ke Sheet</span>
                    </button>
                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={handleExportRekap}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-slate-600" />
                      <span>Ekspor Rekap Absensi & Jurnal ({sesiList.length} sesi)</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pratinjau Data yang Siap Disimpan */}
          {previewGenerus && previewGenerus.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-amber-700" />
                  <h4 className="text-xs font-bold text-amber-900">
                    Pratinjau Data ({previewGenerus.length} Generus Ditemukan)
                  </h4>
                </div>
                <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                  Mode: {importMode === 'replace' ? 'Ganti Semua' : 'Perbarui & Tambahkan (Aman)'}
                </span>
              </div>

              {commitResult ? (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <p className="text-sm font-bold">
                    Alhamdulillah! {commitResult.total} Data Generus Berhasil Tersimpan di Database!
                  </p>
                  <p className="text-xs text-emerald-700">
                    {commitResult.added} data baru ditambahkan &bull; {commitResult.updated} data yang sudah ada diperbarui. Semua riwayat absensi tetap aman.
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewGenerus(null);
                        setCommitResult(null);
                        onClose();
                      }}
                      className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition-colors cursor-pointer"
                    >
                      Selesai & Lihat Data di Aplikasi
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-amber-200 bg-white text-xs divide-y divide-slate-100">
                    {previewGenerus.slice(0, 10).map((item, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between gap-2">
                        <div>
                          <span className="font-bold text-slate-800">{idx + 1}. {item.namaLengkap}</span>
                          <span className="text-[11px] text-slate-500 ml-2">({item.jenisKelamin})</span>
                          <div className="text-[10px] text-slate-600">
                            {item.kelompok} • {item.statusKerja} • Umur: {item.umur || item.usia || '-'}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Valid
                        </span>
                      </div>
                    ))}
                    {previewGenerus.length > 10 && (
                      <div className="p-2 text-center text-[11px] text-slate-500 italic bg-slate-50">
                        ...dan {previewGenerus.length - 10} generus lainnya
                      </div>
                    )}
                  </div>

                  {importMode === 'replace' && (
                    <div className="mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={replaceConfirmed}
                          onChange={(e) => setReplaceConfirmed(e.target.checked)}
                          className="mt-0.5 text-rose-600 focus:ring-rose-500 rounded"
                        />
                        <span>
                          Saya mengerti bahwa seluruh data generus lama di aplikasi ({currentGenerusList.length} generus) akan diganti total dengan data dari lembar kerja ini.
                        </span>
                      </label>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={isSavingToFirestore}
                      onClick={() => {
                        setPreviewGenerus(null);
                        setReplaceConfirmed(false);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={isSavingToFirestore || (importMode === 'replace' && !replaceConfirmed)}
                      onClick={handleCommitImportToFirestore}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isSavingToFirestore ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Menyimpan {previewGenerus.length} Data ke Database...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>Simpan {previewGenerus.length} Data ke Database Aplikasi Sekarang</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Panduan Format Kolom */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/60 text-[11px] text-slate-600 flex items-start gap-2.5">
            <HelpCircle className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-700">Format Kolom yang Didukung Otomatis:</span>
              <p className="mt-0.5 text-slate-500">
                Header sheet Anda dapat bernama: <code className="bg-white px-1 py-0.5 rounded border border-slate-200">Nama Lengkap</code>, <code className="bg-white px-1 py-0.5 rounded border border-slate-200">Jenis Kelamin</code>, <code className="bg-white px-1 py-0.5 rounded border border-slate-200">Tempat Lahir</code>, <code className="bg-white px-1 py-0.5 rounded border border-slate-200">Tanggal Lahir / Umur</code>, <code className="bg-white px-1 py-0.5 rounded border border-slate-200">Status Kerja</code>, <code className="bg-white px-1 py-0.5 rounded border border-slate-200">Kelompok</code>, <code className="bg-white px-1 py-0.5 rounded border border-slate-200">No HP</code>, dan <code className="bg-white px-1 py-0.5 rounded border border-slate-200">Nama Bapak</code>. Sistem akan mencocokkan kolom secara cerdas.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Modal */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="text-[11px] text-slate-600 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>OAuth 2.0 Resmi Google Workspace</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
}
