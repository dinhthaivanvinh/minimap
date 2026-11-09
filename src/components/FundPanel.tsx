// The "Team fund" panel on /me: your title from the fund's sheet, what your character wears
// because of it, and a switch to hide the look for people who paid ahead.
import { useState } from 'react';
import { canHide, type FundTier } from '../../shared/fund.ts';
import type { TeamUser } from '../../shared/types.ts';
import { api, errorText } from '../lib/api.ts';
import { useMessage } from '../lib/hooks.ts';
import { PanelHint, StackPanel, Switch } from '../styles/ui.ts';
import { StatusLine } from './SheetNav.tsx';

function explain(tier: FundTier, months: number): string {
  const count = `${Math.abs(months)} month${Math.abs(months) === 1 ? '' : 's'}`;
  if (tier === 'broke') return `You’re ${count} behind, so your character wears patches under a rain cloud. Pay the fund to clear it.`;
  if (tier === 'debtor') return 'You’re a month behind, so your character carries a “nợ 50k” note. Pay the fund to clear it.';
  if (tier === 'normal') return 'You’re up to date, so your character wears nothing extra.';
  return `You paid ${count} ahead, so your character dresses up. You can hide it if you like.`;
}

export function FundPanel({ user, token }: { user: TeamUser; token: string }) {
  const [message, showMessage] = useMessage(2500);
  const [saving, setSaving] = useState(false);
  const fund = user.fund;
  if (!fund) return null;

  async function setHidden(hidden: boolean) {
    setSaving(true);
    try {
      await api('PATCH', '/api/fund/me', { hidden }, { Authorization: `Bearer ${token}` });
      showMessage(hidden ? 'Fund look hidden' : 'Fund look shown');
    } catch (err) {
      showMessage(errorText(err), true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <StackPanel>
      <h2>Team fund: {fund.title}</h2>
      <PanelHint style={{ margin: 0 }}>{explain(fund.tier, fund.months)}</PanelHint>
      {canHide(fund.tier) && (
        <Switch>
          <input type="checkbox" checked={!fund.hidden} disabled={saving} onChange={(event) => void setHidden(!event.target.checked)} />
          Show my fund look on the map
        </Switch>
      )}
      <StatusLine message={message} />
    </StackPanel>
  );
}
