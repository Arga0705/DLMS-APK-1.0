// Update firmware L-TRONIK DSP lewat BLE untuk aplikasi DLMS (Capacitor).
// Protokol mengikuti firmware ltronik_dsp_v196/v197 (karakteristik OTA 6e400004):
//   HP -> DSP : 'B' + ukuran(4B LE) + CRC32(4B LE) + sandi | 'D' + data | 'E' | 'X'
//   DSP -> HP : 0x01 siap, 0x02 selesai (DSP restart), 0x81..0x87 = error
import { BleClient } from '@capacitor-community/bluetooth-le';

const SVC = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const OTA = '6e400004-b5a3-f393-e0a9-e50e24dcca9e';
const DEVICE_PREFIX = 'LTRONIK-DSP';
const DEFAULT_PASS = 'ltronik'; // harus sama dengan OTA_PASS di firmware

const ERR = {
  0x81: 'Sandi salah',
  0x82: 'Gagal mulai (cek Partition Scheme / ukuran firmware)',
  0x83: 'Gagal menulis flash',
  0x84: 'CRC tidak cocok (data rusak)',
  0x85: 'Gagal memasang firmware',
  0x86: 'Waktu habis / koneksi putus',
  0x87: 'Urutan paket salah',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dv = (bytes) => new DataView(Uint8Array.from(bytes).buffer);

// CRC32 standar (sama dengan esp_crc32_le(0, ...) di firmware)
const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
const le32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

const DROP = -1; // penanda: koneksi BLE terputus

export async function otaUpdate(firmware, { password = DEFAULT_PASS, onLog = () => {}, onProgress = () => {}, onDone = () => {} } = {}) {
  if (firmware.length < 65536) throw new Error('File terlalu kecil, bukan firmware .bin yang benar');

  await BleClient.initialize({ androidNeverForLocation: true });
  const dev = await BleClient.requestDevice({ namePrefix: DEVICE_PREFIX, optionalServices: [SVC] });
  const id = dev.deviceId;

  let status = null;
  let dropped = false;
  const waitStatus = async (ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (status !== null) return status;
      if (dropped) return DROP;
      await sleep(30);
    }
    return null;
  };
  const expect = async (ok, ms, what) => {
    const s = await waitStatus(ms);
    status = null;
    if (s === ok) return;
    if (s === null) throw new Error('Tidak ada balasan dari DSP (' + what + ')');
    throw new Error(ERR[s] || 'Error 0x' + s.toString(16));
  };

  await BleClient.connect(id, () => { dropped = true; onLog('Koneksi terputus'); });
  onLog('Terhubung ke ' + (dev.name || id));

  try {
    try { await BleClient.requestConnectionPriority(id, 1); } catch (_) {} // HIGH: lebih cepat (Android)
    await BleClient.startNotifications(id, SVC, OTA, (v) => { status = v.getUint8(0); });

    // Mulai: 'B' + ukuran + CRC32 + sandi
    const pass = Array.from(new TextEncoder().encode(password));
    status = null;
    await BleClient.write(id, SVC, OTA, dv([0x42, ...le32(firmware.length), ...le32(crc32(firmware)), ...pass]));
    await expect(0x01, 5000, 'mulai');

    // Data: 'D' + potongan. Pakai write biasa (karakteristik OTA tidak punya write-no-response)
    const CHUNK = 180;
    onLog('Mengirim ' + firmware.length + ' byte...');
    for (let i = 0; i < firmware.length; i += CHUNK) {
      const part = firmware.subarray(i, i + CHUNK);
      const pkt = new Uint8Array(part.length + 1);
      pkt[0] = 0x44;
      pkt.set(part, 1);
      await BleClient.write(id, SVC, OTA, new DataView(pkt.buffer));
      if (dropped) throw new Error('Koneksi terputus saat mengirim data');
      if (status !== null && status >= 0x81) throw new Error(ERR[status] || 'Error DSP');
      onProgress(Math.round(((i + part.length) * 100) / firmware.length));
    }

    // Selesai: 'E' -> DSP verifikasi CRC, pasang, lalu restart
    onProgress(100);
    onLog('Data terkirim, DSP memverifikasi & memasang firmware...');
    try {
      await BleClient.write(id, SVC, OTA, dv([0x45]), { timeout: 20000 });
    } catch (e) {
      if (!dropped && status === null) throw e;   // DSP bisa restart/putus sebelum balasan write tiba: itu wajar
    }
    const s = await waitStatus(20000);
    status = null;
    if (s === 0x02) {
      onLog('Sukses! DSP restart dengan firmware baru.');
    } else if (s === DROP) {
      onLog('DSP restart (koneksi terputus) - update dianggap selesai. Cek versi di menu System.');
    } else if (s === null) {
      throw new Error('DSP tidak membalas setelah 100%. Cek versi firmware di menu System.');
    } else {
      throw new Error(ERR[s] || 'Error 0x' + s.toString(16));
    }
    onDone();
  } catch (e) {
    try { await BleClient.write(id, SVC, OTA, dv([0x58])); } catch (_) {} // 'X' batal
    throw e;
  } finally {
    try { await BleClient.disconnect(id); } catch (_) {}
  }
}

// Panel UI siap pakai: mountOtaPanel(document.getElementById('ota'))
export function mountOtaPanel(el) {
  el.innerHTML = `
    <h3>Update Firmware L-TRONIK DSP</h3>
    <input type="file" accept=".bin" id="otaFile" style="width:100%;padding:10px 0">
    <input type="text" id="otaPass" value="${DEFAULT_PASS}" placeholder="Sandi" style="width:100%;padding:10px;box-sizing:border-box">
    <button id="otaGo" style="width:100%;padding:14px;font-size:16px;margin-top:6px">Hubungkan &amp; Kirim</button>
    <progress id="otaBar" value="0" max="100" style="width:100%;height:22px"></progress>
    <pre id="otaLog" style="white-space:pre-wrap;min-height:60px"></pre>`;

  const $ = (q) => el.querySelector(q);
  const log = (t) => { $('#otaLog').textContent += t + '\n'; };

  $('#otaGo').onclick = async () => {
    const f = $('#otaFile').files[0];
    if (!f) return log('Pilih file .bin dulu');
    $('#otaGo').disabled = true;
    $('#otaBar').value = 0;
    try {
      const data = new Uint8Array(await f.arrayBuffer());
      await otaUpdate(data, { password: $('#otaPass').value, onLog: log, onProgress: (p) => { $('#otaBar').value = p; } });
      log('SELESAI. Tunggu DSP menyala ulang.');
    } catch (e) {
      log('Gagal: ' + (e.message || e));
    }
    $('#otaGo').disabled = false;
  };
}
