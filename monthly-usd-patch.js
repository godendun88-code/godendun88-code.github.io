(() => {
  const monthPattern = /^20\d{2}-(0[1-9]|1[0-2])$/;
  let manualMonths = new Set();
  let lastSeries = [];

  const originalCurrentMonthlySeries = currentMonthlySeries;
  const originalOpenMonthlyUsdEditor = openMonthlyUsdEditor;

  const monthNext = key => {
    const [y, m] = key.split('-').map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  };

  const continuousMonths = (start, end, limit = 48) => {
    if (!monthPattern.test(start) || !monthPattern.test(end) || start > end) return [];
    const out = [];
    let key = start;
    while (key <= end && out.length < limit) {
      out.push(key);
      key = monthNext(key);
    }
    return out;
  };

  function synthesizeMonth(model, referenceRate, month) {
    const history = (model?.monthlyHistory || []).find(row => row.month === month) || null;
    const points = [...(model?.points || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const pointKeys = points.map(p => String(p.date || '').slice(0, 7)).filter(monthPattern.test.bind(monthPattern)).sort();
    const firstPointMonth = pointKeys[0] || '';
    const lastPointMonth = pointKeys.at(-1) || '';
    const covered = !!firstPointMonth && month >= firstPointMonth && month <= lastPointMonth;
    const point = points.filter(p => String(p.date || '').slice(0, 7) <= month).at(-1) || null;
    const status = reconciliationMonthStatus(month, model);
    const krwBalance = nullableCashNumber(history?.krwBalance) ?? nullableCashNumber(point?.krwBalance);
    if (krwBalance == null) return null;

    const sheetUsd = nullableCashNumber(history?.usdBalance);
    const pointUsd = covered ? nullableCashNumber(point?.usdBalance) : null;
    const preferSheet = month < currentMonthKey() || status === '확정';
    const baseUsdBalance = (preferSheet ? sheetUsd : null) ?? pointUsd ?? sheetUsd;
    const manualUsd = nullableCashNumber(monthlyUsdOverrides[month]);
    const usdBalance = baseUsdBalance ?? manualUsd;
    const usdSource = baseUsdBalance != null
      ? (preferSheet && sheetUsd != null ? '월 시트' : pointUsd != null ? '입출금 계획' : '월 시트')
      : manualUsd != null ? '보완 입력' : '미입력';
    const usdMissingReason = covered ? 'USD 잔액 확인 필요' : '입출금 계획 미연결';
    const fx = currentMonthlyFx(month, referenceRate, status);
    const usdConverted = usdBalance != null && fx.appliedRate > 0 ? usdBalance * fx.appliedRate : null;
    const totalBalance = krwBalance != null && usdConverted != null ? krwBalance + usdConverted : null;

    return {
      month, status, krwBalance, usdBalance, baseUsdBalance, usdSource, usdMissingReason,
      usdConverted, totalBalance, ...fx,
      sourceSheet: history?.sourceSheet || model?.sourceSheet || '',
      hasSheet: !!history,
      cashBasis: covered ? 'daily' : 'sheet',
      dailyCovered: covered,
      sheetKrwBalance: nullableCashNumber(history?.krwBalance),
      sourceKrwDifference: 0,
      bookSplit: false
    };
  }

  currentMonthlySeries = function(model, referenceRate) {
    const base = originalCurrentMonthlySeries(model, referenceRate);
    const rowMap = new Map(base.map(row => [row.month, row]));
    const sourceMonths = [
      ...(model?.monthlyHistory || []).map(row => row.month),
      ...(model?.points || []).map(point => String(point.date || '').slice(0, 7)),
      ...manualMonths
    ].filter(month => monthPattern.test(month) && month >= '2026-01').sort();

    if (!sourceMonths.length) return base;
    const start = sourceMonths[0];
    const end = sourceMonths.at(-1);
    const months = continuousMonths(start, end);

    for (const month of months) {
      if (rowMap.has(month)) continue;
      const row = synthesizeMonth(model, referenceRate, month);
      if (row) rowMap.set(month, row);
    }
    return [...rowMap.values()].sort((a, b) => a.month.localeCompare(b.month));
  };

  function captureEditorDraft() {
    const draft = {};
    document.querySelectorAll('[data-monthly-usd]').forEach(input => {
      draft[input.dataset.monthlyUsd] = input.value;
    });
    return draft;
  }

  function editorRow(month, seriesMap, draft) {
    const row = seriesMap.get(month);
    const value = Object.prototype.hasOwnProperty.call(draft, month)
      ? draft[month]
      : monthlyUsdOverrides[month] != null ? String(monthlyUsdOverrides[month]) : '';
    const status = row?.status || (month < currentMonthKey() ? '미확정' : '예상');
    const reason = row?.usdMissingReason || '관리자 추가 월 · 원화 계획 미연결';
    const removable = manualMonths.has(month);
    return `<tr data-monthly-row="${esc(month)}"><td>${esc(month)}</td><td>${esc(status)}</td><td>${esc(reason)}</td><td><input data-monthly-usd="${esc(month)}" aria-label="${esc(month)} USD 월말잔액" type="number" step="0.01" inputmode="decimal" placeholder="USD 숫자만 입력" value="${esc(value)}"></td><td>${removable ? `<button type="button" class="monthly-usd-remove" data-remove-month="${esc(month)}">삭제</button>` : ''}</td></tr>`;
  }

  renderMonthlyUsdEditor = function(series) {
    const editor = $('monthlyUsdEditor');
    editor.hidden = !window.dashboardAuth?.isAdmin;
    if (editor.hidden) return;
    lastSeries = Array.isArray(series) ? series : [];
    const draft = captureEditorDraft();
    const seriesMap = new Map(lastSeries.map(row => [row.month, row]));
    const months = [...new Set([
      ...lastSeries.filter(row => row.baseUsdBalance == null).map(row => row.month),
      ...manualMonths
    ])].filter(month => monthPattern.test(month)).sort();

    $('monthlyUsdInputBody').innerHTML = months.length
      ? months.map(month => editorRow(month, seriesMap, draft)).join('')
      : '<tr><td colspan="5" style="text-align:center">모든 월의 USD 잔액이 Excel과 연결되어 있습니다.</td></tr>';
    $('monthlyUsdSaveBtn').disabled = !months.length;
  };

  setMonthlyUsdBalances = function(rows) {
    const clean = Array.isArray(rows) ? rows.filter(row => monthPattern.test(row?.month || '') && row.month >= '2026-01') : [];
    manualMonths = new Set(clean.map(row => row.month));
    monthlyUsdOverrides = Object.fromEntries(clean
      .filter(row => typeof row.amount === 'number' && Number.isFinite(row.amount))
      .map(row => [row.month, row.amount]));
    if (cashModel) renderCurrentOverview(cashModel);
  };

  collectMonthlyUsdBalances = function() {
    const next = new Map();
    for (const month of manualMonths) next.set(month, null);
    for (const [month, amount] of Object.entries(monthlyUsdOverrides)) next.set(month, amount);

    document.querySelectorAll('[data-monthly-usd]').forEach(input => {
      const month = input.dataset.monthlyUsd;
      const text = input.value.trim();
      if (input.validity?.badInput) throw new Error(`${month} USD 잔액은 숫자로 입력해 주세요.`);
      if (!text) {
        if (manualMonths.has(month)) next.set(month, null);
        else next.delete(month);
        return;
      }
      const amount = Number(text.replace(/,/g, ''));
      if (!Number.isFinite(amount)) throw new Error(`${month} USD 잔액은 숫자로 입력해 주세요.`);
      next.set(month, amount);
    });

    return [...next.entries()]
      .filter(([month]) => monthPattern.test(month) && month >= '2026-01')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount }));
  };

  openMonthlyUsdEditor = function(month = '') {
    originalOpenMonthlyUsdEditor(month);
    if (!month) return;
    const input = document.querySelector(`[data-monthly-usd="${month}"]`);
    input?.focus({ preventScroll: true });
  };

  function addMonthControls() {
    const editor = $('monthlyUsdEditor');
    if (!editor || document.getElementById('monthlyUsdAddMonthBtn')) return;

    const help = editor.querySelector('.input-help');
    const controls = document.createElement('div');
    controls.className = 'deposit-editor-actions';
    controls.style.margin = '0 0 12px';
    controls.innerHTML = `
      <input id="monthlyUsdAddMonthInput" type="month" min="2026-01" aria-label="추가할 월" style="width:170px;max-width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;text-align:left">
      <button type="button" id="monthlyUsdAddMonthBtn">+ 월 추가</button>
      <span class="deposit-editor-status" id="monthlyUsdAddMonthStatus">필요한 월을 직접 추가할 수 있습니다.</span>`;
    help.insertAdjacentElement('afterend', controls);

    const header = editor.querySelector('thead tr');
    if (header && !header.querySelector('[data-monthly-manage-head]')) {
      header.insertAdjacentHTML('beforeend', '<th data-monthly-manage-head>관리</th>');
    }

    $('monthlyUsdAddMonthBtn').addEventListener('click', () => {
      const input = $('monthlyUsdAddMonthInput');
      const status = $('monthlyUsdAddMonthStatus');
      const month = input.value;
      if (!monthPattern.test(month) || month < '2026-01') {
        status.textContent = '추가할 월을 YYYY-MM 형식으로 선택해 주세요.';
        return;
      }
      const existing = new Set([
        ...lastSeries.map(row => row.month),
        ...manualMonths,
        ...document.querySelectorAll('[data-monthly-usd]')
      ].map(item => typeof item === 'string' ? item : item.dataset?.monthlyUsd).filter(Boolean));
      if (existing.has(month)) {
        status.textContent = `${month}은(는) 이미 목록에 있습니다.`;
        openMonthlyUsdEditor(month);
        return;
      }
      manualMonths.add(month);
      monthlyUsdEditorDirty = true;
      renderMonthlyUsdEditor(lastSeries);
      status.textContent = `${month}을(를) 추가했습니다. USD 잔액 입력 후 저장해 주세요.`;
      input.value = '';
      document.querySelector(`[data-monthly-usd="${month}"]`)?.focus();
    });

    $('monthlyUsdInputBody').addEventListener('click', event => {
      const button = event.target.closest('[data-remove-month]');
      if (!button) return;
      const month = button.dataset.removeMonth;
      manualMonths.delete(month);
      delete monthlyUsdOverrides[month];
      monthlyUsdEditorDirty = true;
      renderMonthlyUsdEditor(lastSeries);
      $('monthlyUsdSaveStatus').textContent = `${month}을(를) 목록에서 제거했습니다. 저장 버튼을 눌러 확정해 주세요.`;
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addMonthControls, { once: true });
  else addMonthControls();
})();