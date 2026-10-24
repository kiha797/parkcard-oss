// 차주 화면(카드 만들기·관리) 전용 스크립트
//  - 안드로이드는 Chrome, 아이폰은 Safari로 고정 (알림이 확실히 되는 브라우저)
//  - 앱 설치: 안드로이드는 버튼 한 번, 아이폰은 화살표 안내
//  - 푸시 알림 켜기/끄기/테스트
var env = (function () {
  var ua = navigator.userAgent;
  var ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var android = /android/i.test(ua);
  var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  var others = /SamsungBrowser|Whale|EdgA|EdgiOS|OPR|OPiOS|YaBrowser|UCBrowser|MiuiBrowser|HuaweiBrowser|HeyTapBrowser|VivoBrowser|NAVER|KAKAOTALK|; wv\)|Line\/|Instagram|FBAN|FBAV|DaumApps|everytimeApp|BAND\/|Firefox|FxiOS|CriOS|DuckDuckGo/i;
  return {
    ua: ua,
    ios: ios,
    android: android,
    standalone: standalone,
    chrome: android && /Chrome\/\d/.test(ua) && !others.test(ua),
    safari: ios && /Safari\//.test(ua) && /Version\//.test(ua) && !others.test(ua),
    kakao: /KAKAOTALK/i.test(ua),
    line: /Line\//.test(ua),
    pushApi: window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
  };
})();

var here = location.host + location.pathname;
var hereUrl = 'https://' + here;

// 지금 화면을 Chrome(안드로이드) / Safari(아이폰)로 여는 주소
function openUrl() {
  if (env.android) {
    var store = encodeURIComponent('https://play.google.com/store/apps/details?id=com.android.chrome');
    return 'intent://' + here + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + store + ';end';
  }
  if (env.kakao) return 'kakaotalk://web/openExternal?url=' + encodeURIComponent(hereUrl);
  if (env.line) return hereUrl + '?openExternalBrowser=1';
  return 'x-safari-' + hereUrl;
}

// ───────── 브라우저 고정 ─────────
var locked = (function () {
  if (!document.getElementById('browser-check') && !document.getElementById('push')) return false;
  if (env.standalone) return false;                       // 설치한 앱으로 연 경우
  if (!env.android && !env.ios) return false;             // 컴퓨터는 그대로
  if (env.android ? env.chrome : env.safari) return false;

  var name = env.android ? 'Chrome' : 'Safari';
  var nameTo = env.android ? 'Chrome으로' : 'Safari로';
  var main = document.querySelector('main');
  [].forEach.call(main.querySelectorAll('section'), function (s) { s.hidden = true; });
  var card = document.createElement('section');
  card.className = 'card hero lockcard';
  card.innerHTML =
    '<div class="big-emoji">' + (env.android ? '🌐' : '🧭') + '</div>' +
    '<h1>' + name + '에서 열어 주세요</h1>' +
    '<p>알림을 확실히 받으려면 ' + (env.android ? '안드로이드는 <b>Chrome</b>' : '아이폰은 <b>Safari</b>') + '에서 진행해야 해요.</p>' +
    '<div class="guide-btns"><a class="btn primary big" href="' + openUrl() + '">' + nameTo + ' 열기</a>' +
    '<button type="button" class="btn" data-copy="' + hereUrl + '">주소 복사</button></div>' +
    '<p class="muted small">버튼이 안 되면 주소를 복사해 ' + name + ' 주소창에 붙여 넣으세요.</p>';
  main.insertBefore(card, main.querySelector('header').nextSibling);
  // 앱 안 브라우저(카카오톡 등)는 바로 넘어가는 경우가 많아서 한 번 자동 시도
  setTimeout(function () { location.href = openUrl(); }, 400);
  return true;
})();

// ───────── 푸시 공통 ─────────
function u8(b64) {
  var pad = '='.repeat((4 - (b64.length % 4)) % 4);
  var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, function (c) { return c.charCodeAt(0); });
}
function deviceName() {
  var ua = env.ua;
  return (/iphone/i.test(ua) ? 'iPhone' : /ipad/i.test(ua) ? 'iPad' : /android/i.test(ua) ? 'Android' : /mac/i.test(ua) ? 'Mac' : /windows/i.test(ua) ? 'Windows' : '기기')
    + ' · ' + (env.standalone ? '앱' : /edg\//i.test(ua) ? 'Edge' : /samsungbrowser/i.test(ua) ? '삼성 인터넷' : /crios|chrome/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : /firefox/i.test(ua) ? 'Firefox' : '브라우저');
}
// 이 기기의 푸시 구독 (없으면 새로 만듦) — 알림이 허용된 뒤에 호출
function pushSubscribe(key) {
  return navigator.serviceWorker.register('/sw.js')
    .then(function () { return navigator.serviceWorker.ready; })
    .then(function (reg) {
      return reg.pushManager.getSubscription().then(function (s) {
        return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(key) });
      });
    });
}
function saveDevice(token, sub) {
  return fetch('/m/' + token + '/subscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sub: sub.toJSON(), device: deviceName() }),
  }).then(function (r) { return r.json(); });
}

// ───────── 카드 만들기: '만들기'를 누르는 순간 알림 허용 창 → 만들고 바로 알림 켜기 ─────────
(function () {
  var form = document.getElementById('new-form');
  if (!form || locked || !window.fetch) return;
  var btn = form.querySelector('button'), msg = form.querySelector('.new-msg');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var canPush = env.pushApi && !(env.ios && !env.standalone) && form.dataset.key;
    // 허용 창은 사용자가 누른 순간에만 띄울 수 있어서, 기다리지 않고 바로 요청
    var perm = canPush && Notification.permission === 'default'
      ? Promise.resolve(Notification.requestPermission()) : Promise.resolve(canPush ? Notification.permission : 'unsupported');
    btn.disabled = true;
    btn.textContent = '만드는 중…';
    msg.innerHTML = '';
    var created = fetch('/new', {
      method: 'POST', headers: { 'X-Requested-With': 'fetch' }, body: new URLSearchParams(new FormData(form)),
    }).then(function (r) { return r.json(); });
    Promise.all([perm, created]).then(function (res) {
      var p = res[0], d = res[1];
      if (!d.ok) {
        msg.innerHTML = '<div class="flash err">' + d.error + '</div>';
        btn.disabled = false;
        btn.textContent = '만들기';
        return;
      }
      if (window.MyCards) MyCards.add({ token: d.token, code: d.code, nickname: form.elements.nickname.value });
      var go = function () { location.href = '/m/' + d.token + '?created=1'; };
      if (p !== 'granted') return go();
      btn.textContent = '알림 켜는 중…';
      pushSubscribe(form.dataset.key).then(function (sub) { return saveDevice(d.token, sub); }).then(go, go);
    }).catch(function () {
      btn.disabled = false;
      form.submit();   // 스크립트 방식이 실패하면 예전 방식으로
    });
  });
})();

// ───────── 이 휴대폰에 내 카드 기억 (mycards.js) ─────────
(function () {
  var p = document.getElementById('push');
  if (p && window.MyCards) MyCards.add({ token: p.dataset.token, code: p.dataset.code, nickname: p.dataset.plate });
})();

// ───────── 대시보드: 맨 위 준비 상태 + 타일 ─────────
var Dash = (function () {
  var st = { app: null, push: null, hint: '' };
  function tile(id, val, kind) {
    var el = document.getElementById('tile-' + id);
    if (!el) return;
    el.className = 'tile ' + (kind || '');
    el.querySelector('.tile-val').textContent = val;
  }
  function paint() {
    var el = document.getElementById('ready');
    if (!el || st.push === null) return;
    var kind, icon, title, sub, href;
    if (st.push === 'on') {
      kind = 'ok'; icon = '✅'; title = '연락 받을 준비 완료';
      sub = st.app === false ? '앱을 설치하면 바탕화면에서 바로 열 수 있어요' : '연락이 오면 휴대폰 알림으로 알려 드려요';
      href = st.app === false ? '#install' : '#alerts';
    } else {
      kind = st.push === 'err' ? 'err' : 'warn'; icon = '⚠️'; title = '아직 연락을 받을 수 없어요';
      sub = st.hint || '알림을 켜 주세요';
      href = env.ios && !env.standalone ? '#install' : '#push';
    }
    el.className = 'ready ' + kind;
    el.href = href;
    el.querySelector('.ready-ico').textContent = icon;
    el.querySelector('.ready-title').textContent = title;
    el.querySelector('.ready-sub').textContent = sub;
  }
  return {
    app: function (ok, text) { st.app = ok; tile('app', text || (ok ? '설치됨' : '설치 전'), ok ? 'ok' : ''); paint(); },
    push: function (state, hint) {
      st.push = state; st.hint = hint || '';
      var n = document.querySelectorAll('#push .list li form').length;
      tile('push', state === 'on' ? '켜짐' + (n > 1 ? ' · ' + n + '대' : '') : state === 'err' ? '사용 불가' : '꺼짐',
        state === 'on' ? 'ok' : state === 'err' ? 'err' : 'warn');
      paint();
    },
  };
})();

// ───────── 앱 설치 ─────────
(function () {
  var box = document.getElementById('install');
  if (!box || locked) return;
  if (env.standalone) { box.hidden = true; Dash.app(true); return; }
  Dash.app(false);
  var btn = box.querySelector('.install-btn'), msg = box.querySelector('.install-msg');
  var deferred = null;

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', function () {
    msg.innerHTML = '✅ 설치했어요! 바탕화면의 <b>QR 주차번호판</b> 아이콘으로 열어서 알림을 켜 주세요.';
    btn.hidden = true;
    Dash.app(true, '설치함');
  });

  if (env.ios) msg.innerHTML = '바탕화면에 QR 주차번호판 아이콘을 만들어요. <b>아이폰은 설치한 앱에서만 알림을 받을 수 있어요.</b>';

  btn.onclick = function () {
    if (env.ios) return showIosGuide();
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.then(function (r) {
        if (r.outcome === 'accepted') msg.innerHTML = '✅ 설치하고 있어요. 바탕화면의 <b>QR 주차번호판</b> 아이콘으로 열어 주세요.';
        deferred = null;
      });
      return;
    }
    // 이미 설치했거나 Chrome이 아직 설치 준비 중일 때
    msg.innerHTML = env.android
      ? '오른쪽 위 <b>⋮ 메뉴 → "앱 설치"</b> (또는 "홈 화면에 추가")를 눌러 주세요. 이미 설치했다면 바탕화면의 QR 주차번호판 아이콘으로 여세요.'
      : '주소창 오른쪽의 <b>설치 아이콘</b>을 누르거나, 브라우저 메뉴에서 "앱 설치"를 찾아 주세요.';
  };
})();

function showIosGuide() {
  var o = document.createElement('div');
  o.className = 'ios-guide';
  o.innerHTML =
    '<div class="ios-card">' +
    '<h2>홈 화면에 추가하기</h2>' +
    '<ol>' +
    '<li>화면 아래쪽의 <b>공유 버튼</b> <span class="ios-ico">□↑</span> 누르기<br><small>안 보이면 화면을 살짝 위로 올리거나, <b>···</b> 버튼을 누르면 있어요</small></li>' +
    '<li>목록을 아래로 내려 <b>"홈 화면에 추가"</b> 누르기</li>' +
    '<li>오른쪽 위 <b>"추가"</b> 누르기</li>' +
    '<li>바탕화면의 <b>QR 주차번호판</b> 아이콘으로 열어서 알림 켜기</li>' +
    '</ol>' +
    '<button type="button" class="btn">닫기</button>' +
    '</div>' +
    '<div class="ios-arrow">⬇</div>';
  o.onclick = function (e) { if (e.target === o || e.target.tagName === 'BUTTON') o.remove(); };
  document.body.appendChild(o);
}

// ───────── 푸시 알림 ─────────
(function () {
  var box = document.getElementById('push');
  if (!box || locked) return;
  var token = box.dataset.token, vapid = box.dataset.key;
  var msg = box.querySelector('.push-msg'), btnOn = box.querySelector('.push-on'),
      btnTest = box.querySelector('.push-test'), btnOff = box.querySelector('.push-off');

  function show(text, kind) { msg.className = 'push-msg flash ' + (kind || 'warn'); msg.innerHTML = text; }
  function ui(on) {
    btnOn.hidden = on; btnTest.hidden = !on; btnOff.hidden = !on;
    Dash.push(on ? 'on' : 'off');
    // 준비가 끝나면 알림 관리는 아래로 (대시보드처럼 위에는 요약·연락만)
    var slot = document.getElementById('push-slot');
    if (on && slot && box.parentNode !== slot) slot.appendChild(box);
  }

  function post(path, body) {
    return fetch('/m/' + token + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json(); });
  }
  function save(sub) { return saveDevice(token, sub); }

  // 아이폰은 설치한 앱에서만 푸시 가능
  if (env.ios && !env.standalone) {
    show('아이폰은 <b>📲 앱 설치</b>를 먼저 하고, 바탕화면의 QR 주차번호판 아이콘으로 열어서 알림을 켜 주세요.');
    btnOn.hidden = true;
    Dash.push('off', '아이폰은 앱을 설치한 뒤, 앱에서 알림을 켜요');
    return;
  }
  if (!env.pushApi) {
    show(env.ios
      ? '이 아이폰은 알림을 지원하지 않아요. <b>설정 → 일반 → 소프트웨어 업데이트</b>에서 iOS 16.4 이상으로 업데이트해 주세요.'
      : '이 브라우저는 알림을 지원하지 않아요. Chrome, Edge, Safari 최신 버전에서 열어 주세요.', 'err');
    btnOn.hidden = true;
    Dash.push('err', '이 브라우저는 알림을 지원하지 않아요');
    return;
  }

  var reg;
  navigator.serviceWorker.register('/sw.js').then(function (r) { reg = r; return navigator.serviceWorker.ready; })
    .then(function () { return reg.pushManager.getSubscription(); })
    .then(function (sub) {
      if (sub && Notification.permission === 'granted') {
        return save(sub).then(function () { ui(true); show('✅ 이 기기에서 알림을 받고 있어요', 'ok'); });
      }
      // 이미 허용된 휴대폰이면 누를 필요 없이 바로 켬
      if (Notification.permission === 'granted') return enable();
      ui(false);
      if (Notification.permission === 'denied') {
        Dash.push('err', '휴대폰 설정에서 알림이 차단되어 있어요');
        show('알림이 <b>차단</b>되어 있어요. 휴대폰 <b>설정 → 알림</b>에서 ' + (env.standalone ? 'QR 주차번호판' : '이 브라우저') + '의 알림을 허용해 주세요.', 'err');
        return;
      }
      // 기본은 켜기: 화면 어디든 처음 누르면 허용 창 (브라우저는 누를 때만 허용 창을 띄울 수 있음)
      show('화면을 한 번 누르면 알림 허용 창이 떠요. <b>허용</b>을 눌러 주세요.');
      document.addEventListener('click', function first(e) {
        document.removeEventListener('click', first, true);
        if (Notification.permission === 'default' && !btnOn.contains(e.target)) enable();
      }, true);
    })
    .catch(function (e) { show('알림 기능을 준비하지 못했어요: ' + e.message, 'err'); btnOn.hidden = true; Dash.push('err', '알림 기능을 준비하지 못했어요'); });

  function enable() {
    btnOn.disabled = true;
    return Promise.resolve(Notification.requestPermission()).then(function (p) {
      if (p !== 'granted') throw new Error('denied');
      return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(vapid) });
    }).then(save).then(function () {
      ui(true); show('✅ 알림을 켰어요. <b>테스트 알림</b>으로 확인해 보세요.', 'ok');
      setTimeout(function () { location.reload(); }, 1500);
    }).catch(function (e) {
      show(e.message === 'denied'
        ? '알림을 허용해야 받을 수 있어요. 휴대폰 설정에서 알림이 켜져 있는지도 확인해 주세요.'
        : '알림을 켜지 못했어요: ' + e.message, 'err');
    }).finally(function () { btnOn.disabled = false; });
  }
  btnOn.onclick = enable;

  btnTest.onclick = function () {
    btnTest.disabled = true;
    post('/test').then(function (r) {
      if (r.delivered) return show('테스트 알림을 보냈어요 (' + r.delivered + '대). 몇 초 안에 안 오면 휴대폰 알림 설정을 확인하세요.', 'ok');
      show('알림을 보내지 못했어요. 아래 <b>이 기기 알림 끄기</b>를 누른 뒤 다시 켜 주세요.' +
        (r.error ? '<br><small>오류 내용(문의할 때 알려 주세요): ' + String(r.error).replace(/[<>&]/g, '') + '</small>' : ''), 'err');
    }).finally(function () { btnTest.disabled = false; });
  };

  btnOff.onclick = function () {
    reg.pushManager.getSubscription().then(function (sub) {
      if (!sub) return;
      return post('/unsubscribe', { endpoint: sub.endpoint }).then(function () { return sub.unsubscribe(); });
    }).then(function () { location.reload(); });
  };
})();

// ───────── 차주 알림 소리: 앱을 열어 둔 동안 연락이 오면 딩동댕 ─────────
(function () {
  if (!window.ParkSound || locked) return;
  var S = window.ParkSound;

  // 화면을 한 번 누르면 소리 허용 (브라우저 규칙)
  var hint = document.getElementById('sound-hint');
  if (hint && document.querySelector('#push .push-test') && !S.isUnlocked()) hint.hidden = false;
  document.addEventListener('pointerdown', function () { S.unlock(); if (hint) hint.hidden = true; }, { once: true });

  // 앱(화면)을 열어 둔 동안 연락이 오면: 서비스 워커가 알려 줌 → 소리 + 화면 상단 표시
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.type !== 'parkcard-alert') return;
      S.chime();
      var box = document.getElementById('live-alert');
      if (box && d.url && /^\/r\//.test(d.url)) {
        box.hidden = false;
        box.innerHTML = '<b>🚗 연락이 왔어요</b><p></p><a class="btn primary" href="' + d.url + '">답하기</a>';
        box.querySelector('p').textContent = '"' + (d.message || '') + '"';
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    navigator.serviceWorker.startMessages();
  }
})();

// 주소·관리 링크 복사 (나중에 그려진 버튼도 동작하도록 위임)
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-copy]');
  if (!b) return;
  var text = b.dataset.copy;
  var done = function () { b.textContent = '복사했어요 ✓'; };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done, function () { prompt('아래 주소를 길게 눌러 복사하세요', text); });
  } else {
    prompt('아래 주소를 길게 눌러 복사하세요', text);
  }
});
