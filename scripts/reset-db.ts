import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

async function resetAllData() {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    console.error('Config not found:', configPath);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const app = initializeApp(config);
  const db = config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, config.firestoreDatabaseId)
    : getFirestore(app);

  console.log('--- Memulai Reset Data Firestore ---');

  // 1. Reset generus
  const generusSnap = await getDocs(collection(db, 'generus'));
  console.log(`Ditemukan ${generusSnap.size} dokumen generus untuk dihapus.`);
  if (generusSnap.size > 0) {
    const batch = writeBatch(db);
    generusSnap.docs.forEach((d) => {
      batch.delete(d.ref);
    });
    await batch.commit();
    console.log(`Berhasil menghapus ${generusSnap.size} data generus.`);
  }

  // 2. Reset sesi_absensi (Absensi & Jurnal)
  const sesiSnap = await getDocs(collection(db, 'sesi_absensi'));
  console.log(`Ditemukan ${sesiSnap.size} dokumen sesi_absensi untuk dihapus.`);
  if (sesiSnap.size > 0) {
    const batch = writeBatch(db);
    sesiSnap.docs.forEach((d) => {
      batch.delete(d.ref);
    });
    await batch.commit();
    console.log(`Berhasil menghapus ${sesiSnap.size} data sesi_absensi & jurnal.`);
  }

  console.log('--- Reset Selesai! Data Generus = 0, Data Absensi & Jurnal = 0 ---');
  process.exit(0);
}

resetAllData().catch(err => {
  console.error('Gagal mereset database:', err);
  process.exit(1);
});
