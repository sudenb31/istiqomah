// Meminta Client ID dan Client secret Google, lalu menyimpannya sebagai rahasia fungsi Supabase.
// Nilainya tidak ditampilkan di layar dan tidak ditulis ke disk.
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

const PROJECT_REF = 'kmqifoggjrbauylqsmay';

let muted = false;
const output = new Writable({
  write(chunk, encoding, done) {
    if (!muted) process.stdout.write(chunk, encoding);
    done();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: true });

const ask = (label) =>
  new Promise((resolve) => {
    muted = false;
    process.stdout.write(label);
    muted = true;
    rl.question('', (answer) => {
      muted = false;
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });

const clientId = await ask('Tempel Client ID (tidak tampil di layar), lalu Enter: ');
const clientSecret = await ask('Tempel Client secret (tidak tampil di layar), lalu Enter: ');
rl.close();

if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
  console.error('Client ID belum benar. Harusnya berakhiran .apps.googleusercontent.com');
  process.exit(1);
}
if (!/^[\w.-]{10,}$/.test(clientSecret)) {
  console.error('Client secret belum benar. Salin lagi dari halaman Google Cloud.');
  process.exit(1);
}

const result = spawnSync(
  'npx',
  ['supabase', 'secrets', 'set', '--project-ref', PROJECT_REF, `GOOGLE_CLIENT_ID=${clientId}`, `GOOGLE_CLIENT_SECRET=${clientSecret}`],
  { stdio: ['ignore', 'ignore', 'pipe'], shell: process.platform === 'win32', encoding: 'utf8' },
);

if (result.status !== 0) {
  // Pesan error disaring supaya nilai rahasia tidak ikut tercetak.
  console.error((result.stderr ?? 'Gagal menyimpan.').replaceAll(clientSecret, '***'));
  process.exit(1);
}
console.log('Tersimpan. Rahasia Google sudah aktif di server.');
