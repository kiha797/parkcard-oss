// 웹 푸시 발송 — 외부 라이브러리 없이 WebCrypto로 구현 (Workers에서 동작)
//   VAPID 인증: RFC 8292 / 내용 암호화(aes128gcm): RFC 8291, RFC 8188
import { b64url, fromB64url } from './util.js';

const enc = new TextEncoder();
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// VAPID 키는 처음 쓸 때 만들어 DB에 저장. 설치하는 사람이 따로 준비할 것 없음
let cached;
export async function getVapid(db) {
  if (cached) return cached;
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'vapid'").first();
  if (row) return (cached = JSON.parse(row.value));
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const keys = {
    jwk: await crypto.subtle.exportKey('jwk', kp.privateKey),
    publicKey: b64url(await crypto.subtle.exportKey('raw', kp.publicKey)),
  };
  // 동시에 두 요청이 만들었을 때를 대비해 먼저 저장된 쪽을 사용
  await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('vapid', ?)").bind(JSON.stringify(keys)).run();
  const saved = await db.prepare("SELECT value FROM settings WHERE key = 'vapid'").first();
  return (cached = JSON.parse(saved.value));
}

async function vapidAuth(endpoint, vapid, subject) {
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  })));
  const key = await crypto.subtle.importKey('jwk', vapid.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // WebCrypto 서명은 이미 JWT가 요구하는 r||s 64바이트 형식
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${vapid.publicKey}`;
}

export async function encryptPayload(plaintext, p256dh, authSecret) {
  const uaPublic = fromB64url(p256dh);
  const auth = fromB64url(authSecret);

  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  // RFC 8291 §3.4
  const prkKey = await hmac(auth, ecdh);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  // 레코드 1개: 내용 + 마지막 레코드 표시(0x02)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(plaintext), new Uint8Array([2]))));

  // RFC 8188 헤더: salt(16) | 레코드 크기(4) | 키 길이(1) | 보내는 쪽 공개키(65)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

// 구독 1개로 보냄. fetch Response를 돌려줌 (404/410이면 만료된 구독)
export async function sendPush(sub, payload, vapid, subject) {
  const body = await encryptPayload(JSON.stringify(payload), sub.p256dh, sub.auth);
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(sub.endpoint, vapid, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '600',
      Urgency: 'high',
    },
    body,
  });
}
