import { esc, kstString, inQuietHours } from './util.js';
import * as P from './private/index.js';

export const TEMPLATES = [
  '차량 이동 부탁드려요 🙏',
  '출차해야 해서 잠시 빼주세요',
  '라이트가 켜져 있어요',
  '창문이 열려 있어요',
  '차량에 접촉/문제가 생겼어요',
];

// 차주 응답 문구 (DB에는 문구 그대로 저장). "N분"이 들어 있으면 연락한 사람 화면에 도착 예정 시간을 보여 줌
export const REPLIES = ['지금 바로 갈게요', '5분 안에 갈게요', '10분 안에 갈게요', '30분 정도 걸려요', '지금은 이동이 어려워요', '알려주셔서 감사해요'];

// 서비스 설명(일반 명칭). 운영 사이트는 브랜드 이름 옆에 함께 표시
export const GENERIC_NAME = 'QR 주차번호판';

export function layout(ctx, title, body, { head = '', scripts = '' } = {}) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#2563eb">
<meta name="app-version" content="${esc(ctx.version)}">
<meta name="application-name" content="${esc(ctx.serviceName)}">
<title>${esc(title)} · ${esc(ctx.serviceName)}</title>
<link rel="icon" href="/icon-192.png"><link rel="apple-touch-icon" href="/icon-192.png">
<link rel="stylesheet" href="/style.css">${head}</head>
<body><main>
<header class="top"><a href="/" class="logo">🚗 ${esc(ctx.serviceName)}${ctx.serviceName === GENERIC_NAME ? '' : ` <span class="logo-sub">${GENERIC_NAME}</span>`}</a></header>
${body}
<footer><a href="/about">이 서비스는?</a>${ctx.sourceUrl ? ` · <a href="${esc(ctx.sourceUrl)}" target="_blank" rel="noopener">소스 코드</a>` : ''}</footer>
</main>${scripts}<script src="/update.js"></script></body></html>`;
}

export const flash = (msg, kind = 'err') => (msg ? `<div class="flash ${kind}">${esc(msg)}</div>` : '');

// 차량 번호 뒷 4자리 (숫자만). 휴대폰에서 숫자 키패드가 뜨도록.
// 전체 번호(12가3456)를 붙여 넣어도 뒷 4자리만 남김
const plateInput = (value) => `<input name="nickname" inputmode="numeric" pattern="[0-9]{4}" required
  autocomplete="off" placeholder="예: 1234" title="숫자 4자리" class="plate-input"
  oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(-4)" value="${esc(value)}">`;

// 카드 오른쪽 위 작은 전화기 아이콘. 서버는 번호를 모름:
// 차주가 자기 휴대폰에서 출력한 QR의 # 뒷부분(서버로 전송되지 않음)에 번호가 있으면 contact.js가 보여 줌
const callButton = () => `
<a class="call-corner" id="call-corner" hidden aria-label="차주에게 전화하기" title="차주에게 전화하기">
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>
  </svg>
</a>`;

// 쇼핑몰 카드 주문 안내 (ORDER_URL이 설정된 경우만). 쇼핑몰에는 6자리 카드 코드만 전달
const orderBox = (ctx, code) => (ctx.orderUrl ? `
<div class="order-box">
  <b>🪪 카드로 주문하기</b>
  <p class="muted small">튼튼한 카드형 QR 주차번호판으로 받아 보세요. 주문할 때 아래 <b>카드 코드</b>를 적어 주세요.
    전화번호·차량 번호는 전달되지 않아요.</p>
  <div class="order-code"><span class="mono">${esc(code)}</span>
    <button type="button" class="btn small" data-copy="${esc(code)}">코드 복사</button></div>
  <a class="btn primary" href="${esc(ctx.orderUrl)}" target="_blank" rel="noopener">${esc(ctx.orderName)}에서 주문하기</a>
</div>` : '');

const carBadge = (digits, fallback) => (digits
  ? `<div class="muted small">차량 번호 뒷자리</div><div class="car plate-no">${esc(digits)}</div>`
  : `<div class="car">${esc(fallback)}</div>`);

export function home(ctx, { error } = {}) {
  return layout(ctx, '주차 연락', `
<section class="card" id="my-cards" data-mode="home" hidden></section>
<section class="card">
  <h1>차주에게 연락하기</h1>
  <p class="muted">QR이 안 찍히면 차에 놓인 카드의 <b>6자리 코드</b>를 입력하세요.</p>
  ${flash(error)}
  <form method="get" action="/go" class="codeform">
    <input name="code" maxlength="8" autocomplete="off" autocapitalize="characters"
      placeholder="예: A7K2Q9" required class="codeinput">
    <button class="btn primary">연락 화면 열기</button>
  </form>
</section>
<section class="card">
  <h2>내 주차 연락 카드 만들기</h2>
  <p class="muted">전화번호 없이, 휴대폰 <b>푸시 알림</b>으로만 연락받아요. 무료이고 직접 출력해서 씁니다.</p>
  <a class="btn primary" href="/new">내 카드 만들기</a>
</section>`, { scripts: '<script src="/mycards.js"></script>' });
}

// 관리 링크가 없어진 카드를 가리킬 때 / 앱이 카드 없이 열렸을 때: 이 휴대폰에 저장된 내 카드로
export function myCards(ctx, { bad, missing } = {}) {
  return layout(ctx, '내 카드', `
${missing ? `<section class="card"><h1>이 카드는 삭제되었거나 주소가 맞지 않아요</h1>
  <p class="muted">이 휴대폰에 저장된 내 카드가 있으면 바로 열어 드려요.</p></section>` : ''}
<section class="card" id="my-cards" data-mode="${missing ? 'missing' : 'my'}" data-bad="${esc(bad || '')}">
  <p class="muted">내 카드를 찾는 중…</p>
</section>`, { scripts: '<script src="/mycards.js"></script>' });
}

export function notFound(ctx, msg = '찾을 수 없는 코드입니다') {
  return layout(ctx, '없음', `<section class="card"><h1>${esc(msg)}</h1>
  <p class="muted">코드를 다시 확인해 주세요. 헷갈리는 0/O, 1/I 는 코드에 쓰이지 않아요.</p>
  <a class="btn" href="/">처음으로</a></section>`);
}

export const SEND_ERRORS = {
  rate: '방금 알림을 보냈어요. 잠시 뒤에 다시 보낼 수 있어요.',
  busy: '차주가 아직 확인하지 않은 알림이 많아요. 잠시 후 다시 시도해 주세요.',
  urgent: '방해 금지 시간이에요. 급한 경우 체크 후 보내 주세요.',
  setup: '차주가 아직 등록을 마치지 않아서 연락할 수 없어요.',
};

export function contact(ctx, plate, { quiet, error, devices, wait = 0, vapidKey = '' } = {}) {
  const radios = TEMPLATES.map((t, i) => `
    <label class="choice"><input type="radio" name="tpl" value="${i}" ${i === 0 ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('');
  return layout(ctx, '차주에게 알림', `
<section class="card hero hero-compact">
  ${plate.nickname ? callButton() : ''}
  ${carBadge(plate.nickname, '이 차량')}
  <p class="muted small">🔒 차주에게 알림만 가요 · 서로 연락처는 비공개</p>
</section>
${!plate.nickname ? `<div class="flash err">아직 등록되지 않은 카드라 연락할 수 없어요.${plate.batch_id ? '<br><small>차주이신가요? 카드와 함께 받은 <b>🔑 차주 등록 카드</b>의 QR을 찍어 등록해 주세요.</small>' : ''}</div>`
    : devices ? '' : `<div class="flash err" id="no-devices">차주가 아직 알림을 켜지 않아서 연락할 수 없어요.</div>`}
<section class="card" id="result" hidden>
  <div class="latest-ack" hidden></div>
  <div class="current"></div>
  <div class="notify-box" hidden></div>
</section>
<form method="post" action="/c/${esc(plate.code)}/alert" class="card" id="alert-form" data-wait="${wait}" data-key="${esc(vapidKey)}">
  <h2>어떤 일인가요?</h2>
  <div class="choices chips">${radios}</div>
  <textarea name="custom" maxlength="60" rows="1" placeholder="✏️ 직접 입력 (60자 이내)"></textarea>
  ${quiet ? `<div class="flash warn">차주가 지금 <b>방해 금지 시간</b>으로 설정해 두었어요.<br>
    <label class="inline"><input type="checkbox" name="urgent" value="1"> 급한 상황이라 그래도 보낼게요</label></div>` : ''}
  <div class="form-msg">${flash(error)}</div>
  <div class="send-bar">
    <button class="btn primary big send-btn" ${devices && plate.nickname ? '' : 'disabled'} data-label="🔔 차주에게 알림 보내기">🔔 차주에게 알림 보내기</button>
    <p class="muted small center">응답이 오면 이 화면에 소리와 함께 떠요</p>
  </div>
</form>
<section class="card" id="history" hidden>
  <details><summary>🕘 이전 연락 <span class="history-n"></span>건</summary><div class="sent-list"></div></details>
</section>`, { scripts: '<script src="/sound.js"></script><script src="/contact.js"></script>' });
}

export function alertStatus(ctx, alert, plate, { wait = 0 } = {}) {
  return layout(ctx, '알림 보냄', `
<section class="card hero">
  <div class="big-emoji">📨</div>
  <h1>${alert.status === 'failed' ? '알림을 보내지 못했어요' : '차주에게 알림을 보냈어요'}</h1>
  <p class="muted">"${esc(alert.message)}"</p>
</section>
<section class="card" id="status" data-id="${esc(alert.id)}" data-status="${esc(alert.status)}">${statusInner(alert)}</section>
<section class="card"><button type="button" class="btn resend-btn" data-href="/c/${esc(plate.code)}" data-wait="${wait}"
  data-label="다른 내용으로 다시 보내기">다른 내용으로 다시 보내기</button></section>`, { scripts: '<script src="/sound.js"></script><script src="/contact.js"></script>' });
}

export function statusInner(alert) {
  if (alert.status === 'ack') {
    return `<div class="ack">✅ 차주 응답: <b>${esc(alert.ack_text)}</b></div>
      <p class="muted">${kstString(alert.ack_at)} 응답</p>`;
  }
  if (alert.status === 'failed') {
    return `<div class="flash err">차주 휴대폰에 알림이 전달되지 않았어요. 잠시 후 다시 시도하거나 관리사무소에 문의해 주세요.</div>`;
  }
  return `<div class="waiting"><span class="dot"></span> 차주의 응답을 기다리는 중…</div>
    <p class="muted">이 화면을 열어 두면 응답이 오는 즉시 표시됩니다.</p>`;
}

export function ownerReply(ctx, alert, plate) {
  const buttons = REPLIES.map((r, i) =>
    `<button name="r" value="${i}" class="btn ${i === 0 ? 'primary' : ''}">${esc(r)}</button>`).join('');
  const ago = Math.max(0, Math.round((Date.now() - alert.created_at) / 60000));
  const answered = alert.status === 'ack';
  return layout(ctx, '알림 응답', `
<section class="card hero">
  ${carBadge(plate.nickname, '내 차량')}
  <p>받은 요청: <b>"${esc(alert.message)}"</b></p>
  <p class="muted">${kstString(alert.created_at)} · <b>${ago ? `${ago}분 전` : '방금'}</b> 요청${alert.urgent ? ' · 🚨 긴급' : ''}</p>
</section>
${answered ? `<section class="card"><div class="ack">✅ 보낸 응답: <b>${esc(alert.ack_text)}</b></div>
  <p class="muted">요청한 분 화면에 바로 표시돼요.</p></section>`
    : `<form method="post" class="card stack">
  <h2>요청한 분에게 답하기</h2>
  ${buttons}
</form>`}
<section class="card"><a class="btn" href="/m/${esc(plate.manage_token)}">내 카드 설정</a></section>`);
}

export function newPlate(ctx, { error, vapidKey = '' } = {}) {
  return layout(ctx, '내 카드 만들기', `
<section class="card">
  <h1>내 주차 연락 카드 만들기</h1>
  <ul class="steps">
    <li><b>전화번호를 받지 않아요.</b> 알림은 이 휴대폰의 푸시로만 받아요.</li>
    <li><b>만들기</b>를 누르면 알림 허용 창이 떠요. <b>허용</b>을 누르면 알림이 바로 켜져요.</li>
    <li>알림을 받을 <b>휴대폰에서</b> 만드는 게 가장 편해요.</li>
    <li>만들기는 안드로이드는 <b>Chrome</b>, 아이폰은 <b>Safari</b>에서 진행돼요. 다른 앱에서 열면 자동으로 넘어가요.
      연락하는 사람은 어떤 앱·브라우저로 QR을 찍어도 돼요.</li>
  </ul>
  <div id="browser-check"></div>
  ${flash(error)}
  <form method="post" class="stack" id="new-form" data-key="${esc(vapidKey)}">
    <label>차량 번호 뒷 4자리 <b class="req">(필수)</b> <small class="muted">숫자만, 연락하는 사람에게 보여요</small>
      ${plateInput('')}</label>
    <div class="new-msg"></div>
    <button class="btn primary">만들기</button>
  </form>
</section>`, { scripts: '<script src="/mycards.js"></script><script src="/app.js"></script>' });
}

// 차량 번호가 없는 (예전에 만든) 카드: 번호를 넣기 전에는 다른 기능을 막음
export function plateRequired(ctx, plate, { error } = {}) {
  const issued = !!plate.batch_id;
  return layout(ctx, issued ? '카드 등록' : '차량 번호 입력', `
<section class="card${issued ? ' hero' : ''}">
  ${issued ? `<div class="big-emoji">🔑</div><h1>${esc(ctx.serviceName)} 카드 등록</h1>
  <p class="muted">카드 <b class="mono">${esc(plate.code)}</b> · 1분이면 끝나요</p>
  <ol class="reg-steps"><li class="on">차량 번호</li><li>알림 켜기</li><li>앱 설치</li></ol>`
    : `<h1>내 카드 <span class="mono">${esc(plate.code)}</span></h1>`}
  <p>${issued ? '' : '서비스를 쓰려면 '}<b>차량 번호 뒷 4자리</b>를 ${issued ? '' : '먼저 '}입력해 주세요. 연락하는 사람이 차를 확인하는 데 쓰여요.</p>
  ${flash(error)}
  <form method="post" action="/m/${esc(plate.manage_token)}/settings" class="stack">
    <label>차량 번호 뒷 4자리 <b class="req">(필수)</b> ${plateInput('')}</label>
    <button class="btn primary">저장하고 계속하기</button>
  </form>
</section>`);
}

export function manage(ctx, plate, { alerts, devices, vapidKey, manageUrl, qrSvg, saved, created, error }) {
  const hours = (sel) => ['<option value="">없음</option>', ...Array.from({ length: 24 }, (_, h) =>
    `<option value="${h}" ${sel === h ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`)].join('');
  const t = esc(plate.manage_token);
  // 응답하지 않은 알림은 바로 답하기
  const replyLink = (a, label) => `<a class="btn small ${a.status === 'sent' ? 'primary' : ''}" href="/r/${esc(a.id)}/${esc(a.owner_key)}">${label}</a>`;
  // 보낸 사람 구분: 처음 연락한 순서대로 A, B, C… (같은 글자 = 같은 사람)
  const who = {}, count = {};
  [...alerts].reverse().forEach((a) => {
    if (!a.sender) return;
    if (!(a.sender in who)) who[a.sender] = Object.keys(who).length;
    count[a.sender] = (count[a.sender] || 0) + 1;
  });
  const senderChip = (a) => {
    if (!a.sender) return '';
    const n = who[a.sender];
    const name = n < 26 ? String.fromCharCode(65 + n) : String(n + 1);
    return `<span class="who who-${n % 6}" title="같은 글자는 같은 사람이 보낸 연락이에요">👤 ${name}${count[a.sender] > 1 ? ` · ${count[a.sender]}회` : ''}</span>`;
  };
  const row = (a) => `<li class="arow">
    <div class="arow-top">${senderChip(a)}<span class="arow-time">${kstString(a.created_at)}</span>
      <span class="tag ${a.status}">${a.status === 'ack' ? esc(a.ack_text) : a.status === 'failed' ? '전달 실패' : '응답 안 함'}</span></div>
    <div class="arow-msg">${esc(a.message)}</div>
    ${a.status === 'sent' ? `<div class="arow-act">${replyLink(a, '답하기')}</div>` : ''}</li>`;
  const rows = alerts.map(row).join('') || '<li class="muted empty">아직 받은 알림이 없어요</li>';

  // 대시보드 요약
  const now = Date.now(), DAY = 24 * 3600_000;
  const pending = alerts.filter((a) => a.status === 'sent' && now - a.created_at < DAY);
  const recent = alerts.filter((a) => now - a.created_at < DAY).length;
  const hh = (h) => `${String(h).padStart(2, '0')}:00`;
  const quietSet = plate.quiet_start != null && plate.quiet_end != null && plate.quiet_start !== plate.quiet_end;
  const quietNow = quietSet && inQuietHours(plate.quiet_start, plate.quiet_end);
  const tile = (id, href, icon, label, value, state = '') =>
    `<a class="tile ${state}" id="tile-${id}" href="${href}"><span class="tile-ico">${icon}</span>
      <span class="tile-label">${label}</span><b class="tile-val">${value}</b></a>`;

  const devs = devices.map((d) => `<li>${esc(d.device || '기기')} <span class="muted small">${kstString(d.created_at)} 등록</span>
    <form method="post" action="/m/${t}/devices/${d.id}/delete" class="inline-form"><button class="linkbtn">삭제</button></form></li>`).join('')
    || '<li class="muted">알림 받는 기기가 없어요</li>';
  return layout(ctx, '내 카드', `
<div id="live-alert" class="live-alert" hidden></div>
${created ? `<section class="card hero"><div class="big-emoji">🎉</div><h1>${plate.batch_id ? '등록했어요' : '카드를 만들었어요'}</h1>
  <p>${plate.batch_id ? '이제 <b>알림 켜기</b>와 <b>앱 설치</b>만 하면 연락을 받을 수 있어요.' : '아래 준비를 마치면 연락을 받을 수 있어요.'}</p></section>` : ''}

<section class="card dash">
  <div class="dash-head">
    <div><div class="dash-label">내 차량</div><div class="dash-plate">${esc(plate.nickname)}</div></div>
    <div class="dash-code"><div class="dash-label">카드 코드</div><b class="mono">${esc(plate.code)}</b></div>
  </div>
  <a class="ready ${devices.length ? '' : 'warn'}" id="ready" href="#push">
    <span class="ready-ico">${devices.length ? '⏳' : '⚠️'}</span>
    <span><b class="ready-title">${devices.length ? '확인 중…' : '아직 연락을 받을 수 없어요'}</b>
      <span class="ready-sub">${devices.length ? '' : '알림을 켜 주세요'}</span></span>
  </a>
  <div class="tiles">
    ${tile('push', '#push', '🔔', '알림', devices.length ? `기기 ${devices.length}대` : '꺼짐', devices.length ? '' : 'warn')}
    ${tile('app', '#install', '📲', '앱', '확인 중')}
    ${tile('quiet', '#settings', '🌙', '방해 금지', quietSet ? `${hh(plate.quiet_start)}–${hh(plate.quiet_end)}` : '꺼짐', quietNow ? 'info' : '')}
    ${tile('alerts', '#alerts', '📨', '24시간 연락', `${recent}건${pending.length ? ` · 미응답 ${pending.length}` : ''}`, pending.length ? 'warn' : '')}
  </div>
  ${quietNow ? `<p class="muted small dash-note">🌙 지금은 방해 금지 시간이에요. '급한 상황' 연락만 알림이 와요.</p>` : ''}
</section>

${pending.length ? `<section class="card pending"><h2>💬 답하지 않은 연락 ${pending.length}건</h2>
  <ul class="list">${pending.map(row).join('')}</ul></section>` : ''}

<section class="card" id="install">
  <h2>📲 앱 설치</h2>
  <p class="install-msg muted">바탕화면에 ${esc(ctx.serviceName)} 아이콘을 만들어요.</p>
  <button class="btn primary big install-btn" type="button">📲 앱 설치</button>
  <div class="keybox">
    ${plate.batch_id ? `<p><b>🔑 등록 카드를 잘 보관하세요.</b> 휴대폰을 바꾸거나 이 화면을 잃어버려도 등록 카드 QR을 다시 찍으면 열려요.
      앱을 설치하면 바탕화면 아이콘으로 바로 열려요.</p>` : `<p><b>⚠️ 이 페이지 주소가 열쇠예요.</b> 잃어버리면 다시 찾을 수 없어요 (개인정보를 받지 않기 때문).
      앱을 설치하면 바탕화면 아이콘으로 바로 열려요.</p>`}
    <button class="btn small" data-copy="${esc(manageUrl)}">관리 링크 복사</button>
  </div>
</section>

<section class="card" id="push" data-token="${t}" data-key="${esc(vapidKey)}" data-code="${esc(plate.code)}" data-plate="${esc(plate.nickname)}">
  <h2>🔔 알림</h2>
  <div class="push-msg flash warn">확인 중…</div>
  <div id="sound-hint" class="flash small" hidden>🔊 화면을 한 번 눌러 두면, 앱을 열어 둔 동안 연락이 왔을 때 소리로 알려 드려요.</div>
  <button class="btn primary big push-on" type="button">🔔 알림 켜기</button>
  <div class="btn-row">
    <button class="btn push-test" type="button" hidden>🧪 테스트 알림</button>
    <button class="btn push-off" type="button" hidden>이 기기 알림 끄기</button>
  </div>
  <h3>알림 받는 기기 (${devices.length})</h3>
  <ul class="list">${devs}</ul>
  <details><summary>다른 휴대폰도 알림 받기</summary>
    <p class="muted small">다른 휴대폰으로 아래 QR을 찍어 이 관리 화면을 열고, 거기서 알림 켜기를 누르세요.
    <b>이 QR은 출력하지 마세요.</b> (관리 열쇠예요)</p>
    <div class="qrbox">${qrSvg}</div>
  </details>
</section>

<section class="card" id="alerts"><h2>📨 최근 알림</h2>
  ${alerts.some((a) => a.sender) ? '<p class="muted small">👤 A, B… 는 보낸 사람이에요. 같은 글자면 같은 사람(같은 휴대폰)이 보낸 연락이에요.</p>' : ''}
  <ul class="list">${rows}</ul></section>

<section class="card stack">
  <h2>🪪 QR 카드</h2>
  ${orderBox(ctx, plate.code)}
  <div class="btn-row">
    <a class="btn" href="/m/${t}/print" target="_blank">🖨️ 직접 출력</a>
    <a class="btn" href="/c/${esc(plate.code)}">👀 상대 화면 보기</a>
  </div>
  <p class="muted small">직접 출력은 컴퓨터에서 하는 게 편해요. '관리 링크 복사'로 주소를 보내 컴퓨터에서 여세요.</p>
</section>

<section class="card" id="settings">
  <h2>⚙️ 설정</h2>
  ${saved ? flash('저장했어요', 'ok') : ''}
  <form method="post" action="/m/${t}/settings" class="stack">
    ${flash(error)}
    <label>차량 번호 뒷 4자리 <b class="req">(필수)</b> ${plateInput(plate.nickname)}</label>
    <div class="row">
      <label>방해 금지 시작 <select name="quiet_start">${hours(plate.quiet_start)}</select></label>
      <label>끝 <select name="quiet_end">${hours(plate.quiet_end)}</select></label>
    </div>
    <p class="muted small">방해 금지 시간에는 연락하는 사람이 '급한 상황'에 체크한 경우에만 알림이 와요.</p>
    <p class="muted small">📞 전화 연결을 원하면 <b>출력 화면</b>에서 번호를 넣어 출력하세요. 번호는 이 휴대폰에서 QR에만 들어가고 서버에는 저장되지 않아요.</p>
    <button class="btn primary">저장</button>
  </form>
</section>

<div id="push-slot"></div>

<section class="card">
  <details class="more"><summary>🔑 관리 링크 · ${plate.batch_id ? '등록 해제' : '카드 삭제'}</summary>
    <p class="muted small">이 화면 주소가 카드의 열쇠예요. 다른 기기에서 열 때 쓰세요.</p>
    <button class="btn small" data-copy="${esc(manageUrl)}">관리 링크 복사</button>
    <form method="post" action="/m/${t}/delete" class="danger-zone" onsubmit="if (!confirm(${plate.batch_id ? `'등록을 해제하면 차량 번호·알림 기기·연락 기록이 지워지고, 등록 카드로 다시 등록할 수 있어요. 해제할까요?'` : `'카드를 삭제하면 출력한 QR도 더 이상 쓸 수 없어요. 삭제할까요?'`})) return false; if (window.MyCards) MyCards.remove('${t}');">
      <button class="btn danger">${plate.batch_id ? '등록 해제 (카드 초기화)' : '카드 삭제'}</button>
    </form>
  </details>
</section>`, {
    head: `<link rel="manifest" href="/m/${t}/manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${esc(ctx.serviceName)}">`,
    scripts: '<script src="/mycards.js"></script><script src="/sound.js"></script><script src="/app.js"></script>',
  });
}

export function simple(ctx, title, msg, link) {
  return layout(ctx, title, `<section class="card"><h1>${esc(title)}</h1><p>${esc(msg)}</p>
  ${link ? `<a class="btn" href="${esc(link.href)}">${esc(link.label)}</a>` : ''}</section>`);
}

export function about(ctx) {
  return layout(ctx, '이 서비스는?', `<section class="card prose">
<h1>이 서비스는?</h1>
<p>차 안에 둔 QR 카드를 찍으면, 차주 휴대폰으로 <b>푸시 알림</b>이 가는 무료 주차 연락 서비스입니다.
누구나 무료로 쓰고 직접 출력할 수 있어요.${ctx.sourceUrl ? ` <b>오픈소스</b>입니다 (AGPL-3.0 라이선스, <a href="${esc(ctx.sourceUrl)}" target="_blank" rel="noopener">소스 코드</a>).` : ''}</p>
<h2>개인정보를 수집하지 않습니다</h2>
<p>이름, 전화번호, 전체 차량번호, 위치, 연락하는 사람의 정보는 <b>서버에 저장하지 않습니다.</b></p>
<h2>서버에 저장하는 것</h2>
<ul>
  <li>카드 코드(무작위 6자리), 차량 번호 뒷 4자리, 방해 금지 시간</li>
  <li>차주 기기의 푸시 알림 주소 — 브라우저가 만든 무작위 주소로, 이름·전화번호가 아닙니다</li>
  <li>알림 내용과 시각 — 90일 후 자동 삭제 (직접 입력 칸에 개인정보를 쓰지 마세요)</li>
  <li>장난 알림 방지용 접속 기록 — 원래 IP가 아닌 변환된 값으로만, 하루 후 삭제</li>
  <li>보낸 사람 구분값 — 차주가 같은 사람의 연락인지 알 수 있게, 보낸 사람 휴대폰의 무작위 값을 카드마다 다르게 변환해 알림과 함께 저장 (이름·전화번호가 아니며, 다른 카드와 연결할 수 없음)</li>
</ul>
<h2>전화 연결 번호</h2>
<p>차주가 원하면 <b>자기 휴대폰에서</b> 출력할 때 번호를 QR 안에 넣을 수 있습니다.
이 번호는 주소의 <b>#</b> 뒷부분에만 들어가 인터넷 표준상 <b>서버로 전송되지 않으며, 저장되지 않습니다.</b>
QR을 찍은 사람의 휴대폰에서만 전화 버튼을 보여 줍니다.</p>
<h2>카드 주문 (쇼핑몰)</h2>
<p>카드형 번호판을 쇼핑몰에서 주문하는 경우, 쇼핑몰에는 <b>카드 코드(6자리)만</b> 전달됩니다.
주문 인쇄용 카드에는 QR과 코드만 들어가고 전화번호는 들어가지 않습니다.
주문·배송 정보는 해당 쇼핑몰의 개인정보 처리방침을 따릅니다.</p>
<h2>삭제</h2>
<p>차주가 관리 화면에서 카드를 삭제하면 그 즉시 QR로 연락이 오지 않으며, 실수로 지운 경우를 위해 <b>30일 동안 보관한 뒤 완전히 지웁니다.</b></p>
</section>`);
}

// 출력 화면 — mm 단위 실제 크기
//  owner: 차주 화면(관리 링크)에서 연 경우 → 큰 카드·스티커·카드형 + 전화 번호 넣기(이 휴대폰에서만)
//  shop:  쇼핑몰 주문 인쇄용(/card/코드) → 카드형만, 전화 번호 없음
export function print(ctx, plate, { qrSvg, qrUrl, host, layout: kind, theme, owner }) {
  const code = esc(plate.code);
  const poster = (cls) => `
  <div class="${cls}">
    <div class="t1">주차 중 연락은</div>
    <div class="scan"><span class="scan-ico">📷</span><span class="scan-txt"><small>카메라로</small><b>QR을 찍어 주세요</b></span></div>
    <div class="scan-arrow">▼</div>
    <div class="qr">${qrSvg}</div>
    <div class="alt">
      <div class="alt-label">QR이 안 되면 ⌨️ 휴대폰 <b>주소창</b>에 입력</div>
      <div class="alt-url"><span>${esc(host)}/</span><b>${code}</b></div>
    </div>
    <div class="note">전화번호 없이 차주 휴대폰으로 알림이 갑니다</div>
    <div class="brand">🚗 ${esc(ctx.serviceName)}</div>
  </div>`;
  // 카드형 디자인은 비공개 모듈(src/private)에 있음 — 공개판에서는 카드형 없이 큰 카드·스티커만
  const cards = !!P.cardFront;
  const card = { code: plate.code, qrSvg, host, theme };
  const body = kind === 'sticker' ? `<div class="grid">${Array.from({ length: 6 }, () => poster('sticker')).join('')}</div>`
    : kind === 'card' && cards ? `<div class="cards"><div><div class="cap">앞면</div>${P.cardFront(ctx, card)}</div><div><div class="cap">뒷면</div>${P.cardBack(ctx, card)}</div></div>`
      : poster('big');
  const q = (o) => '?' + new URLSearchParams(Object.assign({ layout: kind, theme }, o)).toString();
  const themeLinks = cards ? Object.entries(P.CARD_THEMES).map(([k, v]) =>
    `<a href="${q({ layout: 'card', theme: k })}" class="${k === theme ? 'on' : ''}">${v}</a>`).join(' · ') : '';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${owner ? '출력' : '주문 인쇄'} ${code}</title>
<link rel="stylesheet" href="/print.css">
</head><body>
<div class="bar">
  <button onclick="print()">🖨️ 인쇄</button>
  ${owner ? `<a href="${q({ layout: 'big' })}" class="${kind === 'big' ? 'on' : ''}">큰 카드 (대시보드용)</a> ·
  <a href="${q({ layout: 'sticker' })}" class="${kind === 'sticker' ? 'on' : ''}">작은 스티커 6장</a>
  ${cards ? `· <a href="${q({ layout: 'card' })}" class="${kind === 'card' ? 'on' : ''}">카드형 (85.6×54mm)</a>` : ''}` : `<b>주문 인쇄용 카드 · 코드 ${code}</b>`}
  ${kind === 'card' ? `<div class="row">색상: ${themeLinks}</div>` : ''}
  <div class="row"><b>인쇄 배율 100%(실제 크기)</b>로 출력하세요. 무광 용지·무광 코팅이면 유리 반사가 줄어 QR이 훨씬 잘 찍혀요.</div>
  ${owner ? `<div class="tel" id="tel-box" data-url="${esc(qrUrl)}" data-code="${code}">
    📞 <b>전화 연결 번호 (선택)</b>
    <input id="tel" type="tel" inputmode="tel" maxlength="16" placeholder="예: 0504-1234-5678" autocomplete="off">
    <div id="tel-msg" class="tel-msg"></div>
    <div class="qr-info" id="qr-info"></div>
    <small>입력하는 대로 QR이 바로 바뀌고 이 휴대폰에 자동 저장돼요. 번호는 <b>이 휴대폰에서만</b> QR 안에 넣고, 서버로 보내지 않아요.
    QR을 찍은 사람에게 오른쪽 위 📞 버튼이 생기고, 누르면 그 사람 전화 앱에 번호가 보여요. 가능하면 050 안심번호를 쓰세요.</small>
  </div>
  ${ctx.orderUrl ? `<div class="row">🪪 튼튼한 카드로 받고 싶다면 <a href="${esc(ctx.orderUrl)}" target="_blank" rel="noopener">${esc(ctx.orderName)}에서 주문</a>
    (주문 시 카드 코드 <b>${code}</b> 입력 · 주문 카드에는 전화번호가 들어가지 않아요)</div>` : ''}` : ''}
</div>
${body}
${owner ? '<script src="/vendor/qrcode.min.js"></script><script src="/print.js"></script>' : ''}
</body></html>`;
}

