// Fetch and live-update helpers shared by all pages.
import type { TeamState } from '../../shared/types.ts';

export class ApiFailure extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiFailure(0, 'Could not reach the server. Check your connection and try again.');
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiFailure(res.status, json.error || 'Something went wrong.');
  return json as T;
}

const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 30_000;

// Calls onState with each new state. EventSource retries a dropped connection by
// itself, but gives up for good on an HTTP error, such as a proxy's 502 during a
// restart. Only then do we open a new one.
export function subscribe(onState: (state: TeamState) => void, onConnection: (online: boolean) => void): () => void {
  let source: EventSource;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryMs = RETRY_MIN_MS;

  function connect() {
    source = new EventSource('/api/events');
    source.onopen = () => {
      retryMs = RETRY_MIN_MS;
      onConnection(true);
    };
    source.onerror = () => {
      onConnection(false);
      if (source.readyState !== EventSource.CLOSED) return;
      retryTimer = setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
    };
    source.onmessage = (event) => {
      onConnection(true);
      onState(JSON.parse(event.data) as TeamState);
    };
  }

  connect();
  return () => {
    clearTimeout(retryTimer);
    source.close();
  };
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.';
}
