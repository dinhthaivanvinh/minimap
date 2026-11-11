// Home-page status and account dialogs reuse the standalone forms and the map's live state.
import { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { theme } from '../styles/theme.ts';
import { Button } from '../styles/ui.ts';
import { MemberEditor, type MemberEditorProps } from './MemberEditor.tsx';

const Dialog = styled.dialog`
  width: min(680px, calc(100% - 24px));
  max-height: calc(100dvh - 24px);
  padding: 0;
  border: ${theme.line};
  border-radius: 22px;
  background: ${theme.sky};
  color: ${theme.ink};
  overflow: auto;
  box-shadow: 0 12px 50px #2a265744;
  &::backdrop {
    background: #2a265777;
  }
`;
const Header = styled.header`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 14px 16px;
  background: ${theme.paper};
  border-bottom: ${theme.thinLine};
  h2 {
    flex: 1;
    min-width: 140px;
    font-size: 24px;
  }
  a {
    color: ${theme.inkSoft};
    font-weight: 800;
  }
`;
const Content = styled.div`
  padding: 0 16px 20px;
  min-width: 0;
`;
export interface MemberDialogProps extends Omit<MemberEditorProps, 'embedded'> {
  trigger: HTMLElement;
  onClose: () => void;
}

export function MemberDialog({ trigger, onClose, ...editor }: MemberDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = editor.account ? 'Account settings' : 'Update status';
  useEffect(() => {
    const node = dialog.current!;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    node.showModal();
    return () => {
      node.close();
      document.body.style.overflow = overflow;
      const target = trigger.isConnected
        ? trigger
        : (document.querySelector<HTMLElement>('[data-member-dialog-trigger]') ??
          document.querySelector<HTMLElement>('header a'));
      target?.focus({ preventScroll: true });
    };
  }, [trigger]);
  return (
    <Dialog
      ref={dialog}
      aria-labelledby="member-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
    >
      <Header>
        <h2 id="member-dialog-title">{title}</h2>
        <a href={editor.account ? '/account' : '/me'}>Open full page</a>
        <Button type="button" autoFocus aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>
          Close
        </Button>
      </Header>
      <Content>
        <MemberEditor {...editor} embedded />
      </Content>
    </Dialog>
  );
}
