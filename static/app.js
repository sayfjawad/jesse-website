(function () {
  const STRINGS = window.STROOM_STRINGS || {};
  const Y_MAX_DEFAULT = 0.35;
  let currentLang = (window.STROOM_INITIAL_LANG || 'nl');
  let currentPeriod = 'today';
  let dataCache = { today: window.STROOM_TODAY || null, tomorrow: null, week: null };

  function t(key) {
    const s = STRINGS[currentLang] || {};
    return s[key] != null ? s[key] : key;
  }

  function fmtEur(p, digits) {
    const d = (typeof digits === 'number') ? digits : 3;
    const sign = p < 0 ? '-' : '';
    return sign + p.toFixed(d).replace('.', ',');
  }

  function classify(price, avg) {
    if (avg <= 0) return 'hold';
    if (price <= avg * 0.78) return 'buy';
    if (price >= avg * 1.30) return 'sell';
    return 'hold';
  }

  function renderHourlyChart(hours) {
    const chart = document.getElementById('chart');
    if (!chart) return;
    chart.innerHTML = '';
    if (!hours || !hours.length) {
      const e = document.createElement('div');
      e.className = 'empty-state';
      e.textContent = t('empty.tomorrow');
      chart.appendChild(e);
      return;
    }
    const yMax = Math.max(Y_MAX_DEFAULT, ...hours.map(h => h.price));
    const avg = hours.reduce((s, h) => s + h.price, 0) / hours.length;

    const yg = document.createElement('div');
    yg.className = 'y-grid';
    [0.30, 0.20, 0.10, 0.00].forEach(s => {
      const l = document.createElement('div');
      l.className = 'l';
      l.innerHTML = '<span>€' + s.toFixed(2) + '</span>';
      yg.appendChild(l);
    });
    chart.appendChild(yg);

    const nowH = new Date().getHours();
    const bars = document.createElement('div');
    bars.className = 'bars-row';
    hours.forEach(h => {
      const b = document.createElement('div');
      const cls = h.classification || classify(h.price, avg);
      b.className = 'bar ' + cls + (currentPeriod === 'today' && h.hour === nowH ? ' now' : '');
      b.style.height = (h.price / yMax * 100) + '%';
      b.innerHTML = '<span class="tip">' + String(h.hour).padStart(2, '0') + ':00 · €' + fmtEur(h.price) + '</span>';
      bars.appendChild(b);
    });
    chart.appendChild(bars);

    const xrow = document.createElement('div');
    xrow.className = 'x-row';
    hours.forEach(h => {
      const c = document.createElement('div');
      c.className = 'x';
      c.textContent = (h.hour % 3 === 0) ? String(h.hour).padStart(2, '0') : '';
      xrow.appendChild(c);
    });
    chart.appendChild(xrow);
  }

  function renderWeekChart(days) {
    const chart = document.getElementById('chart');
    if (!chart) return;
    chart.innerHTML = '';
    if (!days || !days.length) {
      const e = document.createElement('div');
      e.className = 'empty-state';
      e.textContent = '—';
      chart.appendChild(e);
      return;
    }
    const yMax = Math.max(Y_MAX_DEFAULT, ...days.map(d => d.high));
    const yg = document.createElement('div');
    yg.className = 'y-grid';
    [0.30, 0.20, 0.10, 0.00].forEach(s => {
      const l = document.createElement('div');
      l.className = 'l';
      l.innerHTML = '<span>€' + s.toFixed(2) + '</span>';
      yg.appendChild(l);
    });
    chart.appendChild(yg);

    const bars = document.createElement('div');
    bars.className = 'bars-row';
    bars.style.gap = '14px';
    days.forEach(d => {
      const b = document.createElement('div');
      b.className = 'bar hold';
      b.style.height = (d.avg / yMax * 100) + '%';
      b.innerHTML = '<span class="tip">' + d.day_short + ' · €' + fmtEur(d.avg) + '</span>';
      bars.appendChild(b);
    });
    chart.appendChild(bars);

    const xrow = document.createElement('div');
    xrow.className = 'x-row';
    xrow.style.gap = '14px';
    days.forEach(d => {
      const c = document.createElement('div');
      c.className = 'x';
      c.textContent = d.day_short;
      xrow.appendChild(c);
    });
    chart.appendChild(xrow);
  }

  // Beste aaneengesloten vensters van 3 uur (kopen = laagste, verkopen = hoogste)
  function renderWindows(hours) {
    const buyEl = document.getElementById('buy-windows');
    const sellEl = document.getElementById('sell-windows');
    if (!buyEl || !sellEl || !hours || hours.length < 3) return;
    const avg = hours.reduce((s, h) => s + h.price, 0) / hours.length;
    const byHour = {};
    hours.forEach(h => { byHour[h.hour] = h.price; });

    const windows = [];
    for (let start = 0; start <= hours.length - 3; start++) {
      const slice = [byHour[start], byHour[start + 1], byHour[start + 2]];
      if (slice.some(v => v == null)) continue;
      const sum = slice[0] + slice[1] + slice[2];
      windows.push({ start, sum, avg: sum / 3 });
    }
    windows.sort((a, b) => a.sum - b.sum);
    const cheapest = windows.slice(0, 3);
    const dearest = windows.slice(-3).reverse();

    function row(idx, w, kind) {
      const delta = avg > 0 ? ((w.avg - avg) / avg) * 100 : 0;
      const cls = delta < 0 ? 'dn' : 'up';
      const sign = delta >= 0 ? '+' : '';
      return '<div class="win-row">' +
        '<span class="nm">' + (idx + 1) + '</span>' +
        '<div class="tm">' + String(w.start).padStart(2, '0') + ':00 – ' +
          String((w.start + 3) % 24).padStart(2, '0') + ':00</div>' +
        '<span class="delta ' + cls + '">' + sign + delta.toFixed(0) + '%</span>' +
        '<span class="pr">€' + fmtEur(w.avg) + '</span>' +
        '</div>';
    }

    buyEl.innerHTML = cheapest.map((w, i) => row(i, w, 'buy')).join('');
    sellEl.innerHTML = dearest.map((w, i) => row(i, w, 'sell')).join('');
  }

  async function loadPeriod(period) {
    currentPeriod = period;
    if (period === 'week') {
      if (!dataCache.week) {
        const r = await fetch('/api/prices/week');
        const j = await r.json();
        dataCache.week = j.days || [];
      }
      renderWeekChart(dataCache.week);
      return;
    }
    if (!dataCache[period]) {
      const r = await fetch('/api/prices?day=' + period);
      const j = await r.json();
      dataCache[period] = j.hours || [];
    }
    renderHourlyChart(dataCache[period]);
  }

  function setLang(l) {
    currentLang = l;
    document.documentElement.lang = l;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n');
      if (STRINGS[l] && STRINGS[l][k] != null) el.innerHTML = STRINGS[l][k];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const k = el.getAttribute('data-i18n-placeholder');
      if (STRINGS[l] && STRINGS[l][k] != null) el.setAttribute('placeholder', STRINGS[l][k]);
    });
    document.querySelectorAll('#lang button').forEach(b => {
      b.classList.toggle('on', b.dataset.lang === l);
    });
    try { localStorage.setItem('stroomprijs.lang', l); } catch (e) {}
    document.cookie = 'lang=' + l + '; path=/; max-age=' + (60 * 60 * 24 * 365);
  }

  function initLangToggle() {
    document.querySelectorAll('#lang button').forEach(b => {
      b.addEventListener('click', () => setLang(b.dataset.lang));
    });
    try {
      const stored = localStorage.getItem('stroomprijs.lang');
      if (stored && stored !== currentLang) setLang(stored);
    } catch (e) {}
  }

  function initPeriodToggle() {
    document.querySelectorAll('#period button').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#period button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        loadPeriod(b.dataset.period);
      });
    });
  }

  function initLiveClock() {
    const el = document.querySelector('[data-live-clock]');
    if (!el) return;
    function tick() {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      el.textContent = 'Live · ' + hh + ':' + mm;
    }
    tick();
    setInterval(tick, 30 * 1000);
  }

  function initSubscribe() {
    const form = document.getElementById('sub-form');
    if (!form) return;
    const msg = document.getElementById('sub-msg');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = form.querySelector('input[type=email]').value;
      msg.textContent = '...';
      try {
        const r = await fetch('/api/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, language: currentLang }),
        });
        if (!r.ok) throw new Error('http ' + r.status);
        msg.textContent = t('sb.success');
        form.querySelector('input[type=email]').value = '';
      } catch (err) {
        msg.textContent = t('sb.error');
      }
      setTimeout(() => { msg.textContent = ''; }, 8000);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initLangToggle();
    initPeriodToggle();
    initLiveClock();
    initSubscribe();
    if (dataCache.today) {
      renderHourlyChart(dataCache.today);
      renderWindows(dataCache.today);
    } else {
      loadPeriod('today').then(() => renderWindows(dataCache.today));
    }
  });
})();