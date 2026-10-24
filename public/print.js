// 차주 출력 화면: 전화 연결 번호를 QR에 넣기 — 이 휴대폰 안에서만 처리
//  - 입력하는 대로 QR을 바로 다시 만들고, 이 휴대폰(브라우저)에 자동 저장
//  - 지금 QR에 무엇이 들어 있는지 그대로 보여 줌
//  번호는 주소의 # 뒷부분에 들어가므로 QR을 찍어도 서버로 전송되지 않음
(function () {
  var box = document.getElementById('tel-box');
  if (!box || !window.QRCode) return;
  var base = box.dataset.url, code = box.dataset.code, KEY = 'parkcard-tel-' + code;
  var input = document.getElementById('tel'), msg = document.getElementById('tel-msg'), info = document.getElementById('qr-info');
  var shown = null;   // 지금 QR에 들어 있는 번호 (없으면 '')

  // 휴대폰·지역번호·050 안심번호(0으로 시작 9~12자리) 또는 15xx·16xx·18xx 대표번호
  function digits(s) {
    var d = String(s || '').replace(/\D/g, '');
    return /^0\d{8,11}$/.test(d) || /^1[568]\d{6}$/.test(d) ? d : null;
  }
  function pretty(d) {
    if (d.indexOf('02') === 0) return d.replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3');
    if (d.length === 8) return d.replace(/^(\d{4})(\d{4})$/, '$1-$2');
    if (d.indexOf('050') === 0 && d.length === 11) return d.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1-$2-$3');
    if (d.length === 12) return d.replace(/^(\d{4})(\d{4})(\d{4})$/, '$1-$2-$3');
    if (d.length === 11) return d.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3');
    return d.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // QR 다시 만들기 + 안에 든 내용 표시
  function render(tel) {
    if (tel === shown) return;
    shown = tel;
    var text = tel ? base + '#T' + tel : base;
    var list = document.querySelectorAll('.qr');
    QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'H', margin: 4, color: { dark: '#000000', light: '#ffffff' } })
      .then(function (svg) { for (var i = 0; i < list.length; i++) list[i].innerHTML = svg; });
    info.innerHTML =
      '<div class="qi-title">🔎 지금 QR에 들어 있는 내용</div>' +
      '<div class="qi-row"><span>연락 화면</span><b>카드 ' + esc(code) + '</b></div>' +
      '<div class="qi-row"><span>📞 전화 버튼</span>' +
        (tel ? '<b class="on">' + esc(pretty(tel)) + '</b>' : '<b class="off">없음</b>') + '</div>' +
      '<div class="qi-raw">' + esc(text) + '</div>';
  }

  function save(tel) { try { tel ? localStorage.setItem(KEY, tel) : localStorage.removeItem(KEY); } catch (e) { /* 저장 못 하는 환경 */ } }

  // 입력하는 대로: 비우면 번호 없이, 올바른 번호가 되면 그 번호로. 입력 중(미완성)이면 기존 QR 유지
  var timer;
  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var raw = input.value.trim(), tel = digits(raw);
      if (!raw) { save(null); render(''); msg.innerHTML = '<span class="ok">전화 번호 없이 저장했어요.</span>'; return; }
      if (!tel) { msg.innerHTML = '<span class="wait">번호를 끝까지 입력해 주세요… (지금 QR은 바뀌지 않았어요)</span>'; return; }
      save(tel); render(tel);
      msg.innerHTML = '<span class="ok">✅ 저장했어요. QR에 번호가 들어갔어요.</span>';
    }, 250);
  });

  var saved = null;
  try { saved = digits(localStorage.getItem(KEY)); } catch (e) { /* 무시 */ }
  if (saved) { input.value = pretty(saved); msg.innerHTML = '<span class="ok">이 휴대폰에 저장된 번호가 QR에 들어 있어요.</span>'; }
  render(saved || '');
})();
