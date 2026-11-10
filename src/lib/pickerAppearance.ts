// Shared labels and colors keep the park cabinet consistent with the full random picker.
import { theme } from '../styles/theme.ts';
export const PICKER_LABELS = { title: 'Random pick', start: 'Start draw', prize: 'PRIZE' } as const;
export const PICKER_COLORS = {
  body: theme.bubblegum,
  marquee: theme.butter,
  glass: theme.sky,
  rail: '#dfe3ff',
  prize: theme.mint,
  floor: theme.sand,
  ink: theme.ink,
} as const;
