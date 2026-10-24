// 소리 도우미 (연락하는 사람·차주 화면 공용)
//  - chime(): 딩-동-댕 + 진동
//  - unlock(): 브라우저는 사용자가 화면을 누른 뒤에만 소리를 허락하므로, 누르는 순간 미리 깨워 둠
window.ParkSound = (function () {
  var ctx = null, unlocked = false;

  function audio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function unlock() {
    try {
      var a = audio();
      if (a) {
        var o = a.createOscillator(), g = a.createGain();
        g.gain.value = 0;
        o.connect(g); g.connect(a.destination);
        o.start(); o.stop(a.currentTime + 0.02);
      }
      unlocked = true;
    } catch (e) { /* 소리를 못 내는 환경 */ }
  }

  function chime() {
    try {
      var a = audio();
      if (a) {
        var t = a.currentTime + 0.05;
        [[880, 0], [1175, 0.2], [1568, 0.4]].forEach(function (n) {
          var o = a.createOscillator(), g = a.createGain();
          o.type = 'sine';
          o.frequency.value = n[0];
          g.gain.setValueAtTime(0.0001, t + n[1]);
          g.gain.exponentialRampToValueAtTime(0.5, t + n[1] + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + n[1] + 0.45);
          o.connect(g); g.connect(a.destination);
          o.start(t + n[1]); o.stop(t + n[1] + 0.5);
        });
      }
    } catch (e) { /* 무시 */ }
    if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
  }

  return { unlock: unlock, chime: chime, isUnlocked: function () { return unlocked; } };
})();
