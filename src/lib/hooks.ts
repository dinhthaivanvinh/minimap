import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { TeamState } from '../../shared/types.ts';
import { subscribe } from './api.ts';

export function useTeamState(): { state: TeamState | null; online: boolean } {
  const [state, setState] = useState<TeamState | null>(null);
  const [online, setOnline] = useState(true);
  useEffect(() => subscribe(setState, setOnline), []);
  return { state, online };
}

export function useElementSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

export function useNow(everyMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

export interface Message {
  text: string;
  isError: boolean;
}

// A status line for a form. Success messages clear by themselves when `fadeMs` is set.
export function useMessage(fadeMs?: number) {
  const [message, setMessage] = useState<Message>({ text: '', isError: false });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const show = useCallback(
    (text: string, isError = false) => {
      setMessage({ text, isError });
      clearTimeout(timer.current);
      if (fadeMs && !isError) timer.current = setTimeout(() => setMessage({ text: '', isError: false }), fadeMs);
    },
    [fadeMs],
  );
  return [message, show] as const;
}
