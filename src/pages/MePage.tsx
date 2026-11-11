// Standalone status/account destinations share the same editor as the home dialogs.
import { useEffect } from 'react';
import { MemberEditor } from '../components/MemberEditor.tsx';
import { SheetNav } from '../components/SheetNav.tsx';
import { useTeamState } from '../lib/hooks.ts';
import { useSession } from '../lib/session.ts';
import { Sheet } from '../styles/ui.ts';

export function MePage({ account = false }: { account?: boolean }) {
  const { state, onUserSaved, onFundSaved } = useTeamState();
  const session = useSession(state);
  useEffect(() => {
    document.title = account ? 'Account settings' : 'Update status';
  }, [account]);
  return (
    <Sheet>
      <SheetNav
        links={[
          { href: '/', label: 'Map' },
          { href: account ? '/me' : '/account', label: account ? 'Update status' : 'Account settings' },
          { href: '/admin', label: 'Admin' },
        ]}
      />
      <MemberEditor
        state={state}
        session={session}
        account={account}
        onUserSaved={onUserSaved}
        onFundSaved={onFundSaved}
      />
    </Sheet>
  );
}
