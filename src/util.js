// 0/O, 1/I 처럼 헷갈리는 글자를 뺀 32자 — 사람이 눈으로 읽고 입력하기 쉬움
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function randomCode(len = 6) {
  let s = '';
  for (const b of crypto.getRandomValues(new Uint8Array(len))) s += ALPHABET[b % 32];
  return s;
}

export const randomToken = (bytes = 18) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

export function b64url(buf) {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad), (c) => c.charCodeAt(0));
}

export async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 차량 번호 뒷 4자리: 숫자만 남겨 4자리일 때만 저장 (전체 번호를 넣어도 끝 4자리만)
export function plateDigits(s) {
  const d = String(s || '').replace(/\D/g, '');
  return d.length >= 4 ? d.slice(-4) : null;
}

export function normalizeCode(s) {
  return String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function kstHour(now = Date.now()) {
  return new Date(now + 9 * 3600 * 1000).getUTCHours();
}

export function kstString(ts) {
  if (!ts) return '';
  const d = new Date(ts + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function inQuietHours(start, end, hour = kstHour()) {
  if (start == null || end == null || start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
