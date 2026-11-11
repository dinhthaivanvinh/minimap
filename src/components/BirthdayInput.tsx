// The month-and-day picker for a birthday, shared by the account panel and the admin's panel.
// Only the month and day are kept, never the year.
import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Input } from '../styles/ui.ts';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// February has 29, so a leap-day birthday can be picked.
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const two = (n: number) => String(n).padStart(2, '0');

const Pair = styled.div`
  display: flex;
  gap: 6px;
  min-width: 0;

  select { flex: 1; min-width: 0; }
`;

/** Today on this computer, YYYY-MM-DD, as the start date's latest choice. */
export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/** A month and a day, as MM-DD, or '' for not set. Half a choice is kept until both are picked. */
export function BirthdayInput({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const [month, setMonth] = useState(value.slice(0, 2));
  const [day, setDay] = useState(value.slice(3, 5));
  // A saved or loaded value replaces the picks; half a choice is this picker's own.
  useEffect(() => {
    if (value === 'part') return;
    setMonth(value.slice(0, 2));
    setDay(value.slice(3, 5));
  }, [value]);

  function pick(nextMonth: string, nextDay: string) {
    const max = nextMonth ? (DAYS_IN[Number(nextMonth) - 1] ?? 31) : 31;
    const fitted = nextDay && Number(nextDay) > max ? two(max) : nextDay;
    setMonth(nextMonth);
    setDay(fitted);
    onChange(nextMonth && fitted ? `${nextMonth}-${fitted}` : nextMonth || fitted ? 'part' : '');
  }

  const days = month ? (DAYS_IN[Number(month) - 1] ?? 31) : 31;
  return (
    <Pair>
      <Input as="select" aria-label={`${label}: month`} value={month} onChange={(event) => pick(event.target.value, day)}>
        <option value="">Month</option>
        {MONTHS.map((name, i) => <option key={name} value={two(i + 1)}>{name}</option>)}
      </Input>
      <Input as="select" aria-label={`${label}: day`} value={day} onChange={(event) => pick(month, event.target.value)}>
        <option value="">Day</option>
        {Array.from({ length: days }, (_, i) => <option key={i} value={two(i + 1)}>{i + 1}</option>)}
      </Input>
    </Pair>
  );
}

/** What to send for a birthday picker's value, or an error when only half is picked. */
export function birthdayToSend(value: string): string {
  if (value === 'part') throw new Error('Pick both a month and a day for the birthday, or neither.');
  return value;
}
