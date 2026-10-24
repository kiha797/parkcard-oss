// 연락하는 사람 화면: 페이지를 떠나지 않고 보내기, 다시 보내기 카운트다운, 차주 응답 확인
//  - 보낸 연락은 이 휴대폰에 기억 (24시간): 다른 앱을 보다 돌아오거나 페이지가 새로 열려도 응답이 보이게
//  - 가장 최근 차주 응답은 항상 맨 위에 크게. 오래된 미응답은 '응답 없음'
//  - 화면으로 돌아오는 순간 바로 다시 확인, 응답이 오면 딩동댕 + 진동 + 탭 제목
//  - (선택) '응답 오면 휴대폰 알림으로 받기': 허용하면 휴대폰 알림창으로 응답이 옴 (안드로이드)
(function () {
  var STORE = 'parkcard-sent', KEEP_MS = 24 * 3600 * 1000, WATCH_MS = 2 * 3600 * 1000;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function timeText(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // ───────── 카운트다운 ─────────
  // secs초 동안 버튼을 막고 남은 시간을 1초마다 표시
  function countdown(btn, secs, onDone) {
    var label = btn.dataset.label;
    clearInterval(btn._timer);
    if (!(secs > 0)) { btn.disabled = false; btn.textContent = label; if (onDone) onDone(); return; }
    var end = Date.now() + secs * 1000;
    function tick() {
      var left = Math.ceil((end - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(btn._timer);
        btn.disabled = false;
        btn.classList.remove('waiting-btn');
        btn.textContent = label;
        if (onDone) onDone();
        return;
      }
      btn.disabled = true;
      btn.classList.add('waiting-btn');
      btn.textContent = '⏳ ' + left + '초 후 다시 보낼 수 있어요';
    }
    tick();
    btn._timer = setInterval(tick, 250);
  }

  // ───────── 이 휴대폰에 보낸 연락 기억 ─────────
  function loadSent() {
    try {
      var list = JSON.parse(localStorage.getItem(STORE) || '[]');
      return list.filter(function (x) { return x && x.id && Date.now() - x.at < KEEP_MS; });
    } catch (e) { return []; }
  }
  function saveSent(id, code) {
    try {
      var list = loadSent().filter(function (x) { return x.id !== id; });
      list.unshift({ id: id, code: code, at: Date.now() });
      localStorage.setItem(STORE, JSON.stringify(list.slice(0, 20)));
    } catch (e) { /* 저장 못 해도 화면에는 보임 */ }
  }

  // ───────── 응답 확인 ─────────
  var items = {};          // id → { id, el, status, at, message, ack_text, ack_at }
  var missedAck = null;    // 화면을 안 보는 동안 온 응답
  var baseTitle = document.title;
  var paint = function () {};   // 연락 화면에서 정의

  function onAck(item) {
    ParkSound.chime();
    document.title = '✅ 차주가 응답했어요';
    if (document.hidden) missedAck = item;
    else showAck();
  }

  // 맨 위 '차주 응답'을 화면으로 가져와 잠깐 강조
  function showAck() {
    var top = document.querySelector('.latest-ack:not([hidden])') || document.getElementById('status');
    if (!top) return;
    top.scrollIntoView({ behavior: 'smooth', block: 'center' });
    top.classList.remove('flash-ack');
    void top.offsetWidth;
    top.classList.add('flash-ack');
    setTimeout(function () { document.title = baseTitle; }, 8000);
  }

  function apply(item, a) {
    var was = item.status;
    item.status = a.status;
    if (a.message) item.message = a.message;
    if (a.created_at) item.at = a.created_at;
    item.ack_text = a.ack_text;
    item.ack_at = a.ack_at;
    item.seen_at = a.seen_at;
    if (item.page && a.html) item.el.querySelector('.sent-status').innerHTML = a.html;   // /a/ 화면
    paint();
    if (was === 'sent' && a.status === 'ack') onAck(item);
  }

  function refresh(item) {
    return fetch('/api/a/' + item.id, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (a) { if (a) apply(item, a); })
      .catch(function () { /* 다음 확인 때 다시 */ });
  }

  function refreshWaiting() {
    Object.keys(items).forEach(function (id) {
      var it = items[id];
      // 응답이 오기 전까지 계속 확인
      if (it.status === 'sent' && Date.now() - it.at < WATCH_MS) refresh(it);
    });
  }

  // 응답 문구의 "N분" / "지금 바로" → 도착 예정까지 남은 분 (모르면 null)
  function etaLeft(it) {
    if (!it.ack_at || !it.ack_text) return null;
    var m = /(\d+)\s*분/.exec(it.ack_text), min = m ? Number(m[1]) : /지금 바로/.test(it.ack_text) ? 2 : null;
    return min === null ? null : Math.ceil((it.ack_at + min * 60000 - Date.now()) / 60000);
  }
  function minutesSince(ts) { return Math.max(0, Math.floor((Date.now() - ts) / 60000)); }

  // 화면을 보고 있으면 3초마다, 다른 화면을 보고 있으면 15초마다 확인
  var ticks = 0;
  setInterval(function () {
    ticks++;
    if (!document.hidden || ticks % 5 === 0) refreshWaiting();
  }, 3000);

  // 다른 앱을 보다가 돌아온 순간 바로 확인 + 놓친 응답 보여 주기
  function onReturn() {
    if (document.hidden) return;
    refreshWaiting();
    if (missedAck) { showAck(); missedAck = null; }
  }
  document.addEventListener('visibilitychange', onReturn);
  window.addEventListener('pageshow', onReturn);
  window.addEventListener('focus', onReturn);
  // 휴대폰 알림(푸시)으로 응답이 왔고 이 화면이 열려 있으면 바로 갱신
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'parkcard-reply') refreshWaiting();
    });
    navigator.serviceWorker.startMessages();
  }

  // ───────── (선택) 응답 오면 휴대폰 알림으로 받기 ─────────
  var ua = navigator.userAgent;
  var ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  var pushOk = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window &&
    !(ios && !standalone) && !/KAKAOTALK|NAVER\(inapp|Whale|Line\/|Instagram|FBAN|FBAV|DaumApps|; wv\)/i.test(ua);
  var subscribed = {};

  function u8(b64) {
    var pad = '='.repeat((4 - (b64.length % 4)) % 4);
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, function (ch) { return ch.charCodeAt(0); });
  }
  function subscribeFor(id, key) {
    if (subscribed[id]) return Promise.resolve();
    subscribed[id] = true;
    return navigator.serviceWorker.register('/sw.js')
      .then(function () { return navigator.serviceWorker.ready; })
      .then(function (reg) {
        return reg.pushManager.getSubscription().then(function (s) {
          return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(key) });
        });
      })
      .then(function (sub) {
        return fetch('/a/' + id + '/subscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sub: sub.toJSON() }),
        });
      })
      .catch(function () { subscribed[id] = false; });
  }

  // ───────── 전화 연결 (차주가 자기 휴대폰에서 QR에 넣은 경우만) ─────────
  // 번호는 주소의 # 뒷부분(#T01012345678)에만 있음 — 서버로 전송되지 않는 부분
  (function () {
    var m = /^#t(0\d{8,11}|1[568]\d{6})$/i.exec(location.hash);
    var icon = document.getElementById('call-corner');
    if (!m || !icon) return;
    icon.href = 'tel:' + m[1];
    icon.hidden = false;
    var none = document.getElementById('no-devices');
    if (none) { none.className = 'flash warn'; none.textContent = '차주가 알림을 켜지 않았어요. 오른쪽 위 전화 버튼으로 연락해 주세요.'; }
  })();

  // ───────── 연락 화면 ─────────
  var form = document.getElementById('alert-form');
  if (form) {
    var code = form.action.split('/c/')[1].split('/')[0];
    var key = form.dataset.key;
    var btn = form.querySelector('.send-btn');
    var msg = form.querySelector('.form-msg');
    var result = document.getElementById('result');
    var current = result.querySelector('.current');
    var history = document.getElementById('history');
    var list = history.querySelector('.sent-list');
    var latest = result.querySelector('.latest-ack');
    var notify = result.querySelector('.notify-box');
    var canSend = !btn.disabled;
    // 보낸 사람 구분용 무작위 값 (이 휴대폰에만 저장, 차주에게는 'A·B…' 글자로만 보임)
    var withSender = function (params) {
      try {
        var sid = localStorage.getItem('parkcard-sid');
        if (!sid) {
          sid = Array.from(crypto.getRandomValues(new Uint8Array(12)), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
          localStorage.setItem('parkcard-sid', sid);
        }
        params.set('sid', sid);
      } catch (e) { /* 저장 불가 → 서버가 변환된 IP로 구분 */ }
      return params;
    };   // 차주 기기가 없으면 처음부터 막혀 있음

    // 진행 단계: 보냄 → 전달 → 차주 확인 → 응답
    var stepsHtml = function (it) {
      var steps = [
        ['보냄', true],
        ['전달', it.status !== 'failed'],
        ['차주 확인', !!(it.seen_at || it.status === 'ack')],
        ['응답', it.status === 'ack'],
      ];
      return '<ol class="steps-bar">' + steps.map(function (s) {
        return '<li class="' + (s[1] ? 'on' : '') + '"><span></span>' + s[0] + '</li>';
      }).join('') + '</ol>';
    };
    var statusHtml = function (it, newest) {
      if (it.status === 'loading') return '<div class="muted small">확인 중…</div>';
      if (it.status === 'failed') return '<div class="muted small">⚠️ 차주 휴대폰에 전달되지 않았어요</div>';
      var line;
      if (it.status === 'ack') {
        var left = etaLeft(it);
        line = '<div class="ack-line">✅ 차주 응답: <b>' + esc(it.ack_text) + '</b> <span class="muted small">' + timeText(it.ack_at) + '</span></div>' +
          (left === null ? '' : left > 0 ? '<div class="eta">⏱ 약 <b>' + left + '분</b> 뒤 도착 예정</div>' : '<div class="eta">⏱ 곧 도착해요</div>');
      } else if (!newest) line = '<div class="muted small">응답 없음</div>';
      else {
        var mins = minutesSince(it.at);
        line = '<div class="waiting"><span class="dot"></span> ' + (it.seen_at ? '차주가 알림을 확인했어요. 응답을 기다리는 중…' : '차주의 응답을 기다리는 중…') + '</div>' +
          '<div class="muted small">' + (mins ? mins + '분째 기다리는 중' : '방금 보냈어요') + '</div>';
      }
      return (newest || it.status === 'ack' ? stepsHtml(it) : '') + line;
    };
    // 기다린 시간·도착 예정 시간이 저절로 줄어들게 20초마다 다시 그림
    setInterval(function () { if (!document.hidden) paint(); }, 20000);

    // 화면 다시 그리기: 가장 최근 연락만 보내기 버튼 위에 (응답은 크게), 이전 연락은 아래 접힌 목록으로
    // → 연락이 쌓여도 보내기 버튼이 밀려 내려가지 않음
    paint = function () {
      var arr = Object.keys(items).map(function (k) { return items[k]; })
        .sort(function (a, b) { return b.at - a.at; });
      if (!arr.length) return;
      result.hidden = false;
      var newest = arr[0];
      arr.forEach(function (it, i) {
        it.el.querySelector('.sent-msg').textContent = it.message ? '"' + it.message + '" · ' + timeText(it.at) + ' 보냄' : '확인 중…';
        // 최근 연락에 응답이 왔으면 응답은 위 큰 상자에, 여기는 진행 단계만
        it.el.querySelector('.sent-status').innerHTML = i === 0 && it.status === 'ack' ? stepsHtml(it) : statusHtml(it, i === 0);
        (i === 0 ? current : list).appendChild(it.el);
      });
      history.hidden = arr.length < 2;
      history.querySelector('.history-n').textContent = arr.length - 1;
      var acked = newest.status === 'ack' ? newest : null;
      latest.hidden = !acked;
      if (acked) {
        var left = etaLeft(acked);
        latest.innerHTML = '<div class="latest-title">✅ 차주 응답</div><div class="latest-text">' + esc(acked.ack_text) + '</div>' +
            (left === null ? '' : '<div class="eta big-eta">' + (left > 0 ? '⏱ 약 <b>' + left + '분</b> 뒤 도착 예정' : '⏱ 곧 도착해요') + '</div>') +
            '<div class="muted small">' + timeText(acked.ack_at) + ' 응답</div>';
      }
      paintNotify(arr[0]);
    };

    // 가장 최근 연락이 응답을 기다리는 중일 때만 '휴대폰 알림으로 받기' 표시
    var paintNotify = function (newest) {
      var waiting = newest && newest.status === 'sent';
      if (!pushOk || !key || !waiting || Notification.permission === 'denied') { notify.hidden = true; return; }
      notify.hidden = false;
      if (Notification.permission === 'granted') {
        notify.innerHTML = '<p class="muted small">🔔 응답이 오면 휴대폰 알림으로도 알려 드려요.</p>';
        subscribeFor(newest.id, key);
        return;
      }
      if (!notify.querySelector('button')) {
        notify.innerHTML = '<button type="button" class="btn">🔔 응답 오면 휴대폰 알림으로 받기</button>' +
          '<p class="muted small">다른 앱을 보고 있어도 휴대폰 알림창에 차주 응답이 떠요. 이 연락에만 쓰여요.</p>';
        notify.querySelector('button').onclick = function () {
          Promise.resolve(Notification.requestPermission()).then(function (p) {
            if (p !== 'granted') { notify.hidden = true; return; }
            var it = Object.keys(items).map(function (k) { return items[k]; })
              .sort(function (a, b) { return b.at - a.at; })[0];
            notify.innerHTML = '<p class="muted small">🔔 응답이 오면 휴대폰 알림으로도 알려 드려요.</p>';
            subscribeFor(it.id, key);
          });
        };
      }
    };

    var addItem = function (id, at) {
      if (items[id]) return items[id];
      var el = document.createElement('div');
      el.className = 'sent-item';
      el.innerHTML = '<p class="muted sent-msg"></p><div class="sent-status"></div>';
      return (items[id] = { id: id, el: el, status: 'sent', at: at });
    };

    // 이 휴대폰으로 이 차량에 보낸 연락(최근 5건)을 다시 보여 줌
    loadSent().filter(function (x) { return x.code === code; }).slice(0, 5).forEach(function (x) {
      var it = addItem(x.id, x.at);
      it.status = 'loading';
      refresh(it).then(function () { if (it.status === 'loading') { it.status = 'sent'; paint(); } });
    });
    paint();

    // 직접 입력 칸에 쓰면 위 선택을 해제(이 내용이 감), 문장을 고르면 입력 칸을 비움
    var custom = form.querySelector('textarea[name=custom]');
    var radios = form.querySelectorAll('input[name=tpl]');
    var resetChoice = function () { if (!form.querySelector('input[name=tpl]:checked')) radios[0].checked = true; };
    custom.addEventListener('input', function () {
      if (custom.value.trim()) radios.forEach(function (r) { r.checked = false; });
      else resetChoice();
    });
    radios.forEach(function (r) { r.addEventListener('change', function () { custom.value = ''; }); });

    if (canSend) countdown(btn, Number(form.dataset.wait));

    form.addEventListener('submit', function (e) {
      if (!window.fetch || !canSend) return;
      e.preventDefault();
      if (btn.disabled) return;
      ParkSound.unlock();
      btn.disabled = true;
      btn.textContent = '보내는 중…';
      msg.innerHTML = '';
      fetch(form.action, {
        method: 'POST',
        headers: { 'X-Requested-With': 'fetch' },
        body: withSender(new URLSearchParams(new FormData(form))),
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d.ok) {
          msg.innerHTML = '<div class="flash err">' + d.error + '</div>';
          countdown(btn, d.wait || 0);
          return;
        }
        saveSent(d.id, code);
        custom.value = '';
        resetChoice();
        var it = addItem(d.id, Date.now());
        apply(it, { status: d.status, message: d.message, created_at: Date.now() });
        result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        countdown(btn, d.wait);
      }).catch(function () {
        btn.disabled = false;
        form.submit();   // 스크립트 방식이 실패하면 예전 방식으로
      });
    });
  }

  // ───────── 보낸 뒤 화면(/a/…, 스크립트 없이 보냈을 때) ─────────
  var status = document.getElementById('status');
  if (status) {
    var inner = document.createElement('div');
    inner.className = 'sent-status';
    while (status.firstChild) inner.appendChild(status.firstChild);
    status.appendChild(inner);
    items[status.dataset.id] = { id: status.dataset.id, el: status, status: status.dataset.status, at: Date.now(), page: true };
    document.addEventListener('pointerdown', ParkSound.unlock, { once: true });
    var resend = document.querySelector('.resend-btn');
    countdown(resend, Number(resend.dataset.wait));
    resend.onclick = function () { location.href = resend.dataset.href; };
  }
})();
