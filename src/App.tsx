import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  getDocs, 
  addDoc, 
  doc, 
  setDoc,
  getDoc,
  writeBatch,
  deleteDoc
} from 'firebase/firestore';
import { db } from './firebase';
import { Generus, SesiAbsensiDanJurnal, PengingatHarianConfig } from './types';
import { 
  getLocalGenerus, 
  saveLocalGenerus, 
  getLocalSesi, 
  saveLocalSesi, 
  getLocalPengaturan, 
  saveLocalPengaturan, 
  DATA_UPDATED_EVENT 
} from './storage';
import { AbsensiPage } from './components/AbsensiPage';
import { GrafikPerformaPage } from './components/GrafikPerformaPage';
import { RekapJurnalPage } from './components/RekapJurnalPage';
import { DataGenerusPage } from './components/DataGenerusPage';
import { PengingatModal } from './components/PengingatModal';
import { MuzarLogo } from './components/MuzarLogo';
import { GoogleSheetsSyncModal } from './components/GoogleSheetsSyncModal';
import { initGoogleAuth } from './googleAuth';
import { User } from 'firebase/auth';
import { 
  ClipboardCheck, 
  BarChart3, 
  BookText, 
  Users, 
  Bell, 
  Sparkles, 
  CheckCircle2, 
  Menu, 
  X, 
  Cloud,
  Database,
  Calendar,
  AlertCircle,
  Loader2,
  FileSpreadsheet
} from 'lucide-react';

type TabView = 'absensi' | 'grafik' | 'jurnal' | 'generus';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabView>('absensi');
  // Inisialisasi seketika dari local storage agar data tidak pernah hilang atau blank
  const [generusList, setGenerusList] = useState<Generus[]>(() => getLocalGenerus());
  const [sesiList, setSesiList] = useState<SesiAbsensiDanJurnal[]>(() => getLocalSesi());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Pengingat Harian State
  const [isPengingatOpen, setIsPengingatOpen] = useState<boolean>(false);
  const [pengingatConfig, setPengingatConfig] = useState<PengingatHarianConfig>(() => getLocalPengaturan());
  const [showDailyReminderBanner, setShowDailyReminderBanner] = useState<boolean>(false);

  // Google Sheets Integration State
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubAuth = initGoogleAuth(
      (user) => {
        setCurrentUser(user);
      },
      () => {
        setCurrentUser(null);
      }
    );
    return () => unsubAuth();
  }, []);

  // Sinkronisasi event internal antar-komponen aplikasi
  useEffect(() => {
    const handleSyncEvent = () => {
      setGenerusList(getLocalGenerus());
      setSesiList(getLocalSesi());
      setPengingatConfig(getLocalPengaturan());
    };
    window.addEventListener(DATA_UPDATED_EVENT, handleSyncEvent);
    return () => window.removeEventListener(DATA_UPDATED_EVENT, handleSyncEvent);
  }, []);

  // 1. Real-time Listener Generus dari Firestore
  useEffect(() => {
    const generusCol = collection(db, 'generus');
    const unsub = onSnapshot(generusCol, (snapshot) => {
      if (!snapshot.empty) {
        const list: Generus[] = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        } as Generus));
        
        list.sort((a, b) => a.namaLengkap.localeCompare(b.namaLengkap));
        setGenerusList(list);
        saveLocalGenerus(list);
      }
      setIsLoading(false);
    }, (error) => {
      console.warn('Firestore real-time listener berjalan dalam mode penyimpanan lokal offline:', error.message);
      setIsLoading(false);
    });

    return () => unsub();
  }, []);

  // 2. Real-time Listener Sesi Absensi & Jurnal Materi dari Firestore
  useEffect(() => {
    const sesiCol = collection(db, 'sesi_absensi');
    const q = query(sesiCol, orderBy('tanggal', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const list: SesiAbsensiDanJurnal[] = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        } as SesiAbsensiDanJurnal));
        setSesiList(list);
        saveLocalSesi(list);
      }
    }, (error) => {
      console.warn('Firestore sesi listener berjalan dalam mode penyimpanan lokal offline:', error.message);
    });

    return () => unsub();
  }, []);

  // 3. Load Pengingat Config from Firestore
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const configDoc = await getDoc(doc(db, 'pengaturan', 'pengingat_harian'));
        if (configDoc.exists()) {
          const data = configDoc.data() as PengingatHarianConfig;
          setPengingatConfig(data);
          saveLocalPengaturan(data);
          
          // Check if today already has attendance logged
          const today = new Date().toISOString().split('T')[0];
          const hasAttendedToday = sesiList.some(s => s.tanggal === today);
          if (data.aktif && !hasAttendedToday) {
            setShowDailyReminderBanner(true);
          }
        }
      } catch (err) {
        console.warn('Pengaturan belum dibuat di firestore:', err);
      }
    };
    loadConfig();
  }, [sesiList]);

  // Handle Save Pengingat Config
  const handleSavePengingatConfig = async (newConfig: PengingatHarianConfig) => {
    // Simpan lokal seketika
    saveLocalPengaturan(newConfig);
    setPengingatConfig(newConfig);

    // Sanitize to avoid Firestore 'Unsupported field value: undefined'
    try {
      const cleanConfig: Record<string, any> = {
        aktif: Boolean(newConfig.aktif),
        jamPengingat: newConfig.jamPengingat || '17:00',
        pesanPengingat: newConfig.pesanPengingat || '',
        targetNoWaGuru: newConfig.targetNoWaGuru || '',
      };
      if (newConfig.terakhirDikirim) {
        cleanConfig.terakhirDikirim = newConfig.terakhirDikirim;
      }
      await setDoc(doc(db, 'pengaturan', 'pengingat_harian'), cleanConfig, { merge: true });
    } catch (err) {
      console.warn('Gagal menyimpan pengaturan ke Cloud Firestore, tersimpan di lokal:', err);
    }
  };

  const activeGenerusCount = generusList.filter(g => g.statusAktif).length;

  return (
    <div className="min-h-screen bg-[#FAF8F6] flex flex-col font-sans text-slate-800 antialiased selection:bg-[#A83236] selection:text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#F0E6E4] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            {/* Logo & Branding */}
            <div className="flex items-center gap-3">
              <MuzarLogo size="md" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-lg sm:text-xl tracking-tight text-slate-900">
                    Absensi Gen.muzar
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FEF7ED] text-[#9A5B00] border border-[#FCE3B8]">
                    <Cloud className="w-3 h-3 text-[#E29515]" />
                    Cloud Real-time
                  </span>
                </div>
                <p className="text-xs text-slate-500 hidden sm:block">
                  Sistem Presensi & Jurnal Materi Pembelajaran Generus
                </p>
              </div>
            </div>

            {/* Desktop Navigation Tabs */}
            <nav className="hidden md:flex items-center gap-1 bg-[#F5EFEF]/80 p-1.5 rounded-2xl border border-[#EADBDB]">
              <button
                id="nav-tab-absensi"
                onClick={() => setActiveTab('absensi')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  activeTab === 'absensi'
                    ? 'bg-[#A83236] text-white shadow-xs'
                    : 'text-slate-600 hover:text-[#A83236] hover:bg-[#FDF2F2]'
                }`}
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>Absensi & Jurnal</span>
              </button>

              <button
                id="nav-tab-grafik"
                onClick={() => setActiveTab('grafik')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  activeTab === 'grafik'
                    ? 'bg-[#A83236] text-white shadow-xs'
                    : 'text-slate-600 hover:text-[#A83236] hover:bg-[#FDF2F2]'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span>Grafik Bulanan</span>
              </button>

              <button
                id="nav-tab-jurnal"
                onClick={() => setActiveTab('jurnal')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  activeTab === 'jurnal'
                    ? 'bg-[#A83236] text-white shadow-xs'
                    : 'text-slate-600 hover:text-[#A83236] hover:bg-[#FDF2F2]'
                }`}
              >
                <BookText className="w-4 h-4" />
                <span>Rekap Jurnal</span>
              </button>

              <button
                id="nav-tab-generus"
                onClick={() => setActiveTab('generus')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  activeTab === 'generus'
                    ? 'bg-[#A83236] text-white shadow-xs'
                    : 'text-slate-600 hover:text-[#A83236] hover:bg-[#FDF2F2]'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Data Generus</span>
              </button>
            </nav>

            {/* Quick Actions (Google Sheets, Pengingat Harian, Reset Data & Mobile Toggle) */}
            <div className="flex items-center gap-2">
              <button
                id="btn-open-google-sheets-nav"
                onClick={() => setIsSheetsModalOpen(true)}
                title="Sinkronisasi Google Sheets Otomatis"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span className="hidden sm:inline">Google Sheets</span>
                {currentUser && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                )}
              </button>

              <button
                id="btn-open-pengingat"
                onClick={() => setIsPengingatOpen(true)}
                title="Pengingat Harian Guru"
                className="relative flex items-center gap-2 px-3 py-2 rounded-xl bg-[#FEF7ED] hover:bg-[#FDEED3] border border-[#FCE3B8] text-[#9A5B00] text-xs font-semibold transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4 text-[#D98205]" />
                <span className="hidden sm:inline">Pengingat Guru</span>
                {pengingatConfig.aktif && (
                  <span className="w-2 h-2 rounded-full bg-[#F5A623] animate-ping absolute -top-0.5 -right-0.5"></span>
                )}
              </button>

              {/* Mobile Menu Toggle */}
              <button
                id="btn-mobile-menu-toggle"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 rounded-xl bg-[#F5EFEF] hover:bg-[#EADBDB] text-slate-700"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-[#F0E6E4] bg-white px-4 py-3 space-y-1">
            <button
              onClick={() => {
                setActiveTab('absensi');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold ${
                activeTab === 'absensi' ? 'bg-[#FDF2F2] text-[#A83236]' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <ClipboardCheck className="w-4 h-4" />
              Absensi Guru & Jurnal Materi
            </button>
            <button
              onClick={() => {
                setActiveTab('grafik');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold ${
                activeTab === 'grafik' ? 'bg-[#FDF2F2] text-[#A83236]' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Grafik Kehadiran Bulanan
            </button>
            <button
              onClick={() => {
                setActiveTab('jurnal');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold ${
                activeTab === 'jurnal' ? 'bg-[#FDF2F2] text-[#A83236]' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <BookText className="w-4 h-4" />
              Rekap Jurnal Materi Harian
            </button>
            <button
              onClick={() => {
                setActiveTab('generus');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold ${
                activeTab === 'generus' ? 'bg-[#FDF2F2] text-[#A83236]' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Users className="w-4 h-4" />
              Kelola Data Seluruh Generus
            </button>
            <div className="pt-2 border-t border-slate-100 space-y-1">
              <button
                id="btn-mobile-sheets-sync"
                onClick={() => {
                  setIsSheetsModalOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Sinkronisasi Google Sheets
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Banner Pengingat Harian Alert (Jika aktif & belum ada absensi hari ini) */}
      {showDailyReminderBanner && (
        <div className="bg-[#FEF7ED] border-b border-[#FCE3B8] px-4 py-2.5 text-xs text-[#8A4F00]">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#D98205] shrink-0" />
              <span>
                <strong>Pengingat Harian:</strong> Jadwal pengingat jam {pengingatConfig.jamPengingat} WIB. Jangan lupa input absensi generus & jurnal materi hari ini.
              </span>
            </div>
            <button
              onClick={() => setShowDailyReminderBanner(false)}
              className="text-[#8A4F00] hover:text-[#5A3300] font-bold px-2 py-0.5"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Content Body */}
      <main className="flex-1 pb-16">
        {isLoading ? (
          <div className="max-w-7xl mx-auto px-4 py-20 text-center space-y-3">
            <div className="w-10 h-10 border-3 border-[#A83236] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-sm font-medium text-slate-600">Menghubungkan ke Cloud Firestore...</p>
          </div>
        ) : (
          <>
            {activeTab === 'absensi' && (
              <AbsensiPage 
                generusList={generusList} 
                onSuccessSave={() => {
                  // After save, user can stay or switch
                }}
              />
            )}

            {activeTab === 'grafik' && (
              <GrafikPerformaPage 
                sesiList={sesiList} 
                generusList={generusList} 
              />
            )}

            {activeTab === 'jurnal' && (
              <RekapJurnalPage 
                sesiList={sesiList} 
                onOpenGoogleSheets={() => setIsSheetsModalOpen(true)}
              />
            )}

            {activeTab === 'generus' && (
              <DataGenerusPage 
                generusList={generusList} 
                onRefresh={() => {}}
                onOpenGoogleSheets={() => setIsSheetsModalOpen(true)}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200/80 py-6 text-xs text-slate-500 text-center">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} Absensi Gen.muzar — Sistem Presensi & Jurnal Pengajar Generus Berbasis Cloud.</p>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Data Tersinkronisasi Cloud Firestore</span>
            <span>•</span>
            <span>Ekspor PDF & Excel Otomatis</span>
          </div>
        </div>
      </footer>

      {/* Pengingat Modal */}
      <PengingatModal
        isOpen={isPengingatOpen}
        onClose={() => setIsPengingatOpen(false)}
        config={pengingatConfig}
        onSaveConfig={handleSavePengingatConfig}
        totalGenerusAktif={activeGenerusCount}
      />

      {/* Modal Sinkronisasi Google Sheets Otomatis */}
      <GoogleSheetsSyncModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
        currentUser={currentUser}
        onAuthChange={(user, token) => {
          setCurrentUser(user);
        }}
        currentGenerusList={generusList}
        sesiList={sesiList}
        onRefreshData={() => {
          setGenerusList(getLocalGenerus());
          setSesiList(getLocalSesi());
        }}
      />
    </div>
  );
}
