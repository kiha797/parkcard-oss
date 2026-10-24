// 자동 갱신: 열어 둔 화면(설치한 앱 포함)이 새 배포를 알아채면 스스로 새로고침
//  - 화면으로 돌아올 때, 그리고 5분마다 /version 확인
//  - 입력 중이거나 보내는 중이면 기다렸다가, 30초 동안 손대지 않으면 새로고침
//  - 기다리는 동안은 위쪽에 '새 버전 · 새로고침' 안내
(function () {
  var meta = document.querySelector('meta[name="app-version"]');
  if (!meta || !window.fetch) return;
  var current = meta.content, fresh = false, lastTouch = Date.now(), bar = null;

  ['pointerdown', 'keydown', 'input'].forEach(function (ev) {
    document.addEventListener(ev, function () { lastTouch = Date.now(); }, true);
  });

  // 지금 새로고침해도 잃는 게 없는지
  function safe() {
    var el = document.activeElement;
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return false;
    var typed = [].some.call(document.querySelectorAll('textarea, input[type=text], input[type=tel], input:not([type])'), function (i) {
      return i.value && i.value !== i.defaultValue;
    });
    if (typed) return false;
    var busy = [].some.call(document.querySelectorAll('button'), function (b) { return /중…$/.test(b.textContent.trim()); });
    return !busy && Date.now() - lastTouch > 30000;
  }

  function showBar() {
    if (bar) return;
    bar = document.createElement('div');
    bar.className = 'update-bar';
    bar.innerHTML = '새 버전이 있어요 <button type="button">새로고침</button>';
    bar.querySelector('button').onclick = function () { location.reload(); };
    document.body.appendChild(bar);
  }

  function tryReload(returning) {
    if (!fresh) return;
    // 화면으로 막 돌아온 순간은 아직 아무것도 안 했으므로 바로 새로고침
    if ((returning && !document.hidden && safeExceptIdle()) || safe()) location.reload();
    else showBar();
  }
  function safeExceptIdle() { var t = lastTouch; lastTouch = 0; var ok = safe(); lastTouch = t; return ok; }

  function check(returning) {
    fetch('/version', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.v && d.v !== current) fresh = true;
      tryReload(returning);
    }).catch(function () { /* 오프라인 등 — 다음에 다시 */ });
  }

  document.addEventListener('visibilitychange', function () { if (!document.hidden) check(true); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) check(true); });
  setInterval(function () { if (!document.hidden) check(false); }, 5 * 60 * 1000);
  setInterval(function () { if (fresh) tryReload(false); }, 10000);
})();
