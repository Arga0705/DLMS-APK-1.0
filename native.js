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
};

// Update firmware (dipakai kartu Update firmware di menu System)
window.NativeOta = { otaUpdate };
