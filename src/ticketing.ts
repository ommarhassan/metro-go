import QRCode from 'qrcode';
import type { Route } from './metro';

export type Ticket = { id: string; name: string; from: string; to: string; fare: number; stops: number; exp: number; token: string; pay: string };
export type Verdict =
  | { ok: true; id: string; name: string; from: string; to: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used'; message: string };
export type TicketStatus = 'valid' | 'used' | 'expired';

// Demo only: a real system signs and verifies tickets on the server, never in the browser.
const SECRET = 'metrogo-demo-secret';
const enc = new TextEncoder();
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=')), c => c.charCodeAt(0));

// Pure-JS SHA-256/HMAC fallback: crypto.subtle only exists on https or localhost, so opening the app through a LAN IP would otherwise fail.
const K: number[] = []; const H0: number[] = [];
for (let n = 2, c = 0; c < 64; n++) {
  let prime = true; for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
  if (!prime) continue;
  if (c < 8) H0[c] = (Math.pow(n, 1 / 2) % 1) * 2 ** 32 | 0;
  K[c++] = (Math.pow(n, 1 / 3) % 1) * 2 ** 32 | 0;
}
function sha256(msg: Uint8Array): Uint8Array {
  const size = Math.ceil((msg.length + 9) / 64) * 64; const buf = new Uint8Array(size); buf.set(msg); buf[msg.length] = 0x80;
  const dv = new DataView(buf.buffer); dv.setUint32(size - 8, Math.floor(msg.length * 8 / 2 ** 32)); dv.setUint32(size - 4, (msg.length * 8) >>> 0);
  const h = H0.slice(); const w = new Int32Array(64);
  for (let o = 0; o < size; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getInt32(o + i * 4);
    for (let i = 16; i < 64; i++) { const x = w[i - 15], y = w[i - 2]; w[i] = (w[i - 16] + ((x >>> 7 | x << 25) ^ (x >>> 18 | x << 14) ^ (x >>> 3)) + w[i - 7] + ((y >>> 17 | y << 15) ^ (y >>> 19 | y << 13) ^ (y >>> 10))) | 0; }
    let [a, b, c, d, e, f, g, k] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (k + ((e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = (((a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, k].forEach((v, i) => { h[i] = (h[i] + v) | 0; });
  }
  const out = new Uint8Array(32); const ov = new DataView(out.buffer); h.forEach((v, i) => ov.setInt32(i * 4, v)); return out;
}
function hmacSha256(key: Uint8Array, msg: Uint8Array) {
  const k = new Uint8Array(64); k.set(key.length > 64 ? sha256(key) : key);
  const inner = new Uint8Array(64 + msg.length); inner.set(k.map(x => x ^ 0x36)); inner.set(msg, 64);
  const outer = new Uint8Array(96); outer.set(k.map(x => x ^ 0x5c)); outer.set(sha256(inner), 64);
  return sha256(outer);
}

export async function sign(body: string) {
  if (globalThis.crypto?.subtle) {
    const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return toB64(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body))));
  }
  return toB64(hmacSha256(enc.encode(SECRET), enc.encode(body)));
}
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), x => x.toString(16).padStart(2, '0')).join('').toUpperCase();

const read = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } };

export const loadTickets = () => read<Ticket[]>('metrogo.tickets', []);
const usedIds = () => read<string[]>('metrogo.used', []);
export const ticketStatus = (t: Ticket): TicketStatus => usedIds().includes(t.id) ? 'used' : t.exp < Date.now() ? 'expired' : 'valid';

export async function issueTicket(route: Route, name: string, pay: string): Promise<Ticket> {
  const id = 'MG-' + randomId();
  const exp = Date.now() + 2 * 60 * 60 * 1000;
  const from = route.names[0], to = route.names.at(-1)!;
  const body = toB64(enc.encode(JSON.stringify({ id, n: name, f: from, t: to, p: route.fare, e: exp })));
  const ticket: Ticket = { id, name, from, to, fare: route.fare, stops: route.stops, exp, pay, token: `${body}.${await sign(body)}` };
  write('metrogo.tickets', [ticket, ...loadTickets()]);
  return ticket;
}

export const qrImage = (token: string) => QRCode.toDataURL(`${location.origin}${location.pathname}?verify=${token}`, { errorCorrectionLevel: 'M', margin: 1, width: 280, color: { dark: '#194c3d', light: '#ffffff' } });

// The gate: checks the signature, then the expiry, then whether the code was already used.
export async function scanAtGate(token: string): Promise<Verdict> {
  const invalid: Verdict = { ok: false, reason: 'invalid', message: 'رمز غير صحيح أو متلاعب فيه' };
  const [body, sig] = token.trim().split('.');
  if (!body || !sig || (await sign(body)) !== sig) return invalid;
  let data: { id: string; n: string; f: string; t: string; e: number };
  try { data = JSON.parse(new TextDecoder().decode(fromB64(body))); } catch { return invalid; }
  if (data.e < Date.now()) return { ok: false, reason: 'expired', message: 'انتهت صلاحية التذكرة' };
  const used = usedIds();
  if (used.includes(data.id)) return { ok: false, reason: 'used', message: 'التذكرة اتستخدمت قبل كده' };
  write('metrogo.used', [...used, data.id]);
  return { ok: true, id: data.id, name: data.n, from: data.f, to: data.t };
}

export const tamper = (token: string) => token.slice(0, -4) + (token.endsWith('AAAA') ? 'BBBB' : 'AAAA');

// The QR holds a link, so a phone camera opens the gate result page; the in-app scanner unwraps it back to the raw token.
export const tokenFrom = (text: string) => { try { return new URL(text).searchParams.get('verify') ?? text; } catch { return text; } };
