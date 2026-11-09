// Controls and layout pieces shared across pages.
import styled, { css } from 'styled-components';
import { media, theme } from './theme.ts';

export const Button = styled.button<{ $primary?: boolean; $small?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 16px;
  border: ${theme.line};
  border-radius: 14px;
  background: ${theme.paper};
  box-shadow: 0 3px 0 ${theme.ink};
  font-family: ${theme.displayFont};
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;

  &:hover { background: ${theme.hover}; }
  &:active { transform: translateY(3px); box-shadow: none; }
  &:disabled { opacity: .5; cursor: default; }

  ${({ $primary }) => $primary && css`
    background: ${theme.bubblegum};
    &:hover { background: #ffb3d1; }
  `}

  ${({ $small }) => $small && css`
    padding: 2px 11px;
    border-radius: 10px;
    font-size: 14px;
    box-shadow: 0 2px 0 ${theme.ink};
    &:active { transform: translateY(2px); }
  `}
`;

export const Field = styled.label`
  display: grid;
  gap: 4px;
`;

export const FieldLabel = styled.span`
  font-family: ${theme.displayFont};
  font-weight: 700;
`;

export const Input = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: ${theme.line};
  border-radius: 12px;
  background: ${theme.white};

  &::placeholder { color: ${theme.inkSoft}; font-weight: 500; }
`;

export const Segmented = styled.div`
  display: inline-flex;
  border: ${theme.line};
  border-radius: 14px;
  background: ${theme.paper};
  box-shadow: 0 3px 0 ${theme.ink};
  overflow: hidden;

  button {
    border: 0;
    padding: 5px 14px;
    background: transparent;
    font-family: ${theme.displayFont};
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  button + button { border-left: ${theme.line}; }
  button:hover { background: ${theme.hover}; }
  button[aria-pressed='true'] { background: ${theme.butter}; }
  button:focus-visible { outline-offset: -5px; }
  button:disabled { opacity: .45; cursor: not-allowed; }

  ${media.phone} {
    button { padding: 5px 10px; }
  }
`;

export const Count = styled.span`
  margin-left: 3px;
  font-weight: 500;
`;

export const Wordmark = styled.a`
  margin-right: 6px;
  font: 800 26px/1 ${theme.displayFont};
  text-decoration: none;

  ${media.phone} { flex-basis: 100%; }
`;

// ---- Form pages ---------------------------------------------------------

export const Sheet = styled.div`
  width: min(560px, 100%);
  margin: 0 auto;
  padding: 0 16px 40px;
`;

export const Panel = styled.section`
  margin-top: 16px;
  padding: 18px 20px;
  border: ${theme.line};
  border-radius: 20px;
  background: ${theme.paper};
  box-shadow: 0 5px 0 ${theme.ink};

  h2 { margin-bottom: 10px; font-size: 22px; }
`;

export const StackPanel = styled(Panel)`
  display: grid;
  gap: 12px;
`;

export const PanelHint = styled.p`
  margin: -6px 0 10px;
  color: ${theme.inkSoft};
`;

export const Row = styled.div`
  display: flex;
  gap: 8px;
  align-items: stretch;

  ${Input} { flex: 1; min-width: 0; }
`;

/** A label around a checkbox, for on and off settings. */
export const Switch = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  cursor: pointer;

  input { width: 18px; height: 18px; margin: 0; accent-color: ${theme.ink}; }
`;

export const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
`;

export const Chip = styled.button`
  padding: 2px 12px;
  border: ${theme.thinLine};
  border-radius: 12px;
  background: ${theme.white};
  font-weight: 800;
  cursor: pointer;

  &:hover { background: ${theme.hover}; }
  &[aria-pressed='true'] { background: ${theme.butter}; }

  small { color: ${theme.inkSoft}; font-size: 13px; font-weight: 600; }
`;
