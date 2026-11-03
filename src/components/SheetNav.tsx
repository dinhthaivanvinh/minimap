import styled from 'styled-components';
import type { Message } from '../lib/hooks.ts';
import { theme } from '../styles/theme.ts';
import { Wordmark } from '../styles/ui.ts';

const Nav = styled.nav`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 16px 0;
`;

const NavLinks = styled.div`
  display: flex;
  gap: 14px;
  margin-left: auto;
  font-weight: 800;
`;

const Line = styled.p<{ $error: boolean }>`
  min-height: 1.45em;
  margin: 8px 0 0;
  color: ${({ $error }) => ($error ? theme.error : 'inherit')};
  font-weight: 800;
`;

export function SheetNav({ links }: { links: { href: string; label: string }[] }) {
  return (
    <Nav>
      <Wordmark href="/">Team Minimap</Wordmark>
      <NavLinks>
        {links.map((link) => (
          <a key={link.href} href={link.href}>{link.label}</a>
        ))}
      </NavLinks>
    </Nav>
  );
}

export function StatusLine({ message }: { message: Message }) {
  return (
    <Line $error={message.isError} role={message.isError ? 'alert' : 'status'}>
      {message.text}
    </Line>
  );
}
