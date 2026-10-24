// 이 휴대폰에서 만든·연 내 카드(관리 링크)를 기억
//  - 관리 화면을 열 때마다 저장, 카드를 삭제하면 지움
//  - 앱 아이콘이 없어진 카드를 가리키거나, 카드 없이 열리면 저장된 내 카드로 바로 이동
window.MyCards = (function () {
  var KEY = 'parkcard-mycards';
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]').filter(function (x) { return x && x.token; }); }
    catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 10))); } catch (e) { /* 저장 못 하는 환경 */ }
  }
  return {
    load: load,
    add: function (card) {
      var list = load().filter(function (x) { return x.token !== card.token; });
      card.at = Date.now();
      list.unshift(card);
      save(list);
    },
    remove: function (token) { save(load().filter(function (x) { return x.token !== token; })); },
  };
})();

(function () {
  var box = document.getElementById('my-cards');
  if (!box) return;
  var mode = box.dataset.mode;          // home | missing | my
  if (box.dataset.bad) MyCards.remove(box.dataset.bad);   // 없어진 카드는 목록에서 뺌
  var list = MyCards.load();

  if (!list.length) {
    if (mode !== 'home') {
      box.hidden = false;
      box.innerHTML = '<p class="muted">이 휴대폰에 저장된 내 카드가 없어요.</p><a class="btn primary" href="/new">내 카드 만들기</a>';
    }
    return;
  }
  // 카드가 하나면 바로 그 카드로
  if (mode !== 'home' && list.length === 1) { location.replace('/m/' + encodeURIComponent(list[0].token)); return; }

  function esc(s) { return String(s || '').replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  box.hidden = false;
  box.innerHTML = '<h2>이 휴대폰의 내 카드</h2><div class="stack">' + list.map(function (c) {
    return '<a class="btn" href="/m/' + encodeURIComponent(c.token) + '">' +
      (c.nickname ? esc(c.nickname) + ' 차량 · ' : '') + '카드 <span class="mono">' + esc(c.code) + '</span></a>';
  }).join('') + '</div>';
})();
