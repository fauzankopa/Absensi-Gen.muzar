import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas-pro';
import { SesiAbsensiDanJurnal, Generus, hitungUmur } from './types';

// Helper fallback untuk me-render SVG langsung ke Canvas jika capture DOM standar bermasalah
async function captureSvgDirectly(svg: SVGElement): Promise<string | null> {
  try {
    const clonedSvg = svg.cloneNode(true) as SVGElement;
    const bbox = svg.getBoundingClientRect();
    const width = Math.max(bbox.width || 600, 300);
    const height = Math.max(bbox.height || 350, 200);

    clonedSvg.setAttribute('width', String(width));
    clonedSvg.setAttribute('height', String(height));
    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const svgData = new XMLSerializer().serializeToString(clonedSvg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    return await new Promise<string | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width * 2;
        canvas.height = height * 2;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/png'));
        } else {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  } catch (err) {
    console.warn('Gagal merender SVG langsung:', err);
    return null;
  }
}

// Helper untuk menangkap elemen grafik HTML/SVG menjadi data URL gambar PNG
export async function captureElementAsImage(elementId: string): Promise<string | null> {
  const el = document.getElementById(elementId);
  if (!el) return null;
  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn(`Peringatan html2canvas pada elemen #${elementId}, mencoba fallback SVG:`, err);
    const svg = el.querySelector('svg');
    if (svg) {
      const fallbackResult = await captureSvgDirectly(svg);
      if (fallbackResult) return fallbackResult;
    }
    return null;
  }
}

export interface ChartImagesExport {
  mainChart?: string | null;
  distribusiChart?: string | null;
  trenChart?: string | null;
}

// Export Rekap Jurnal ke PDF
export function exportJurnalToPDF(
  sesiList: SesiAbsensiDanJurnal[],
  filterInfo?: { tanggalMulai?: string; tanggalAkhir?: string; pengajar?: string; tempat?: string }
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Header Title
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.text('LAPORAN JURNAL PEMBELAJARAN DAN MATERI GENERUS', 14, 16);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Aplikasi Absensi Gen.muzar - Dicetak pada: ${new Date().toLocaleString('id-ID')}`, 14, 22);

  if (filterInfo) {
    const filterParts: string[] = [];
    if (filterInfo.tempat && filterInfo.tempat !== 'Semua') filterParts.push(`Tempat: ${filterInfo.tempat}`);
    if (filterInfo.pengajar && filterInfo.pengajar !== 'Semua') filterParts.push(`Pengajar: ${filterInfo.pengajar}`);
    if (filterInfo.tanggalMulai) filterParts.push(`Periode: ${filterInfo.tanggalMulai} s/d ${filterInfo.tanggalAkhir || '-'}`);
    const filterText = filterParts.length > 0 ? `Filter: ${filterParts.join(' | ')}` : 'Filter: Semua Data';
    doc.text(filterText, 14, 28);
  }

  const tableData = sesiList.map((item, index) => {
    const pemateri1Text = item.pemateri1 
      ? `${item.pemateri1}\n(Al-Qur'an: ${item.alquranMateri || '-'})`
      : (item.pengajar || '-');
    const pemateri2Text = item.pemateri2 
      ? `${item.pemateri2}\n(Hadist: ${item.hadistMateri || '-'})`
      : (item.babHalaman || '-');
    const penasehatText = item.penasehat || '-';
    const tempatText = item.tempat || '-';
    const catatanText = item.catatan || item.catatanJurnal || '-';

    return [
      index + 1,
      item.tanggal,
      tempatText,
      pemateri1Text,
      pemateri2Text,
      penasehatText,
      catatanText,
      `H:${item.totalHadir} | I:${item.totalIzin}\nS:${item.totalSakit} | A:${item.totalAlpa}`
    ];
  });

  autoTable(doc, {
    startY: filterInfo ? 32 : 26,
    head: [['No', 'Tanggal', 'Tempat', 'Pemateri 1 & Al-Qur\'an', 'Pemateri 2 & Hadist', 'Penasehat', 'Catatan', 'Kehadiran']],
    body: tableData,
    headStyles: {
      fillColor: [168, 50, 54], // Muzar Crimson Red #A83236
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold'
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85]
    },
    alternateRowStyles: {
      fillColor: [254, 248, 248]
    },
    margin: { left: 14, right: 14 },
    styles: { overflow: 'linebreak', cellPadding: 2.5 }
  });

  doc.save(`Rekap_Jurnal_Materi_Genmuzar_${new Date().toISOString().split('T')[0]}.pdf`);
}

// Export Rekap Jurnal ke Excel
export function exportJurnalToExcel(sesiList: SesiAbsensiDanJurnal[]) {
  const worksheetData = sesiList.map((item, index) => ({
    No: index + 1,
    Tanggal: item.tanggal,
    Tempat: item.tempat || '-',
    'Pemateri 1': item.pemateri1 || item.pengajar || '-',
    'Al-Qur\'an (Ayat)': item.alquranMateri || item.judulMateri || '-',
    'Pemateri 2': item.pemateri2 || '-',
    'Hadist (Halaman)': item.hadistMateri || item.babHalaman || '-',
    Penasehat: item.penasehat || '-',
    Catatan: item.catatan || item.catatanJurnal || '-',
    'Total Hadir': item.totalHadir,
    'Total Izin': item.totalIzin,
    'Total Sakit': item.totalSakit,
    'Total Alpa': item.totalAlpa,
    'Total Generus': item.totalGenerus,
    'Persentase Hadir': `${item.totalGenerus > 0 ? ((item.totalHadir / item.totalGenerus) * 100).toFixed(1) : 0}%`
  }));

  const worksheet = XLSX.utils.json_to_sheet(worksheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap Jurnal Materi');
  XLSX.writeFile(workbook, `Rekap_Jurnal_Materi_Genmuzar_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// Export Rekap Performa Kehadiran Bulanan ke PDF (Termasuk Grafik)
export function exportPerformaKehadiranPDF(
  bulanLabel: string,
  generusStats: {
    nama: string;
    kelompok: string;
    hadir: number;
    izin: number;
    sakit: number;
    alpa: number;
    totalSesi: number;
    persenHadir: number;
  }[],
  overallStats: {
    totalSesi: number;
    rataRataHadir: number;
    totalGenerus: number;
    totalHadir?: number;
    totalIzin?: number;
    totalSakit?: number;
    totalAlpa?: number;
  },
  kelompokBreakdown?: { kelompok: string; hadir: number; total: number; persen: number }[],
  chartImages?: ChartImagesExport
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Accent Header Top Bar
  doc.setFillColor(168, 50, 54); // #A83236 Muzar Crimson
  doc.rect(0, 0, pageWidth, 6, 'F');

  // Title
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.text('LAPORAN PERFORMA & ANALITIK KEHADIRAN GENERUS', 14, 18);

  doc.setFontSize(10.5);
  doc.setTextColor(168, 50, 54);
  doc.text(`Periode Evaluasi: ${bulanLabel}`, 14, 25);

  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Aplikasi Absensi Gen.muzar • Dicetak pada: ${new Date().toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}`,
    14,
    30
  );

  // Divider
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(14, 33, pageWidth - 14, 33);

  // Executive KPI Summary Boxes
  let currY = 38;
  const boxWidth = (pageWidth - 28 - 9) / 4;
  const boxHeight = 16;

  const kpis = [
    { label: 'Total Sesi', val: `${overallStats.totalSesi} Pertemuan`, color: [30, 41, 59] },
    { label: 'Rata-rata Hadir', val: `${overallStats.rataRataHadir.toFixed(1)}%`, color: [16, 185, 129] },
    { label: 'Generus Aktif', val: `${overallStats.totalGenerus} Orang`, color: [59, 130, 246] },
    { label: 'Total Kehadiran', val: `${overallStats.totalHadir ?? '-'} Hadir`, color: [168, 50, 54] },
  ];

  kpis.forEach((kpi, idx) => {
    const x = 14 + idx * (boxWidth + 3);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, currY, boxWidth, boxHeight, 2, 2, 'FD');

    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + 3, currY + 5.5);

    doc.setFontSize(10.5);
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.val, x + 3, currY + 12);
  });

  currY += boxHeight + 8;

  // VISUALISASI GRAFIK UTAMA (Jika Ditangkap)
  if (chartImages?.mainChart) {
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text('Grafik Visualisasi Performa Kehadiran (Diagram)', 14, currY);
    currY += 4;

    try {
      const imgWidth = pageWidth - 28;
      const imgHeight = 82;
      doc.addImage(chartImages.mainChart, 'PNG', 14, currY, imgWidth, imgHeight);
      currY += imgHeight + 6;
    } catch (e) {
      console.warn('Gagal menambahkan grafik utama ke PDF:', e);
    }
  }

  // GRAFIK DISTRIBUSI KEDUA (Jika ada)
  if (chartImages?.distribusiChart) {
    if (currY + 70 > pageHeight - 20) {
      doc.addPage();
      currY = 20;
    }

    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text('Grafik Distribusi Kehadiran (Diagram Lingkaran / Donat)', 14, currY);
    currY += 4;

    try {
      const imgWidth = pageWidth - 28;
      const imgHeight = 65;
      doc.addImage(chartImages.distribusiChart, 'PNG', 14, currY, imgWidth, imgHeight);
      currY += imgHeight + 6;
    } catch (e) {
      console.warn('Gagal menambahkan grafik distribusi ke PDF:', e);
    }
  }

  // Ringkasan Kelompok
  if (kelompokBreakdown && kelompokBreakdown.length > 0) {
    if (currY + 40 > pageHeight - 25) {
      doc.addPage();
      currY = 20;
    }

    const kelompokData = kelompokBreakdown.map(k => [
      k.kelompok,
      `${k.hadir} kehadiran`,
      `${k.total} total catatan`,
      `${k.persen.toFixed(1)}%`
    ]);

    autoTable(doc, {
      startY: currY,
      head: [['Kelompok Sasaran', 'Akumulasi Hadir', 'Total Catatan Sesi', 'Persentase']],
      body: kelompokData,
      headStyles: {
        fillColor: [100, 116, 139],
        textColor: [255, 255, 255],
        fontSize: 8.5,
        fontStyle: 'bold'
      },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 }
    });

    currY = (doc as any).lastAutoTable.finalY + 8;
  }

  // Tabel Rekapitulasi Individu Generus
  if (currY + 40 > pageHeight - 25) {
    doc.addPage();
    currY = 20;
  }

  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text('Rincian Evaluasi Kehadiran Individu Generus', 14, currY);
  currY += 3;

  const tableData = generusStats.map((item, index) => [
    index + 1,
    item.nama,
    item.kelompok,
    item.hadir,
    item.izin,
    item.sakit,
    item.alpa,
    `${item.persenHadir.toFixed(1)}%`,
    item.persenHadir >= 80 ? 'Sangat Baik' : item.persenHadir >= 60 ? 'Cukup' : 'Perlu Perhatian'
  ]);

  autoTable(doc, {
    startY: currY,
    head: [['No', 'Nama Generus', 'Kelompok', 'Hadir', 'Izin', 'Sakit', 'Alpa', '% Hadir', 'Predikat']],
    body: tableData,
    headStyles: {
      fillColor: [168, 50, 54], // Muzar Crimson Red #A83236
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold'
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85]
    },
    alternateRowStyles: {
      fillColor: [254, 248, 248]
    },
    margin: { left: 14, right: 14 }
  });

  doc.save(`Laporan_Grafik_Kehadiran_Generus_${bulanLabel.replace(/\s+/g, '_')}.pdf`);
}

// Export Data Kehadiran Bulanan ke Excel
export function exportPerformaKehadiranExcel(
  bulanLabel: string,
  generusStats: {
    nama: string;
    kelompok: string;
    hadir: number;
    izin: number;
    sakit: number;
    alpa: number;
    totalSesi: number;
    persenHadir: number;
  }[]
) {
  const worksheetData = generusStats.map((item, index) => ({
    No: index + 1,
    'Nama Generus': item.nama,
    Kelompok: item.kelompok,
    'Jumlah Hadir': item.hadir,
    'Jumlah Izin': item.izin,
    'Jumlah Sakit': item.sakit,
    'Jumlah Alpa': item.alpa,
    'Total Sesi Terlaksana': item.totalSesi,
    'Persentase Kehadiran': `${item.persenHadir.toFixed(1)}%`,
    Status: item.persenHadir >= 80 ? 'Sangat Baik' : item.persenHadir >= 60 ? 'Cukup' : 'Perlu Perhatian'
  }));

  const worksheet = XLSX.utils.json_to_sheet(worksheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `Performa ${bulanLabel.slice(0, 20)}`);
  XLSX.writeFile(workbook, `Performa_Kehadiran_Generus_${bulanLabel.replace(/\s+/g, '_')}.xlsx`);
}

// Export Seluruh Data Profil Generus ke Excel
export function exportGenerusToExcel(generusList: Generus[]) {
  const worksheetData = generusList.map((g, index) => {
    const umur = hitungUmur(g.tanggalLahir, g.umur || g.usia);
    return {
      No: index + 1,
      'Nama Lengkap': g.namaLengkap,
      'Jenis Kelamin': g.jenisKelamin,
      'Tempat Lahir': g.tempatLahir,
      'Tanggal Lahir': g.tanggalLahir,
      'Umur (Tahun)': umur !== null ? `${umur} Tahun` : '-',
      'Status Kerja': g.statusKerja,
      Kelompok: g.kelompok,
      'No Telpon': g.noTelpon,
      'Nama Bapak': g.namaBapak,
      'Status Aktif': g.statusAktif ? 'Aktif' : 'Nonaktif'
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(worksheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data Generus');
  XLSX.writeFile(workbook, `Data_Generus_Genmuzar_${new Date().toISOString().split('T')[0]}.xlsx`);
}

