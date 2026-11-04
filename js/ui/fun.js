// Confetti kecil saat tugas selesai, dan pesan penyemangat. Dimatikan kalau pengguna meminta animasi dikurangi.
const HYPE = ['Gas! 🔥', 'Mantap, satu beres ✨', 'Nice! 🙌', 'Keren, lanjut 💪', 'Satu lagi kelar 🎯', 'Sip! ✅'];

export const hype = () => HYPE[Math.floor(Math.random() * HYPE.length)];

const quiet = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let canvas;
let ctx;
let pieces = [];
let running = false;

function colors() {
  const css = getComputedStyle(document.documentElement);
  return ['--accent', '--mid', '--low', '--high'].map((name) => css.getPropertyValue(name).trim());
}

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.id = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  ctx = canvas.getContext('2d');
}

function frame(last) {
  const now = performance.now();
  const dt = Math.min(40, now - last) / 16.67;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  pieces = pieces.filter((p) => p.life > 0);
  for (const p of pieces) {
    p.vy += 0.16 * dt;
    p.vx *= 0.985;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.spin += p.vspin * dt;
    p.life -= dt;
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.life / 18);
    ctx.translate(p.x * devicePixelRatio, p.y * devicePixelRatio);
    ctx.rotate(p.spin);
    ctx.fillStyle = p.color;
    const s = p.size * devicePixelRatio;
    ctx.fillRect(-s / 2, -s / 3, s, s * 0.66);
    ctx.restore();
  }
  if (pieces.length) {
    requestAnimationFrame(() => frame(now));
  } else {
    running = false;
    canvas.hidden = true;
  }
}

function launch(x, y, count, power) {
  if (quiet()) return;
  ensureCanvas();
  canvas.hidden = false;
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
  const palette = colors();
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = power * (0.4 + Math.random() * 0.8);
    pieces.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - power * 0.7,
      size: 5 + Math.random() * 5,
      spin: Math.random() * 6,
      vspin: (Math.random() - 0.5) * 0.5,
      life: 45 + Math.random() * 25,
      color: palette[i % palette.length],
    });
  }
  if (!running) {
    running = true;
    requestAnimationFrame(() => frame(performance.now()));
  }
}

// rect = posisi tombol yang diketuk, diambil sebelum halaman digambar ulang.
export function burst(rect) {
  navigator.vibrate?.(12);
  launch(rect.left + rect.width / 2, rect.top + rect.height / 2, 22, 5);
}

export function party() {
  navigator.vibrate?.([20, 40, 20]);
  launch(innerWidth * 0.2, innerHeight * 0.35, 45, 8);
  launch(innerWidth * 0.8, innerHeight * 0.35, 45, 8);
  launch(innerWidth * 0.5, innerHeight * 0.25, 40, 9);
}
