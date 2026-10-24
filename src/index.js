import { Hono } from 'hono';
import QRCode from 'qrcode';
import * as U from './util.js';
import * as V from './views.js';
import { getVapid, sendPush } from './webpush.js';
import * as P from './private/index.js';   // 비공개 기능 (공개판에서는 비어 있음)

const app = new Hono();

// 설정은 wrangler.toml의 [vars]에서 옴
app.use('*', async (c, next) => {
  c.set('ctx', {
    serviceName: c.env.SERVICE_NAME || 'QR 주차번호판',
    orderUrl: c.env.ORDER_URL || '',          // 카드 주문 쇼핑몰 (비우면 주문 버튼 숨김)
    orderName: c.env.ORDER_NAME || '쇼핑몰',
    sourceUrl: c.env.SOURCE_URL || 'https://github.com/kiha797/parkcard',   // AGPL: 소스 코드 위치
    version: c.env.CF_VERSION_METADATA?.id || 'dev',   // 배포할 때마다 바뀜
  });
  await next();
});

// 열려 있는 화면이 새 배포를 알아채도록 현재 버전만 알려 줌
app.get('/version', (c) => {
  c.header('Cache-Control', 'no-store');
  return c.json({ v: c.get('ctx').version });
});

const db = (c) => c.env.DB;
const one = (c, sql, ...a) => db(c).prepare(sql).bind(...a).first();
const all = async (c, sql, ...a) => (await db(c).prepare(sql).bind(...a).all()).results;
const run = (c, sql, ...a) => db(c).prepare(sql).bind(...a).run();

// BASE_URL을 안 정하면 접속한 주소를 그대로 사용
const baseOf = (c) => (c.env.BASE_URL || new URL(c.req.url).origin).replace(/\/$/, '');
const qrSvg = (text, margin = 4) =>
  // 오류 복원 H(30%) + 여백 4칸: 흠집·반사·일부 가림에도 읽히도록
  QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'H', margin, color: { dark: '#000000', light: '#ffffff' } });

// 삭제 표시된 카드(deleted_at)는 없는 것처럼 — 관리자 화면에서만 보이고 복구 가능
const getPlate = (c, code) => one(c, 'SELECT * FROM plates WHERE code = ? AND deleted_at IS NULL', code);
const plateByToken = (c, token) => one(c, 'SELECT * FROM plates WHERE manage_token = ? AND deleted_at IS NULL', token);
const DELETED_KEEP_MS = 30 * 86400_000;
const getAlert = (c, id) => one(c, 'SELECT * FROM alerts WHERE id = ?', id);
const deviceCount = async (c, code) => (await one(c, 'SELECT COUNT(*) n FROM subscriptions WHERE code = ?', code)).n;

// windowMs 안에 max번을 넘으면 false. 여러 서버에서 공유되도록 DB에 기록
async function allow(c, key, max, windowMs) {
  const now = Date.now();
  const r = await one(c, 'SELECT COUNT(*) n FROM hits WHERE key = ? AND at > ?', key, now - windowMs);
  if (r.n >= max) return false;
  await run(c, 'INSERT INTO hits (key, at) VALUES (?, ?)', key, now);
  return true;
}
const ipKey = async (c) => (await U.sha256hex(c.req.header('CF-Connecting-IP') || 'local')).slice(0, 16);

// 같은 사람이 같은 카드에 다시 보낼 수 있을 때까지의 간격
const RESEND_MS = 20_000;
const resendKey = async (c, code) => `a:${await ipKey(c)}:${code}`;
// 다시 보낼 수 있을 때까지 남은 초 (0이면 바로 가능)
async function waitLeft(c, key) {
  const r = await one(c, 'SELECT MAX(at) m FROM hits WHERE key = ?', key);
  return r.m ? Math.max(0, Math.ceil((r.m + RESEND_MS - Date.now()) / 1000)) : 0;
}

// 구독 목록에 푸시를 보내고 성공 수와 실패 이유를 돌려줌. 만료된 구독(404/410)은 table에서 정리
async function pushTo(c, subs, payload, table) {
  const vapid = await getVapid(db(c));
  const subject = c.env.VAPID_SUBJECT || 'mailto:parking-alert@example.com';
  const errors = [];
  const results = await Promise.all(subs.map(async (s) => {
    const host = new URL(s.endpoint).host;
    try {
      const res = await sendPush(s, payload, vapid, subject);
      if (res.ok) return true;
      const text = (await res.text()).slice(0, 200);
      errors.push(`${host} ${res.status} ${text}`);
      console.error('[push] 실패', host, res.status, text);
      if (res.status === 404 || res.status === 410) await run(c, `DELETE FROM ${table} WHERE endpoint = ?`, s.endpoint);
      return false;
    } catch (e) {
      errors.push(`${host} ${e.message}`);
      console.error('[push] 오류', host, e);
      return false;
    }
  }));
  return { delivered: results.filter(Boolean).length, error: errors.join(' | ') || (subs.length ? null : 'no devices') };
}

// 차주 기기들로
const pushToPlate = async (c, code, payload) =>
  pushTo(c, await all(c, 'SELECT * FROM subscriptions WHERE code = ?', code), payload, 'subscriptions');

const validSub = (sub) => sub && typeof sub.endpoint === 'string' && /^https:\/\//.test(sub.endpoint) && sub.keys?.p256dh && sub.keys?.auth;

const html = (c, body, status = 200) => c.html(body, status);

// ───────── 연락하는 사람 ─────────

app.get('/', (c) => html(c, V.home(c.get('ctx'))));
app.get('/about', (c) => html(c, V.about(c.get('ctx'))));

app.get('/go', async (c) => {
  const code = U.normalizeCode(c.req.query('code'));
  if (!(await getPlate(c, code))) return html(c, V.home(c.get('ctx'), { error: `'${code}' 코드를 찾을 수 없어요` }), 404);
  return c.redirect(`/c/${code}`);
});

// QR 주소: /C/ABC123 (대소문자 무관)
app.get('/:c{[cC]}/:code', async (c) => {
  const raw = c.req.param('code');
  const code = U.normalizeCode(raw);
  if (code !== raw || c.req.param('c') !== 'c') return c.redirect(`/c/${code}`);
  const plate = await getPlate(c, code);
  if (!plate) return html(c, V.notFound(c.get('ctx')), 404);
  return html(c, V.contact(c.get('ctx'), plate, {
    quiet: U.inQuietHours(plate.quiet_start, plate.quiet_end),
    devices: await deviceCount(c, code),
    vapidKey: (await getVapid(db(c))).publicKey,
    error: V.SEND_ERRORS[c.req.query('e')],
    wait: await waitLeft(c, await resendKey(c, code)),
  }));
});

// 화면 안에서 보내면(fetch) JSON으로, 스크립트가 없으면 예전처럼 페이지 이동
app.post('/c/:code/alert', async (c) => {
  const plate = await getPlate(c, U.normalizeCode(c.req.param('code')));
  if (!plate) return html(c, V.notFound(c.get('ctx')), 404);
  const back = `/c/${plate.code}`;
  const body = await c.req.parseBody();
  const inPage = c.req.header('X-Requested-With') === 'fetch';
  const fail = (e, extra = {}) => (inPage ? c.json({ ok: false, error: V.SEND_ERRORS[e], ...extra }) : c.redirect(`${back}?e=${e}`));

  if (!plate.nickname) return fail('setup');
  const urgent = body.urgent === '1';
  if (U.inQuietHours(plate.quiet_start, plate.quiet_end) && !urgent) return fail('urgent');
  // 같은 사람: 20초에 1번 / 차량 전체: 1시간에 10번
  const key = await resendKey(c, plate.code);
  if (!(await allow(c, key, 1, RESEND_MS))) return fail('rate', { wait: await waitLeft(c, key) });
  // 장난 방지: 차주가 응답하지 않은 연락만 센다 (응답을 주고받는 대화는 막지 않음)
  const unanswered = await one(c, "SELECT COUNT(*) n FROM alerts WHERE code = ? AND created_at > ? AND status != 'ack'",
    plate.code, Date.now() - 3600_000);
  if (unanswered.n >= 10) return fail('busy');

  // 직접 입력 칸에 쓴 내용이 있으면 그 내용, 없으면 고른 문장
  const custom = String(body.custom || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const message = custom || V.TEMPLATES[Number(body.tpl)] || V.TEMPLATES[0];

  const alert = { id: U.randomToken(9), owner_key: U.randomToken(9) };
  await run(c, 'INSERT INTO alerts (id, owner_key, code, message, urgent, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    alert.id, alert.owner_key, plate.code, message, urgent ? 1 : 0, Date.now());

  const { delivered, error } = await pushToPlate(c, plate.code, {
    title: `${urgent ? '🚨 [긴급] ' : '🚗 '}${plate.nickname ? `${plate.nickname} 차량` : '내 차'} 연락이 왔어요`,
    body: `"${message}" — 눌러서 답하기`,
    message,
    url: `/r/${alert.id}/${alert.owner_key}`,
    tag: alert.id,
  });
  if (!delivered) await run(c, "UPDATE alerts SET status = 'failed', error = ? WHERE id = ?", error, alert.id);
  if (!inPage) return c.redirect(`/a/${alert.id}`);
  const status = delivered ? 'sent' : 'failed';
  return c.json({ ok: true, id: alert.id, status, message, html: V.statusInner({ status }), wait: RESEND_MS / 1000 });
});

app.get('/a/:id', async (c) => {
  const alert = await getAlert(c, c.req.param('id'));
  if (!alert) return html(c, V.notFound(c.get('ctx'), '알림을 찾을 수 없어요'), 404);
  return html(c, V.alertStatus(c.get('ctx'), alert, await getPlate(c, alert.code), {
    wait: await waitLeft(c, await resendKey(c, alert.code)),
  }));
});

app.get('/api/a/:id', async (c) => {
  const alert = await getAlert(c, c.req.param('id'));
  if (!alert) return c.json({}, 404);
  c.header('Cache-Control', 'no-store');
  return c.json({
    status: alert.status, html: V.statusInner(alert),
    code: alert.code, message: alert.message, created_at: alert.created_at,
    ack_text: alert.ack_text, ack_at: alert.ack_at, seen_at: alert.seen_at, done_at: alert.done_at,
  });
});

// 연락한 사람: '응답 오면 휴대폰 알림으로 받기' (연락 1건 단위)
app.post('/a/:id/subscribe', async (c) => {
  const alert = await getAlert(c, c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  if (!alert || !validSub(body.sub)) return c.json({ ok: false }, 400);
  const n = (await one(c, 'SELECT COUNT(*) n FROM reply_subs WHERE alert_id = ?', alert.id)).n;
  if (n >= 3) return c.json({ ok: true });
  await run(c, `INSERT INTO reply_subs (alert_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(alert_id, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
  alert.id, body.sub.endpoint, body.sub.keys.p256dh, body.sub.keys.auth, Date.now());
  return c.json({ ok: true });
});

// ───────── 차주 응답 (푸시 알림을 누르면 열림) ─────────

// 알림이 있고 열쇠가 맞고, 카드가 삭제되지 않았을 때만
async function ownerAlert(c) {
  const alert = await getAlert(c, c.req.param('id'));
  if (!alert || alert.owner_key !== c.req.param('key')) return null;
  const plate = await getPlate(c, alert.code);
  return plate ? { alert, plate } : null;
}

app.get('/r/:id/:key', async (c) => {
  const found = await ownerAlert(c);
  if (!found) return html(c, V.notFound(c.get('ctx'), '알림을 찾을 수 없어요'), 404);
  // 차주가 알림을 열어 봤다는 표시 → 연락한 사람 화면에 '차주 확인' 단계
  if (!found.alert.seen_at) {
    found.alert.seen_at = Date.now();
    await run(c, 'UPDATE alerts SET seen_at = ? WHERE id = ? AND seen_at IS NULL', found.alert.seen_at, found.alert.id);
  }
  return html(c, V.ownerReply(c.get('ctx'), found.alert, found.plate));
});

app.post('/r/:id/:key', async (c) => {
  const found = await ownerAlert(c);
  if (!found) return html(c, V.notFound(c.get('ctx'), '알림을 찾을 수 없어요'), 404);
  const { alert, plate } = found;
  const body = await c.req.parseBody();
  // '차를 이동했어요' (응답 뒤에만)
  if (body.done === '1' && alert.status === 'ack' && !alert.done_at) {
    await run(c, 'UPDATE alerts SET done_at = ? WHERE id = ?', Date.now(), alert.id);
  }
  const text = alert.status === 'ack' ? null : V.REPLIES[Number(body.r)];
  if (text) {
    await run(c, "UPDATE alerts SET status = 'ack', ack_text = ?, ack_at = ? WHERE id = ?", text, Date.now(), alert.id);
    // 연락한 사람이 알림을 허용해 뒀으면 휴대폰 알림창으로 응답 전달 (1회 사용 후 삭제)
    const subs = await all(c, 'SELECT * FROM reply_subs WHERE alert_id = ?', alert.id);
    if (subs.length) {
      await pushTo(c, subs, {
        title: `✅ 차주 응답: ${text}`,
        body: `${plate.nickname ? `${plate.nickname} 차량 · ` : ''}보낸 내용 "${alert.message}"`,
        url: `/c/${alert.code}`,
        tag: `reply-${alert.id}`,
        kind: 'reply',
      }, 'reply_subs');
      await run(c, 'DELETE FROM reply_subs WHERE alert_id = ?', alert.id);
    }
  }
  return html(c, V.ownerReply(c.get('ctx'), await getAlert(c, alert.id), plate));
});

// ───────── 카드 만들기 ─────────

app.get('/new', async (c) => html(c, V.newPlate(c.get('ctx'), { vapidKey: (await getVapid(db(c))).publicKey })));

const PLATE_ERROR = '차량 번호 뒷 4자리를 숫자로 입력해 주세요.';

// 화면 안에서 만들면(fetch) JSON으로 → 만들기 버튼을 누른 순간 알림 허용까지 한 번에 처리
app.post('/new', async (c) => {
  const body = await c.req.parseBody();
  const inPage = c.req.header('X-Requested-With') === 'fetch';
  const fail = async (error, status) => (inPage ? c.json({ ok: false, error }, status)
    : html(c, V.newPlate(c.get('ctx'), { error, vapidKey: (await getVapid(db(c))).publicKey }), status));
  const nickname = U.plateDigits(body.nickname);
  if (!nickname) return fail(PLATE_ERROR, 400);
  if (!(await allow(c, `new:${await ipKey(c)}`, 10, 3600_000))) return fail('잠시 후 다시 시도해 주세요.', 429);
  const token = U.randomToken();
  let code;
  // 삭제 표시된 카드의 코드와도 겹치지 않게
  do code = U.randomCode(); while (await one(c, 'SELECT 1 FROM plates WHERE code = ?', code));
  await run(c, 'INSERT INTO plates (code, manage_token, nickname, created_at) VALUES (?, ?, ?, ?)', code, token, nickname, Date.now());
  return inPage ? c.json({ ok: true, token, code }) : c.redirect(`/m/${token}?created=1`);
});

// ───────── 차주 관리 (관리 링크 = 열쇠) ─────────

const keyMissing = (c) => html(c, V.notFound(c.get('ctx'), '관리 링크가 맞지 않거나 삭제된 카드예요'), 404);

// 설치한 앱의 시작 주소: 카드가 살아 있으면 그 카드로, 없어졌으면 이 휴대폰에 저장된 내 카드로
app.get('/my', async (c) => {
  const token = c.req.query('c');
  if (token && (await plateByToken(c, token))) return c.redirect(`/m/${token}`);
  return html(c, V.myCards(c.get('ctx'), { bad: token, missing: !!token }));
});

app.get('/m/:token', async (c) => {
  const plate = await plateByToken(c, c.req.param('token'));
  if (!plate) return html(c, V.myCards(c.get('ctx'), { bad: c.req.param('token'), missing: true }), 404);
  const error = c.req.query('e') === 'plate' ? PLATE_ERROR : null;
  // 차량 번호가 없으면 번호부터 입력 (다른 기능은 막음)
  if (!plate.nickname) return html(c, V.plateRequired(c.get('ctx'), plate, { error }));
  const manageUrl = `${baseOf(c)}/m/${plate.manage_token}`;
  return html(c, V.manage(c.get('ctx'), plate, {
    error,
    alerts: await all(c, 'SELECT * FROM alerts WHERE code = ? ORDER BY created_at DESC LIMIT 20', plate.code),
    devices: await all(c, 'SELECT id, device, created_at FROM subscriptions WHERE code = ? ORDER BY id', plate.code),
    vapidKey: (await getVapid(db(c))).publicKey,
    manageUrl,
    qrSvg: await qrSvg(manageUrl, 2),
    saved: c.req.query('saved') === '1',
    created: c.req.query('created') === '1',
  }));
});

// 홈 화면에 추가하면 이 관리 화면이 앱처럼 열리도록
app.get('/m/:token/manifest.webmanifest', async (c) => {
  const plate = await plateByToken(c, c.req.param('token'));
  if (!plate) return c.body(null, 404);
  const name = c.get('ctx').serviceName;
  c.header('Content-Type', 'application/manifest+json');
  return c.body(JSON.stringify({
    id: `/m/${plate.manage_token}`,
    name: `${name} ${plate.code}`,
    short_name: name,
    start_url: `/my?c=${plate.manage_token}`,
    scope: '/',
    display: 'standalone',
    background_color: '#f3f4f6',
    theme_color: '#2563eb',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }));
});

app.post('/m/:token/subscribe', async (c) => {
  const plate = await plateByToken(c, c.req.param('token'));
  const body = await c.req.json().catch(() => ({}));
  const sub = body.sub;
  if (!plate || !validSub(sub)) return c.json({ ok: false }, 400);
  if ((await deviceCount(c, plate.code)) >= 10) return c.json({ ok: false, error: 'too many devices' }, 400);
  await run(c, `INSERT INTO subscriptions (code, endpoint, p256dh, auth, device, created_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(code, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
  plate.code, sub.endpoint, sub.keys.p256dh, sub.keys.auth, String(body.device || '').slice(0, 40), Date.now());
  return c.json({ ok: true });
});

app.post('/m/:token/unsubscribe', async (c) => {
  const plate = await plateByToken(c, c.req.param('token'));
  if (!plate) return c.json({ ok: false }, 404);
  const body = await c.req.json().catch(() => ({}));
  await run(c, 'DELETE FROM subscriptions WHERE code = ? AND endpoint = ?', plate.code, String(body.endpoint || ''));
  return c.json({ ok: true });
});

app.post('/m/:token/test', async (c) => {
  const plate = await plateByToken(c, c.req.param('token'));
  if (!plate) return c.json({ ok: false }, 404);
  if (!(await allow(c, `test:${plate.code}`, 5, 60_000))) return c.json({ ok: false, delivered: 0 });
  const { delivered, error } = await pushToPlate(c, plate.code, {
    title: '🔔 테스트 알림',
    body: '이렇게 알림이 옵니다. 누르면 관리 화면이 열려요.',
    message: '테스트 알림이에요',
    url: `/m/${plate.manage_token}`,
    tag: 'test',
  });
  return c.json({ ok: true, delivered, error });
});

app.post('/m/:token/devices/:id/delete', async (c) => {
  const plate = await plateByToken(c, c.req.param('token'));
  if (!plate) return keyMissing(c);
  await run(c, 'DELETE FROM subscriptions WHERE code = ? AND id = ?', plate.code, Number(c.req.param('id')));
  return c.redirect(`/m/${plate.manage_token}`);
});

app.post('/m/:token/settings', async (c) => {
  const plate = await plateByToken(c, c.req.param('token'));
  if (!plate) return keyMissing(c);
  const body = await c.req.parseBody();
  const nickname = U.plateDigits(body.nickname);
  if (!nickname) return c.redirect(`/m/${plate.manage_token}?e=plate`);
  // 방해 금지 칸이 없는 폼(차량 번호 입력 화면)에서 오면 기존 값 유지
  const hour = (v, old) => (v === undefined ? old : v === '' ? null : Math.min(23, Math.max(0, Number(v) | 0)));
  await run(c, 'UPDATE plates SET nickname = ?, quiet_start = ?, quiet_end = ? WHERE code = ?',
    nickname, hour(body.quiet_start, plate.quiet_start), hour(body.quiet_end, plate.quiet_end), plate.code);
  return c.redirect(`/m/${plate.manage_token}?saved=1`);
});

app.get('/m/:token/print', async (c) => {
  const plate = await plateByToken(c, c.req.param('token'));
  if (!plate) return keyMissing(c);
  if (!plate.nickname) return c.redirect(`/m/${plate.manage_token}`);
  return printPage(c, plate, true);
});

// 쇼핑몰 주문 인쇄용 (카드 코드만으로, 관리 열쇠·전화 번호 없이). 카드형만
app.get('/card/:code', async (c) => {
  if (!P.cardFront) return html(c, V.notFound(c.get('ctx'), '페이지를 찾을 수 없어요'), 404);
  const plate = await getPlate(c, U.normalizeCode(c.req.param('code')));
  if (!plate) return html(c, V.notFound(c.get('ctx')), 404);
  return printPage(c, plate, false);
});

async function printPage(c, plate, owner) {
  let url = `${baseOf(c)}/C/${plate.code}`;
  if (c.env.QR_UPPERCASE !== 'false') url = url.toUpperCase();
  const layouts = P.cardFront ? ['big', 'sticker', 'card'] : ['big', 'sticker'];
  const layout = owner ? (layouts.includes(c.req.query('layout')) ? c.req.query('layout') : 'big') : 'card';
  const theme = P.CARD_THEMES?.[c.req.query('theme')] ? c.req.query('theme') : 'white';
  return html(c, V.print(c.get('ctx'), plate, {
    qrSvg: await qrSvg(url), qrUrl: url, host: new URL(baseOf(c)).host, layout, theme, owner,
  }));
}

app.post('/m/:token/delete', async (c) => {
  const plate = await plateByToken(c, c.req.param('token'));
  if (!plate) return keyMissing(c);
  await run(c, 'UPDATE plates SET deleted_at = ? WHERE code = ?', Date.now(), plate.code);
  return html(c, V.simple(c.get('ctx'), '카드를 삭제했어요',
    '출력한 QR로는 더 이상 연락이 오지 않아요. 30일 뒤 모든 정보가 완전히 지워져요.', { href: '/', label: '처음으로' }));
});

// 관리자 화면 (비밀번호: Cloudflare 비밀 값 ADMIN_PASSWORD)
if (P.adminRoutes) app.route('/admin', P.adminRoutes({ one, all, run, allow, ipKey, keepMs: DELETED_KEEP_MS }));

// 짧은 주소: park.labelpos.com/A7K2Q9 — QR이 안 될 때 주소창에 직접 입력 (대소문자 무관)
app.get('/:code{[A-Za-z0-9]{6}}', async (c) => {
  const code = U.normalizeCode(c.req.param('code'));
  if (!(await getPlate(c, code))) return html(c, V.home(c.get('ctx'), { error: `'${code}' 코드를 찾을 수 없어요` }), 404);
  return c.redirect(`/c/${code}`);
});

app.notFound((c) => html(c, V.notFound(c.get('ctx') || { serviceName: 'QR 주차번호판' }, '페이지를 찾을 수 없어요'), 404));

export default {
  fetch: app.fetch,
  // 매일: 90일 지난 알림, 하루 지난 전송 제한 기록 정리
  async scheduled(event, env) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM alerts WHERE created_at < ?').bind(Date.now() - 90 * 86400_000),
      env.DB.prepare('DELETE FROM hits WHERE at < ?').bind(Date.now() - 86400_000),
      env.DB.prepare('DELETE FROM reply_subs WHERE created_at < ?').bind(Date.now() - 86400_000),
    ]);
    // 삭제 후 30일 지난 카드는 관련 정보까지 완전 삭제
    const cut = Date.now() - DELETED_KEEP_MS;
    const gone = 'SELECT code FROM plates WHERE deleted_at IS NOT NULL AND deleted_at < ?';
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM reply_subs WHERE alert_id IN (SELECT id FROM alerts WHERE code IN (${gone}))`).bind(cut),
      env.DB.prepare(`DELETE FROM subscriptions WHERE code IN (${gone})`).bind(cut),
      env.DB.prepare(`DELETE FROM alerts WHERE code IN (${gone})`).bind(cut),
      env.DB.prepare('DELETE FROM plates WHERE deleted_at IS NOT NULL AND deleted_at < ?').bind(cut),
    ]);
  },
};
