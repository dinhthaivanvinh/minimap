import { ASSEMBLY_PROP_NAMES, type AssemblyProp as Prop } from '../lib/assemblyProps.ts';

export function AssemblyProp({ item }: { item: Prop }) {
  return (
    <svg
      className={`signature-prop prop-${item}`}
      viewBox="0 0 100 100"
      role="img"
      aria-label={ASSEMBLY_PROP_NAMES[item]}
    >
      <g stroke="#243746" strokeWidth="4" strokeLinejoin="round">
        {item === 'badge' && (
          <>
            <circle cx="50" cy="50" r="41" fill="#e6b25b" />
            <circle cx="50" cy="50" r="33" fill="#fff0c5" stroke="#af793b" />
            <text
              x="50"
              y="48"
              textAnchor="middle"
              stroke="none"
              fill="#243746"
              fontSize="26"
              fontWeight="900"
            >
              #1
            </text>
            <text
              x="50"
              y="66"
              textAnchor="middle"
              stroke="none"
              fill="#243746"
              fontSize="10"
              fontWeight="900"
            >
              EMPLOYEE
            </text>
          </>
        )}
        {item === 'stapler' && (
          <g transform="rotate(-25 50 50)">
            <rect x="38" y="49" width="17" height="43" rx="4" fill="#d5b47e" />
            <path d="M12 25h73v18H12z" fill="#42a8b5" />
            <path d="M16 43h12v19h58v11H12V43z" fill="#e7cfa1" />
            <path d="M28 45h49" fill="none" stroke="#8acddd" />
          </g>
        )}
        {item === 'box-frame' && (
          <>
            <path d="M8 23l14-12h56l14 12-8 65H16z M28 30v34h44V30z" fill="#bf915d" fillRule="evenodd" />
            <path d="M28 30h44v34H28z" fill="none" />
            <path d="M8 23l20 7M92 23L72 30M50 11v18M18 75h64" fill="none" stroke="#f5d7a0" />
            <rect x="37" y="70" width="26" height="11" fill="#7ccbd3" />
          </>
        )}
        {item === 'travel-mug' && (
          <g transform="rotate(12 50 50)">
            <path d="M68 35h19v34H68" fill="none" stroke="#e3b160" strokeWidth="9" />
            <path d="M22 23h48l-5 63H27z" fill="#57bac4" />
            <rect x="18" y="15" width="56" height="14" rx="4" fill="#243746" />
            <path d="M30 40h30v25H30z" fill="#ffe5ac" />
            <path d="M45 43l-7 12h10l-6 8" fill="none" stroke="#c9873f" />
          </g>
        )}
        {item === 'review-axe' && (
          <g transform="rotate(23 50 50)">
            <rect x="43" y="14" width="13" height="79" rx="4" fill="#d6aa70" />
            <path d="M48 15h37l-8 34-29-8z" fill="#fff1d1" />
            <path d="M55 23h20M55 30h17M55 37h12" fill="none" stroke="#61aeb9" strokeWidth="3" />
            <ellipse cx="48" cy="15" rx="8" ry="6" fill="#fff1d1" />
          </g>
        )}
      </g>
    </svg>
  );
}
