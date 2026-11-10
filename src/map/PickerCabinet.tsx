// A small claw-machine cabinet opens the existing random picker from the park.
import type { CSSProperties } from 'react';
import { PICKER_COLORS as colors, PICKER_LABELS } from '../lib/pickerAppearance.ts';
import { Cabinet } from './ArcadeCabinet.tsx';

export function PickerCabinet({
  x,
  y,
  width,
  disabled,
  onPlay,
}: {
  x: string;
  y: string;
  width: number;
  disabled: boolean;
  onPlay: (trigger: HTMLElement) => void;
}) {
  return (
    <Cabinet
      data-picker-play
      aria-label={disabled ? 'Random picker unavailable: no team members' : 'Open random picker'}
      aria-haspopup="dialog"
      disabled={disabled}
      style={
        { left: x, top: y, '--cabinet-width': `${width}px`, opacity: disabled ? 0.55 : 1 } as CSSProperties
      }
      onClick={(e) => onPlay(e.currentTarget)}
    >
      <svg viewBox="0 0 100 160" aria-hidden="true">
        <ellipse cx="50" cy="153" rx="44" ry="6" fill="#2a265733" />
        <path d="m9 139 65-5 20 12-66 10-19-10z" fill="#a4b4bf" stroke={colors.ink} strokeWidth="2" />
        <path d="M12 12h68l12 10v123l-12 9H12z" fill={colors.body} stroke={colors.ink} strokeWidth="3" />
        <path d="M80 12l12 10v123l-12 9z" fill="#d97ea5" stroke={colors.ink} strokeWidth="3" />
        <rect
          x="15"
          y="15"
          width="62"
          height="19"
          rx="4"
          fill={colors.marquee}
          stroke={colors.ink}
          strokeWidth="2"
        />
        <text x="46" y="28" textAnchor="middle" fontSize="10" fontWeight="900" fill={colors.ink}>
          {PICKER_LABELS.title}
        </text>
        <rect
          x="18"
          y="39"
          width="56"
          height="57"
          rx="3"
          fill={colors.glass}
          stroke={colors.ink}
          strokeWidth="3"
        />
        <path d="M20 91h52v4H20z" fill={colors.floor} />
        <path
          d="M24 46h44M46 46v17m-9 10 3-10h12l4 10-6 5m-13-5 5 5"
          fill="none"
          stroke={colors.ink}
          strokeWidth="3"
        />
        <circle cx="30" cy="86" r="9" fill="#ff9cc2" />
        <circle cx="48" cy="87" r="9" fill={colors.marquee} />
        <circle cx="65" cy="86" r="8" fill="#b7a6ef" />
        <path d="M27 85h2m4 0h2m10 1h2m4 0h2m9-1h2m4 0h2" stroke={colors.ink} strokeWidth="2" />
        <rect
          x="18"
          y="103"
          width="56"
          height="22"
          rx="5"
          fill={colors.body}
          stroke={colors.ink}
          strokeWidth="2"
        />
        <text x="46" y="118" textAnchor="middle" fontSize="9.5" fontWeight="900" fill={colors.ink}>
          {PICKER_LABELS.start}
        </text>
        <rect
          x="27"
          y="130"
          width="38"
          height="16"
          rx="4"
          fill={colors.prize}
          stroke={colors.ink}
          strokeWidth="2"
        />
        <text x="46" y="141" textAnchor="middle" fontSize="7" fontWeight="900" fill={colors.ink}>
          {PICKER_LABELS.prize}
        </text>
      </svg>
    </Cabinet>
  );
}
