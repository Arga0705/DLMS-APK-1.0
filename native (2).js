// Jembatan BLE native (Android) untuk UI. Dipakai hanya saat berjalan di dalam aplikasi Capacitor.
import { BleClient } from '@capacitor-community/bluetooth-le';
import { otaUpdate } from './bleOta.js';

const SVC = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
let ready = false;

window.NativeBle = {
  async pick() {
    if (!ready) { await BleClient.initialize({ androidNeverForLocation: true }); ready = true; }
    return BleClient.requestDevice({ namePrefix: 'LTRONIK' });
  },
  connect(id, onDisc) { return BleClient.connect(id, () => onDisc(), { timeout: 12000 }); },
  notify(id, cb) { return BleClient.startNotifications(id, SVC, TX, cb); },
  write(id, bytes) {
    return BleClient.writeWithoutResponse(id, SVC, RX, new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  },
  disconnect(id) { return BleClient.disconnect(id); },

  // --- Karakteristik lain berdasarkan UUID (dipakai update firmware langsung dari UI, tanpa Chrome) ---
  // Karakteristik OTA 6e400004 tidak punya write-no-response, jadi pakai write biasa (dengan response).
  writeChar(id, uuid, bytes) {
    return BleClient.write(id, SVC, uuid, new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  },
  notifyChar(id, uuid, cb) { return BleClient.startNotifications(id, SVC, uuid, cb); },
  // Dipanggil UI setelah connect: minta koneksi cepat (dan MTU besar bila plugin mendukung). Gagal = diabaikan.
  async requestMtu(id, mtu) {
    try { await BleClient.requestConnectionPriority(id, 1); } catch (_) {}   // 1 = HIGH
    try { if (typeof BleClient.requestMtu === 'function') await BleClient.requestMtu(id, mtu); } catch (_) {}
  },
};

// Update firmware (dipakai kartu Update firmware di menu System)
window.NativeOta = { otaUpdate };
