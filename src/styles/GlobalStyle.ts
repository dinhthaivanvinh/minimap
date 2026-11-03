import { createGlobalStyle } from 'styled-components';
import { theme } from './theme.ts';

const VIETNAMESE = 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB';
const LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

const SUBSETS = [
  ['vietnamese', VIETNAMESE],
  ['latin-ext', LATIN_EXT],
  ['latin', LATIN],
] as const;

function fontFaces(family: string, file: string, weights: string): string {
  return SUBSETS.map(
    ([subset, range]) => `
      @font-face {
        font-family: '${family}';
        font-weight: ${weights};
        font-display: swap;
        src: url(/vendor/fonts/${file}-${subset}-wght-normal.woff2) format('woff2');
        unicode-range: ${range};
      }`,
  ).join('\n');
}

export const GlobalStyle = createGlobalStyle`
  ${fontFaces('Baloo 2', 'baloo-2', '400 800')}
  ${fontFaces('Nunito', 'nunito', '200 1000')}

  * { box-sizing: border-box; }

  html, body, #root { height: 100%; }

  body {
    margin: 0;
    background: ${theme.sky};
    color: ${theme.ink};
    font: 600 16px/1.45 ${theme.bodyFont};
  }

  h1, h2, h3 {
    margin: 0;
    font-family: ${theme.displayFont};
    font-weight: 800;
    line-height: 1.15;
  }

  a { color: inherit; }

  :focus-visible { outline: 3px solid ${theme.focus}; outline-offset: 2px; }

  button, input { font: inherit; color: inherit; }
`;
