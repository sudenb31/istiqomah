// Semua tema disimpan sebagai data, jadi kontras warnanya bisa dites otomatis
// dan kartu pratinjau di lembar Gaya selalu sama dengan hasil aslinya.

const FONTS = {
  rounded: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Segoe UI Variable Display", system-ui, sans-serif',
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif',
  clean: '"Avenir Next", Avenir, "Segoe UI Variable Display", system-ui, sans-serif',
  poster: '"Futura-CondensedExtraBold", "Avenir Next Condensed", Impact, "Arial Black", sans-serif',
  typewriter: '"American Typewriter", "Courier New", ui-monospace, monospace',
  y2k: '"Trebuchet MS", "Avenir Next", system-ui, sans-serif',
};

const ROUND = { radius: '1.375rem', radiusSm: '0.875rem', border: 'none', shadow: 'none', displayWeight: 800, displayTrack: '-0.025em' };

export const THEMES = [
  {
    id: 'langit',
    name: 'Langit',
    emoji: '🌤️',
    scheme: 'auto',
    sky: true,
    bg: 'langit',
    display: FONTS.rounded,
    body: FONTS.sans,
    shape: ROUND,
    colors: {
      bg: '#E8F1FC', surface: '#FFFFFF', ink: '#14163C', muted: '#555A85', line: '#D5DEEF',
      accent: '#D6185C', accentOn: '#FFFFFF', accentText: '#C41552', accentSoft: '#FDE3EC',
      high: '#C4201B', mid: '#B26A00', low: '#2563C9', qadha: '#E8A317', uzur: '#9A9BBD',
    },
    dark: {
      bg: '#0E1030', surface: '#1A1D47', ink: '#F2F2FF', muted: '#B4B6DC', line: '#30345F',
      accent: '#FF5C93', accentOn: '#2A0615', accentText: '#FF7BA8', accentSoft: '#3B1B39',
      high: '#FF8A80', mid: '#F2B84B', low: '#8FB4FF', qadha: '#F2B84B', uzur: '#6E7099',
    },
    hero: { from: '#3A3D86', to: '#BE3768', on: '#FFFFFF' }, // cuma dipakai di kartu pratinjau
  },
  {
    id: 'neon',
    name: 'Neon Malam',
    emoji: '🪩',
    scheme: 'dark',
    bg: 'aura',
    display: FONTS.rounded,
    body: FONTS.sans,
    shape: { ...ROUND, displayWeight: 900 },
    colors: {
      bg: '#160A38', surface: '#241052', ink: '#F6F0FF', muted: '#C2B2EE', line: '#42297F',
      accent: '#C8FF3D', accentOn: '#1B2200', accentText: '#C8FF3D', accentSoft: '#3A2470',
      high: '#FF7DBD', mid: '#FFC94D', low: '#6AD7FF', qadha: '#FFC94D', uzur: '#7C6BB0',
    },
    hero: { from: '#6D28D9', to: '#C4147A', on: '#FFFFFF' },
  },
  {
    id: 'stroberi',
    name: 'Stroberi Susu',
    emoji: '🍓',
    scheme: 'light',
    bg: 'titik',
    display: FONTS.rounded,
    body: FONTS.sans,
    shape: { ...ROUND, radius: '1.75rem', radiusSm: '1.125rem' },
    colors: {
      bg: '#FFE1EA', surface: '#FFF7F9', ink: '#4A0D2A', muted: '#8A3A5E', line: '#F6C2D4',
      accent: '#DD1155', accentOn: '#FFFFFF', accentText: '#C90E4C', accentSoft: '#FFDCE7',
      high: '#BE123C', mid: '#B45309', low: '#7C3AED', qadha: '#F59E0B', uzur: '#C9A0B4',
    },
    hero: { from: '#FF9DB8', to: '#FFC4D3', on: '#4A0D2A' },
  },
  {
    id: 'matcha',
    name: 'Matcha',
    emoji: '🍵',
    scheme: 'light',
    bg: 'ornamen',
    display: FONTS.clean,
    body: FONTS.clean,
    shape: { ...ROUND, displayWeight: 700, radius: '1.125rem', radiusSm: '0.75rem' },
    colors: {
      bg: '#E2EAD0', surface: '#F7F9EE', ink: '#1B3419', muted: '#4C6446', line: '#CAD7B2',
      accent: '#2E7D32', accentOn: '#FFFFFF', accentText: '#2A722E', accentSoft: '#DDEBCB',
      high: '#B3261E', mid: '#946400', low: '#2F6F8F', qadha: '#D9A21B', uzur: '#A9B59B',
    },
    hero: { from: '#2F6B3A', to: '#3F7D42', on: '#FFFFFF' },
  },
  {
    id: 'tabrak',
    name: 'Tabrak',
    emoji: '⚡',
    scheme: 'light',
    bg: 'kotak',
    display: FONTS.poster,
    body: FONTS.sans,
    shape: {
      radius: '0.75rem', radiusSm: '0.5rem', border: '2.5px solid #000', shadow: '4px 4px 0 #000',
      // Huruf poster hanya punya satu ketebalan. Angka lebih besar membuat browser menebalkannya secara palsu.
      displayWeight: 400, displayTrack: '0', ribEdge: 'inset 0 0 0 2px #000', press: 'translate(2px, 2px)',
    },
    colors: {
      bg: '#FFDE3B', surface: '#FFFFFF', ink: '#000000', muted: '#3A3A3A', line: '#000000',
      accent: '#FF4FA3', accentOn: '#000000', accentText: '#000000', accentSoft: '#FFE8F3',
      high: '#C8001E', mid: '#A85B00', low: '#0047FF', qadha: '#FFB000', uzur: '#A0A0A0',
    },
    hero: { from: '#7CF2C0', to: '#7CF2C0', on: '#000000' },
  },
  {
    id: 'kopi',
    name: 'Kopi Senja',
    emoji: '☕',
    scheme: 'light',
    bg: 'polos',
    display: FONTS.typewriter,
    body: FONTS.sans,
    shape: { ...ROUND, displayWeight: 700, displayTrack: '-0.01em', radius: '1rem', radiusSm: '0.625rem' },
    colors: {
      bg: '#E8D6BF', surface: '#FBF4E8', ink: '#38200F', muted: '#6F5240', line: '#DEC9AF',
      accent: '#A9481E', accentOn: '#FFFFFF', accentText: '#A0431B', accentSoft: '#F3E0CC',
      high: '#A5201A', mid: '#8A5E00', low: '#3E6A87', qadha: '#D9A441', uzur: '#B8A48E',
    },
    hero: { from: '#5A3420', to: '#A9481E', on: '#FFF6EA' },
  },
  {
    id: 'y2k',
    name: 'Y2K',
    emoji: '💿',
    scheme: 'light',
    bg: 'bintang',
    display: FONTS.y2k,
    body: FONTS.y2k,
    shape: { ...ROUND, radius: '1.625rem', radiusSm: '1rem', displayTrack: '-0.03em', shadow: '0 0 0 1px #FFFFFF inset' },
    colors: {
      bg: '#CFE6FF', surface: '#F6FBFF', ink: '#071A52', muted: '#3D5490', line: '#B9D4F5',
      accent: '#0A5BFF', accentOn: '#FFFFFF', accentText: '#0A50E0', accentSoft: '#DCEBFF',
      high: '#C2185B', mid: '#946300', low: '#6B21D6', qadha: '#F5B301', uzur: '#A3B6D4',
    },
    hero: { from: '#1E40FF', to: '#A81FF5', on: '#FFFFFF' },
  },
  {
    id: 'bali',
    name: 'Bali',
    emoji: '🌊',
    scheme: 'dark',
    bg: 'aura',
    display: FONTS.rounded,
    body: FONTS.sans,
    shape: ROUND,
    colors: {
      bg: '#07343C', surface: '#0E4853', ink: '#EAFBF8', muted: '#A9DAD4', line: '#1E6773',
      accent: '#FFB23E', accentOn: '#2A1700', accentText: '#FFC261', accentSoft: '#1B5A5E',
      high: '#FFA99C', mid: '#FFD166', low: '#7FDBFF', qadha: '#FFD166', uzur: '#5E8F96',
    },
    hero: { from: '#FF8A3D', to: '#FF6E62', on: '#2A0E00' },
  },
];

export const BACKGROUNDS = [
  { id: 'langit', name: 'Langit hidup' },
  { id: 'aura', name: 'Aura' },
  { id: 'polos', name: 'Polos' },
  { id: 'titik', name: 'Titik' },
  { id: 'kotak', name: 'Kotak' },
  { id: 'bintang', name: 'Bintang' },
  { id: 'ornamen', name: 'Ornamen' },
];

export const themeById = (id) => THEMES.find((t) => t.id === id) ?? THEMES[0];

export function resolveTheme(id, prefersDark = false) {
  const theme = themeById(id);
  const useDark = theme.scheme === 'auto' && prefersDark && theme.dark;
  const scheme = theme.scheme === 'auto' ? (useDark ? 'dark' : 'light') : theme.scheme;
  return { theme, colors: useDark ? theme.dark : theme.colors, scheme };
}

const CSS_NAMES = {
  bg: '--bg', surface: '--surface', ink: '--ink', muted: '--muted', line: '--line',
  accent: '--accent', accentOn: '--accent-on', accentText: '--accent-text', accentSoft: '--accent-soft',
  high: '--high', mid: '--mid', low: '--low', qadha: '--qadha', uzur: '--uzur',
};

// Variabel CSS untuk satu tema.
export function themeTokens(id, prefersDark = false) {
  const { theme, colors, scheme } = resolveTheme(id, prefersDark);
  const s = theme.shape;
  const tokens = {
    '--radius': s.radius,
    '--radius-sm': s.radiusSm,
    '--border': s.border === 'none' ? '0 solid transparent' : s.border,
    '--shadow': s.shadow,
    '--press': s.press ?? 'scale(0.96)',
    '--display-font': theme.display,
    '--body-font': theme.body,
    '--display-weight': String(s.displayWeight),
    '--display-track': s.displayTrack,
    '--rib-edge': s.ribEdge ?? (scheme === 'dark' ? `inset 1px 0 0 ${colors.line}, inset -1px 0 0 ${colors.line}` : 'none'),
  };
  for (const [key, name] of Object.entries(CSS_NAMES)) tokens[name] = colors[key];
  return { tokens, scheme, bg: colors.bg };
}
