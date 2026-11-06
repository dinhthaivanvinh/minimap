// Team Minimap on Cloudflare Workers.
//
// Cloudflare serves the built pages in dist/ by itself. Everything else comes here:
// /me and /admin get the same page as /, and /api/ goes to one Durable Object that holds
// the whole team. It runs the same API as the Node.js server (server/core.ts), keeps the
// data in its own storage, and sends live updates to every open map.

import { DurableObject } from 'cloudflare:workers';
import { ApiError, createCore, MAX_BODY, WEATHER_EVERY_MS, type Core, type JsonBody } from '../server/core.ts';

interface Env {
  ASSETS: Fetcher;
  MINIMAP: DurableObjectNamespace<Minimap>;
  ADMIN_PASSWORD?: string;
  RESET_AT?: string;
  TZ?: string;
}

// React decides which page to show, so these serve the same file as /.
const PAGES = new Set(['/me', '/admin']);
const PING_MS = 25 * 1000;
const encoder = new TextEncoder();

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (!env.ADMIN_PASSWORD) {
        return json(500, { error: 'ADMIN_PASSWORD is not set. Run `npx wrangler secret put ADMIN_PASSWORD`.' });
      }
      return env.MINIMAP.get(env.MINIMAP.idFromName('team')).fetch(request);
    }
    if (PAGES.has(url.pathname)) return env.ASSETS.fetch(new Request(new URL('/', url), request));
    // Files in dist/ never reach the Worker, so anything else does not exist.
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  },
} satisfies ExportedHandler<Env>;

async function readJson(request: Request, maxBytes = MAX_BODY): Promise<JsonBody> {
  if (Number(request.headers.get('content-length')) > maxBytes) throw new ApiError(413, 'Request too large.');
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > maxBytes) throw new ApiError(413, 'Request too large.');
  try {
    const body: unknown = bytes.byteLength ? JSON.parse(new TextDecoder().decode(bytes)) : {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as JsonBody;
  } catch {
    throw new ApiError(400, 'Invalid JSON.');
  }
}

export class Minimap extends DurableObject<Env> {
  private core!: Core;
  private clients = new Set<WritableStreamDefaultWriter<Uint8Array>>();
  private ticker: ReturnType<typeof setInterval> | undefined;
  private weatherAt = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<string>('data');
      this.core = createCore({
        saved: saved ? JSON.parse(saved) : null,
        // Game routes await this promise before acknowledging a durable round or score.
        save: (data) => ctx.storage.put('data', JSON.stringify(data)),
        onChange: (state) => {
          this.sendAll(`data: ${JSON.stringify(state)}\n\n`);
          this.syncAlarm();
        },
        adminPassword: env.ADMIN_PASSWORD ?? '',
        resetAt: env.RESET_AT || '05:00',
        timeZone: env.TZ || 'UTC',
      });
      this.runTimedChanges();
      this.core.save();
      this.syncAlarm();
    });
  }

  // Wakes the object for the next scheduled change, even with no map open.
  override async alarm(): Promise<void> {
    this.runTimedChanges();
    this.syncAlarm();
  }

  // The reset goes first, so it wins over schedules that are overdue.
  private runTimedChanges(): void {
    this.core.runResetIfDue();
    this.core.runScheduledIfDue();
  }

  private syncAlarm(): void {
    const next = this.core.nextScheduledAt();
    void (next ? this.ctx.storage.setAlarm(new Date(next)) : this.ctx.storage.deleteAlarm());
  }

  override async fetch(request: Request): Promise<Response> {
    // Only alarms run while nobody is looking, so catch up on the reset and weather first.
    this.runTimedChanges();
    this.refreshWeatherIfDue();

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/events') return this.openEvents();

    const { status, body, headers } = await this.core.handle({
      method: request.method,
      url,
      header: (name) => request.headers.get(name) ?? undefined,
      readJson: (maxBytes) => readJson(request, maxBytes),
    });
    return new Response(JSON.stringify(body), { status, headers });
  }

  private refreshWeatherIfDue(): void {
    if (Date.now() - this.weatherAt < WEATHER_EVERY_MS) return;
    this.weatherAt = Date.now();
    this.ctx.waitUntil(this.core.refreshWeather());
  }

  private openEvents(): Response {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    this.clients.add(writer);
    this.send(writer, `data: ${JSON.stringify(this.core.publicState())}\n\n`);
    // While a map is open, keep the connection alive and the reset and weather on time.
    this.ticker ??= setInterval(() => {
      this.sendAll(': ping\n\n');
      this.runTimedChanges();
      this.refreshWeatherIfDue();
    }, PING_MS);
    return new Response(readable, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
    });
  }

  private send(writer: WritableStreamDefaultWriter<Uint8Array>, text: string): void {
    // A write fails once the browser has gone away.
    writer.write(encoder.encode(text)).catch(() => this.drop(writer));
  }

  private sendAll(text: string): void {
    for (const writer of this.clients) this.send(writer, text);
  }

  private drop(writer: WritableStreamDefaultWriter<Uint8Array>): void {
    this.clients.delete(writer);
    if (this.clients.size === 0 && this.ticker) {
      clearInterval(this.ticker);
      this.ticker = undefined;
    }
  }
}
