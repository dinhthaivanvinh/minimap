// Design tokens: sticker-sheet rooms with thick ink outlines.

const ink = '#2a2657';

export const theme = {
  ink,
  inkSoft: '#5c5890',
  sky: '#cdebff',
  paper: '#fffefa',
  white: '#fff',
  bubblegum: '#ff9cc2',
  butter: '#ffe27a',
  mint: '#bdf0d2',
  sand: '#ffe9b8',
  water: '#8fddf5',
  hover: '#fff5d6',
  focus: '#2f6bff',
  error: '#bb1650',
  divider: '#d9d6ec',
  line: `3px solid ${ink}`,
  thinLine: `2px solid ${ink}`,
  dashedLine: '2px dashed #d9d6ec',
  displayFont: "'Baloo 2', 'Segoe UI', system-ui, sans-serif",
  bodyFont: "'Nunito', 'Segoe UI', system-ui, sans-serif",
} as const;

export const media = {
  phone: '@media (max-width: 860px)',
  reducedMotion: '@media (prefers-reduced-motion: reduce)',
} as const;
