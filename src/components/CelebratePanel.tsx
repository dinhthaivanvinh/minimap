// The "Birthday and start date" panel on /account. Only the month and day of a birthday are
// kept, never the year.
import { useEffect, useState, type FormEvent } from 'react';
import type { CelebrateDates } from '../../shared/celebrate.ts';
import { api, errorText } from '../lib/api.ts';
import { useMessage } from '../lib/hooks.ts';
import { Button, Field, FieldLabel, Input, PanelHint, Row, StackPanel } from '../styles/ui.ts';
import { birthdayToSend, BirthdayInput, localToday } from './BirthdayInput.tsx';
import { StatusLine } from './SheetNav.tsx';

export function CelebratePanel({ token }: { token: string }) {
  const [birthday, setBirthday] = useState('');
  const [joined, setJoined] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, showMessage] = useMessage(2500);
  const auth = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    api<CelebrateDates>('GET', '/api/celebrate/me', undefined, { Authorization: `Bearer ${token}` })
      .then((dates) => {
        setBirthday(dates.birthday ?? '');
        setJoined(dates.joined ?? '');
        setLoaded(true);
      })
      .catch((err) => showMessage(errorText(err), true));
  }, [token, showMessage]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const dates = await api<CelebrateDates>('PATCH', '/api/celebrate/me', { birthday: birthdayToSend(birthday), joined }, auth);
      setBirthday(dates.birthday ?? '');
      setJoined(dates.joined ?? '');
      showMessage('Dates saved');
    } catch (err) {
      showMessage(errorText(err), true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <StackPanel as="form" onSubmit={(event) => void save(event)}>
      <h2>Birthday and start date</h2>
      <PanelHint style={{ margin: 0 }}>
        On the day, your character wears a party hat and teammates can send you wishes. Only the month and day of your birthday are
        kept. Leave either empty to keep it to yourself.
      </PanelHint>
      <Field>
        <FieldLabel>Birthday</FieldLabel>
        <BirthdayInput label="Birthday" value={birthday} onChange={setBirthday} />
      </Field>
      <Field>
        <FieldLabel>First day on the team</FieldLabel>
        <Input type="date" min="1970-01-01" max={localToday()} value={joined} onChange={(event) => setJoined(event.target.value)} />
      </Field>
      <Row>
        <Button $primary type="submit" disabled={!loaded || saving}>Save dates</Button>
      </Row>
      <StatusLine message={message} />
    </StackPanel>
  );
}
