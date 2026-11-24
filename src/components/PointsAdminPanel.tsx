// The admin's "Reward points" panel: the rate, cap, penalty, office hours and workdays, which offices
// earn, the office network's addresses (with a button that adds the address the admin is using
// now, for when they are in the office), and changing someone's points by hand with a reason.
import { useEffect, useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { MAX_IPS, MAX_REASON, type PointsSettings } from '../../shared/points.ts';
import type { Place, TeamUser } from '../../shared/types.ts';
import { useMessage } from '../lib/hooks.ts';
import { theme } from '../styles/theme.ts';
import { Button, Chip, Chips, Field, FieldLabel, Input, PanelHint, Row, StackPanel } from '../styles/ui.ts';
import { StatusLine } from './SheetNav.tsx';

type AdminCall = <T = unknown>(method: string, url: string, body?: unknown) => Promise<T>;
type ShowMessage = (text: string, isError?: boolean) => void;
type Runner = (action: () => Promise<unknown>, done: string, show: ShowMessage) => Promise<void>;
type AdminView = { settings: PointsSettings; ip: string | null };

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const Fields = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
`;

const Addresses = styled.textarea`
  width: 100%;
  min-height: 80px;
  padding: 8px 10px;
  border: ${theme.thinLine};
  border-radius: 12px;
  font: 600 15px/1.4 ui-monospace, monospace;
  resize: vertical;
`;

const Select = styled.select`
  padding: 8px 10px;
  border: ${theme.thinLine};
  border-radius: 12px;
  background: ${theme.white};
  font: inherit;
`;

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

export function PointsAdminPanel({ users, places, call, run }: { users: TeamUser[]; places: Place[]; call: AdminCall; run: Runner }) {
  const [settings, setSettings] = useState<PointsSettings | null>(null);
  const [ipText, setIpText] = useState('');
  const [myIp, setMyIp] = useState<string | null>(null);
  const [message, showMessage] = useMessage(2500);
  const [adjustMessage, showAdjustMessage] = useMessage(2500);
  const [who, setWho] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  function apply(view: AdminView) {
    setSettings(view.settings);
    setIpText(view.settings.ips.join('\n'));
    setMyIp(view.ip);
  }

  useEffect(() => {
    void run(() => call<AdminView>('GET', '/api/points/admin').then(apply), '', showMessage);
  }, [call, run, showMessage]);

  if (!settings) return null;
  const set = (change: Partial<PointsSettings>) => setSettings({ ...settings, ...change });
  const ips = ipText.split(/[\s,]+/).filter(Boolean);
  const number = (key: 'perHour' | 'dailyCapHours' | 'missPenalty') => ({
    type: 'number' as const,
    min: key === 'dailyCapHours' ? 1 : 0,
    max: key === 'dailyCapHours' ? 24 : undefined,
    required: true,
    value: String(settings[key]),
    onChange: (event: { target: { value: string } }) => set({ [key]: Number(event.target.value) }),
  });

  function save(event: FormEvent) {
    event.preventDefault();
    void run(() => call<AdminView>('PATCH', '/api/points/admin', { ...settings, ips }).then(apply), 'Points settings saved', showMessage);
  }

  function adjust(event: FormEvent) {
    event.preventDefault();
    const body = { username: who, amount: Number(amount), reason };
    void run(
      () => call('POST', '/api/points/admin/adjust', body).then(() => (setAmount(''), setReason(''))),
      'Points changed',
      showAdjustMessage,
    );
  }

  return (
    <>
      <StackPanel as="form" onSubmit={save}>
        <h2>Reward points</h2>
        <PanelHint style={{ margin: 0 }}>
          People earn points for time in an earning office during office hours on workdays. Someone who doesn’t check in at all on a workday
          loses points, unless nobody checked in that day. Points never go below zero. Everyone sees the board on{' '}
          <a href="/points">Reward points</a> and the notice board.
        </PanelHint>
        <Fields>
          <Field>
            <FieldLabel>Points an hour</FieldLabel>
            <Input {...number('perHour')} />
          </Field>
          <Field>
            <FieldLabel>Hours a day, at most</FieldLabel>
            <Input {...number('dailyCapHours')} />
          </Field>
          <Field>
            <FieldLabel>Lost without a check-in</FieldLabel>
            <Input {...number('missPenalty')} />
          </Field>
          <Field>
            <FieldLabel>Office hours start</FieldLabel>
            <Input type="time" required value={settings.start} onChange={(e) => set({ start: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel>Office hours end</FieldLabel>
            <Input type="time" required value={settings.end} onChange={(e) => set({ end: e.target.value })} />
          </Field>
        </Fields>

        <FieldLabel id="points-days">Workdays</FieldLabel>
        <Chips role="group" aria-labelledby="points-days">
          {DAYS.map((day, i) => (
            <Chip key={day} type="button" aria-pressed={settings.workdays.includes(i)} onClick={() => set({ workdays: toggle(settings.workdays, i) })}>
              {day}
            </Chip>
          ))}
        </Chips>

        <FieldLabel id="points-offices">Offices that earn</FieldLabel>
        <Chips role="group" aria-labelledby="points-offices">
          {places.map((place, i) => {
            // With none picked, the first office earns.
            const on = settings.offices.length ? settings.offices.includes(place.id) : i === 0;
            const offices = settings.offices.length ? settings.offices : places.slice(0, 1).map((p) => p.id);
            return (
              <Chip key={place.id} type="button" aria-pressed={on} onClick={() => set({ offices: toggle(offices, place.id) })}>
                {place.name}
              </Chip>
            );
          })}
        </Chips>

        <Field>
          <FieldLabel>Office network addresses (one a line, up to {MAX_IPS})</FieldLabel>
          <Addresses
            value={ipText}
            spellCheck={false}
            placeholder="Empty: time counts from anywhere"
            onChange={(e) => setIpText(e.target.value)}
          />
        </Field>
        <PanelHint style={{ margin: 0 }}>
          With addresses here, time only counts when someone checks in from the office network. To add it, open this page on the office
          Wi-Fi with any VPN turned off, press the button, then save. Someone at home on a company VPN that goes through the office looks
          the same as someone in the office. Ranges like 203.0.113.0/24 work too.
        </PanelHint>
        <Row style={{ flexWrap: 'wrap' }}>
          {myIp && (
            <Button type="button" disabled={ips.includes(myIp)} onClick={() => setIpText([...ips, myIp].join('\n'))}>
              {ips.includes(myIp) ? `Your address ${myIp} is on the list` : `Add your address (${myIp})`}
            </Button>
          )}
          <Button type="submit" $primary>
            Save points settings
          </Button>
        </Row>
        <StatusLine message={message} />
      </StackPanel>

      <StackPanel as="form" onSubmit={adjust}>
        <h2>Change someone’s points</h2>
        <PanelHint style={{ margin: 0 }}>Use a minus sign to take points away. Everyone sees the change and its reason.</PanelHint>
        <Fields>
          <Field>
            <FieldLabel>Person</FieldLabel>
            <Select required value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Pick someone</option>
              {users.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.nickname}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel>Points</FieldLabel>
            <Input type="number" required step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        </Fields>
        <Field>
          <FieldLabel>Reason</FieldLabel>
          <Input required maxLength={MAX_REASON} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Row>
          <Button type="submit">Change points</Button>
        </Row>
        <StatusLine message={adjustMessage} />
      </StackPanel>
    </>
  );
}
