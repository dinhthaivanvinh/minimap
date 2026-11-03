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

// Calls onState with each new state. EventSource reconnects by itself.
export function subscribe(onState: (state: TeamState) => void, onConnection: (online: boolean) => void): () => void {
  const source = new EventSource('/api/events');
  source.onopen = () => onConnection(true);
  source.onerror = () => onConnection(false);
  source.onmessage = (event: MessageEvent<string>) => {
    onConnection(true);
    onState(JSON.parse(event.data) as TeamState);
  };
  return () => source.close();
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.';
}
