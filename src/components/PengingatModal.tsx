import React, { useState } from 'react';
import { PengingatHarianConfig } from '../types';
import { 
  Bell, 
  Send, 
  CheckCircle2, 
  MessageSquare, 
  Clock, 
  Info,
  Calendar,
  Sparkles,
  Users
} from 'lucide-react';

interface PengingatModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: PengingatHarianConfig;
  onSaveConfig: (newConfig: PengingatHarianConfig) => Promise<void>;
  totalGenerusAktif: number;
}

export const PengingatModal: React.FC<PengingatModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  totalGenerusAktif
}) => {
  const [aktif, setAktif] = useState<boolean>(config.aktif ?? true);
  const [jamPengingat, setJamPengingat] = useState<string>(config.jamPengingat || '17:00');
  const [targetNoWaGuru, setTargetNoWaGuru] = useState<string>(config.targetNoWaGuru || '');
  const [pesanPengingat, setPesanPengingat] = useState<string>(
    config.pesanPengingat ||
      `Assalamu'alaikum Wr. Wb. Pengingat Harian: Kepada Bapak/Ibu Guru pengajar, mohon untuk mengisi Presensi Kehadiran Generus dan Jurnal Materi pembelajaran hari ini di aplikasi Absensi Gen.muzar. Terima kasih.`
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMsg(null);
    try {
      const payload: PengingatHarianConfig = {
        aktif,
        jamPengingat,
        pesanPengingat,
        targetNoWaGuru
      };
      if (config.terakhirDikirim) {
        payload.terakhirDikirim = config.terakhirDikirim;
      }
      await onSaveConfig(payload);
      setStatusMsg('Pengaturan pengingat harian berhasil diperbarui!');
      setTimeout(() => {
        setStatusMsg(null);
      }, 3000);
    } catch (err: any) {
      console.error(err);
      setStatusMsg(`Gagal menyimpan: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Broadcast manual via WhatsApp Web/App
  const handleKirimWhatsAppSekarang = () => {
    const encodedText = encodeURIComponent(pesanPengingat);
    let url = `https://wa.me/?text=${encodedText}`;
    if (targetNoWaGuru.trim()) {
      const cleanPhone = targetNoWaGuru.replace(/[^0-9]/g, '');
      const formatted = cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone;
      url = `https://wa.me/${formatted}?text=${encodedText}`;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FDF2F2] border border-[#F2CECF] flex items-center justify-center text-[#A83236]">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Pengingat Harian Guru
              </h3>
              <p className="text-xs text-slate-600">
                Pengingat otomatis waktu pengisian absensi & jurnal generus
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
          {statusMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <div>
              <span className="font-semibold text-slate-900 text-sm block">Status Pengingat Otomatis</span>
              <span className="text-xs text-slate-600">Aktifkan notifikasi berkala di dashboard</span>
            </div>
            <button
              type="button"
              onClick={() => setAktif(!aktif)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                aktif ? 'bg-[#A83236] text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {aktif ? 'Aktif' : 'Nonaktif'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Jam Pengingat Harian
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="time"
                  value={jamPengingat}
                  onChange={(e) => setJamPengingat(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Grup / No WA Guru (Opsional)
              </label>
              <input
                type="tel"
                placeholder="Contoh: 08123456789"
                value={targetNoWaGuru}
                onChange={(e) => setTargetNoWaGuru(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Template Pesan Pengingat
            </label>
            <textarea
              rows={4}
              value={pesanPengingat}
              onChange={(e) => setPesanPengingat(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs sm:text-sm focus:ring-2 focus:ring-[#A83236] focus:outline-hidden leading-relaxed"
            />
          </div>

          <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              Kirim Notifikasi Instan ke Guru
            </p>
            <p className="text-amber-800">
              Anda juga dapat mengirimkan pengingat ini sekarang langsung ke WhatsApp Grup Guru atau nomor pengajar.
            </p>
            <button
              type="button"
              onClick={handleKirimWhatsAppSekarang}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              <Send className="w-3 h-3" />
              Kirim Pesan via WhatsApp Sekarang
            </button>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-[#A83236] hover:bg-[#92272B] text-white text-xs font-semibold shadow-xs cursor-pointer"
            >
              {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
