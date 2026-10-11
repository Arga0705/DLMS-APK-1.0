// Menyiapkan proyek Android: build web, tambah platform android, tambah izin Bluetooth, sinkronkan, (opsional) bangun APK.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const run = (c, o = {}) => { console.log('\n> ' + c); execSync(c, { stdio: 'inherit', ...o }); };
run('npm run build');
if (!existsSync('android')) run('npx cap add android');

const mf = 'android/app/src/main/AndroidManifest.xml';
let x = readFileSync(mf, 'utf8');
if (!x.includes('BLUETOOTH_SCAN')) {
  const perms = `
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />
    <uses-feature android:name="android.hardware.bluetooth_le" android:required="true" />
`;
  x = x.replace('</manifest>', perms + '</manifest>');
  writeFileSync(mf, x);
  console.log('Izin Bluetooth ditambahkan ke AndroidManifest.xml');
}
run('npx cap sync android');

if (process.argv.includes('--apk')) {
  const win = process.platform === 'win32';
  run(win ? 'gradlew.bat assembleDebug' : './gradlew assembleDebug', { cwd: 'android' });
  console.log('\nAPK: android/app/build/outputs/apk/debug/app-debug.apk');
} else {
  console.log('\nSelesai. Buka Android Studio dengan: npx cap open android  (lalu Build > Build APK)');
}
