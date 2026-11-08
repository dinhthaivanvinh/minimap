import { useId } from 'react';
import { ASSEMBLY_PROP_NAMES, type AssemblyProp as Prop } from '../lib/assemblyProps.ts';

const STEEL = '#2b3440';
const GUNMETAL = '#3a4552';
const GOLD = '#e0a94a';
const INK = '#1a2230';

// Each item gets its own canvas shape, so tall weapons aren't squeezed into a square.
const VIEW_BOX: Record<Prop, string> = {
  'rubber-duck': '0 0 100 90',
  'toilet-plunger': '0 0 50 130',
  'coffee-bazooka': '0 0 130 60',
  'sticky-shuriken': '0 0 100 100',
  'keyboard-blade': '0 0 40 130',
  'staple-cannon': '0 0 120 60',
  'monitor-shield': '0 0 100 90',
  'deadline-scythe': '0 0 90 130',
  'mouse-flail': '0 0 80 110',
};

export function AssemblyProp({ item, index }: { item: Prop; index: number }) {
  const filterId = useId();
  // Alternating hue matches the portals' cyan/orange pair.
  const glow = index % 2 ? '#ff8a3d' : '#4cd8ff';
  const lit = { filter: `url(#${CSS.escape(filterId)})` };
  return (
    <svg
      className={`signature-prop prop-${item}`}
      viewBox={VIEW_BOX[item]}
      role="img"
      aria-label={ASSEMBLY_PROP_NAMES[item]}
    >
      <defs>
        <filter id={filterId} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g stroke={INK} strokeWidth="2.5" strokeLinejoin="round">
        {item === 'rubber-duck' && (
          <>
            <ellipse cx="46" cy="83" rx="34" ry="5" fill="none" stroke={glow} strokeWidth="2" style={lit} />
            <path d="M14 52L5 33l19 11z" fill="#ffd23f" />
            <ellipse cx="46" cy="58" rx="36" ry="21" fill="#ffd23f" />
            <path d="M28 57q16-11 31 1q-15 12-31-1z" fill="#f2bf1d" />
            <circle cx="66" cy="31" r="18" fill="#ffd23f" />
            <path d="M80 30q14-1 17 6q-7 7-19 4z" fill="#ff8a1f" />
            <path d="M54 27l14 1" fill="none" stroke={INK} strokeWidth="2" />
            <path d="M67 24h13l-1 7q-6 4-12 0z" fill={INK} />
            <path d="M70 26.5h4" fill="none" stroke={glow} strokeWidth="1.5" style={lit} />
          </>
        )}
        {item === 'toilet-plunger' && (
          <>
            <rect x="22" y="30" width="6" height="96" rx="3" fill="#a86b3c" />
            <rect x="20.5" y="104" width="9" height="6" fill={GOLD} />
            <path d="M5 9h40q-3 22-17 24h-6Q8 31 5 9z" fill="#c8322b" />
            <ellipse cx="25" cy="9" rx="20" ry="4.5" fill="#7d1a16" />
            <ellipse cx="25" cy="9" rx="20" ry="4.5" fill="none" stroke={glow} strokeWidth="1.8" style={lit} />
          </>
        )}
        {item === 'coffee-bazooka' && (
          <>
            <rect x="40" y="34" width="10" height="20" rx="2" fill="#1b2027" />
            <rect x="8" y="16" width="92" height="22" rx="6" fill="#57bac4" />
            <rect x="26" y="16" width="10" height="22" fill="#eef0f2" />
            <rect x="52" y="8" width="18" height="8" rx="1" fill={STEEL} />
            <text x="72" y="31" textAnchor="middle" stroke="none" fill="#eef0f2" fontSize="9" fontWeight="900">
              BREW
            </text>
            <rect x="98" y="12" width="14" height="30" rx="3" fill="#243746" />
            <circle cx="117" cy="27" r="6" stroke="none" fill={glow} style={lit} />
            <path d="M116 17q7-5 1-10M123 19q6-6 1-12" fill="none" stroke={glow} strokeWidth="1.8" style={lit} />
          </>
        )}
        {item === 'sticky-shuriken' && (
          <>
            {[0, 1, 2, 3].map((k) => (
              <g key={k} transform={`rotate(${k * 90} 50 50)`}>
                <rect x="37" y="11" width="26" height="26" fill={k % 2 ? '#ff8fb1' : '#ffe066'} transform="rotate(45 50 24)" />
              </g>
            ))}
            <circle cx="50" cy="50" r="11" fill="none" stroke={glow} strokeWidth="2" style={lit} />
            <circle cx="50" cy="50" r="7" fill={GOLD} />
          </>
        )}
        {item === 'keyboard-blade' && (
          <>
            <path d="M10 12L20 1l10 11v84H10z" fill="#1e2630" />
            {Array.from({ length: 18 }, (_, key) => {
              const row = Math.floor(key / 2),
                col = key % 2;
              return (
                <rect
                  key={key}
                  x={12.5 + col * 8}
                  y={15 + row * 9}
                  width="6.5"
                  height="6.5"
                  rx="1"
                  stroke="none"
                  fill={(row + col * 2) % 5 === 0 ? glow : '#d9e1ea'}
                />
              );
            })}
            <path d="M10 96V12L20 1l10 11v84" fill="none" stroke={glow} strokeWidth="1.5" style={lit} />
            <rect x="2" y="96" width="36" height="7" rx="2" fill={STEEL} />
            <path d="M6 99.5h28" fill="none" stroke={glow} strokeWidth="1.5" style={lit} />
            <rect x="16" y="103" width="8" height="18" fill="#3a2a22" />
            <circle cx="20" cy="124" r="5" fill={GOLD} />
          </>
        )}
        {item === 'staple-cannon' && (
          <g transform="rotate(-14 60 30)">
            <rect x="22" y="34" width="12" height="22" rx="3" fill="#1b2027" />
            <rect x="8" y="18" width="62" height="22" rx="5" fill={STEEL} />
            <rect x="6" y="10" width="66" height="10" rx="3" fill="#2c9aa8" />
            <rect x="14" y="20" width="40" height="5" fill="#c9d3dc" />
            <rect x="68" y="21" width="36" height="14" rx="3" fill={GUNMETAL} />
            {[74, 84, 94].map((x) => (
              <rect key={x} x={x} y="17" width="4" height="22" rx="1" stroke="none" fill={glow} style={lit} />
            ))}
            <circle cx="109" cy="28" r="7" stroke="none" fill={glow} style={lit} />
            <circle cx="109" cy="28" r="3" stroke="none" fill="#fff" />
            <path d="M14 31h48" fill="none" stroke={glow} strokeWidth="2" style={lit} />
          </g>
        )}
        {item === 'monitor-shield' && (
          <>
            <path d="M30 68l6 18 6-18zM58 68l6 18 6-18z" fill={STEEL} />
            <rect x="4" y="4" width="92" height="64" rx="6" fill="#20262e" />
            <rect x="10" y="10" width="80" height="52" rx="2" fill="#0d1a2a" />
            <text x="50" y="39" textAnchor="middle" stroke="none" fill={glow} fontSize="24" fontWeight="900" style={lit}>
              404
            </text>
            <text x="50" y="53" textAnchor="middle" stroke="none" fill={glow} fontSize="7.5" fontWeight="900">
              FEAR NOT FOUND
            </text>
            <path d="M10 7h80M10 65h80" fill="none" stroke={glow} strokeWidth="1.5" style={lit} />
            {[
              [9, 9],
              [91, 9],
              [9, 63],
              [91, 63],
            ].map(([cx, cy]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.2" stroke="none" fill={GOLD} />
            ))}
          </>
        )}
        {item === 'deadline-scythe' && (
          <>
            <rect x="58" y="18" width="6" height="110" rx="3" fill="#2a2f38" />
            <rect x="56.5" y="70" width="9" height="5" fill={GOLD} />
            <rect x="56.5" y="100" width="9" height="5" fill={GOLD} />
            <path d="M60 22C40 2 8 8 2 34c16-14 38-14 58-4z" fill="#a9bccb" />
            <path d="M60 22C40 2 8 8 2 34" fill="none" stroke={glow} strokeWidth="2" style={lit} />
            <circle cx="61" cy="22" r="15" fill="none" stroke={glow} strokeWidth="1.5" style={lit} />
            <circle cx="61" cy="22" r="11" fill="#f3ead7" stroke={GOLD} strokeWidth="3" />
            <path d="M61 22v-7M61 22h5" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          </>
        )}
        {item === 'mouse-flail' && (
          <>
            <path d="M13 72C10 46 40 48 46 32" fill="none" stroke={glow} strokeWidth="2.5" style={lit} />
            <rect x="8" y="72" width="10" height="34" rx="3" fill={STEEL} />
            <rect x="6.5" y="70" width="13" height="5" rx="1" fill={GOLD} />
            {Array.from({ length: 9 }, (_, spike) => {
              const a = -Math.PI / 2 + ((spike + 1) / 10) * Math.PI * 2;
              const x = 56 + Math.cos(a) * 14,
                y = 22 + Math.sin(a) * 18;
              return (
                <path
                  key={spike}
                  d="M-3.5 0L0-10 3.5 0z"
                  fill={STEEL}
                  transform={`translate(${x} ${y}) rotate(${(a * 180) / Math.PI + 90})`}
                />
              );
            })}
            <ellipse cx="56" cy="22" rx="14" ry="18" fill="#d7dde4" />
            <path d="M56 4v12" fill="none" stroke={INK} strokeWidth="2" />
            <rect x="53.5" y="8" width="5" height="7" rx="2" stroke="none" fill={glow} style={lit} />
          </>
        )}
      </g>
    </svg>
  );
}
