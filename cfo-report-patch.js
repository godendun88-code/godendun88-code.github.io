(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const txt = id => {
    const el = $(id);
    return el ? String(el.textContent || '').trim() : '-';
  };
  const set = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value == null || value === '' ? '-' : String(value);
  };
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt = (value, digits) => Number(value || 0).toLocaleString('ko-KR',{minimumFractionDigits:digits||0,maximumFractionDigits:digits||0});
  const fmtDate = value => {
    if (!value) return '-';
    const raw = value instanceof Date ? value : new Date(String(value).slice(0,10) + 'T00:00:00');
    if (Number.isNaN(raw.getTime())) return String(value);
    return raw.getFullYear()+'.'+String(raw.getMonth()+1).padStart(2,'0')+'.'+String(raw.getDate()).padStart(2,'0');
  };
  const money = value => {
    const n = Number(value)||0;
    return n>=1e8 ? fmt(n/1e8,2)+'억원' : fmt(Math.round(n/1e4),0)+'만원';
  };

  function installStyle(){
    if ($('cfoReportStyle')) return;
    const s=document.createElement('style');
    s.id='cfoReportStyle';
    s.textContent=
      '.workspace-nav.workspace-nav-groups:has(#cfoReportTab){grid-template-columns:repeat(4,minmax(0,1fr))}'+
      '.workspace-nav.workspace-nav-groups:has(#cfoReportTab):has(#sourceTab:not([hidden])){grid-template-columns:repeat(5,minmax(0,1fr))}'+
      '.workspace-nav-cfo{display:flex}.workspace-nav-cfo .workspace-nav-group-tabs{grid-template-columns:1fr}'+
      '.cfo-workspace{display:none;margin:0 0 18px}body.cfo-mode .cfo-workspace{display:block}body.cfo-mode .grid,body.cfo-mode #dataFreshness{display:none!important}'+
      '.cfo-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}.cfo-head h2{margin:0 0 5px;font-size:21px;color:#14243c}.cfo-asof{font-size:12px;color:#667085}.cfo-copy{border:1px solid #087f70;background:#087f70;color:#fff;border-radius:10px;padding:9px 13px;font-weight:900;cursor:pointer}'+
      '.cfo-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.cfo-card{padding:16px;border:1px solid #e1e7ef;border-radius:14px;background:#fff;box-shadow:0 5px 16px rgba(15,23,42,.04)}.cfo-card .label{font-size:11px;color:#667085;font-weight:800}.cfo-card .value{margin-top:9px;font-size:21px;font-weight:950;color:#14243c}.cfo-card .detail{margin-top:7px;font-size:11px;line-height:1.5;color:#667085}'+
      '.cfo-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px;margin-top:14px}.cfo-panel{grid-column:span 6;padding:18px;border:1px solid #e1e7ef;border-radius:14px;background:#fff}.cfo-panel.full{grid-column:span 12}.cfo-panel h3{margin:0 0 12px;font-size:15px}'+
      '.cfo-risk{padding:14px;border:1px solid #fde0a3;border-radius:12px;background:#fff8e8}.cfo-risk.good{border-color:#b8ead6;background:#ecfdf5}.cfo-risk .big{font-size:24px;font-weight:950;color:#b45309}.cfo-risk.good .big{color:#087f70}.cfo-row{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid #edf1f5;font-size:12px}.cfo-row:last-child{border-bottom:0}.cfo-row b{text-align:right}'+
      '.cfo-fx-note{margin-top:12px;padding:12px;border-radius:10px;background:#f8fafc;color:#475467;font-size:12px;line-height:1.65;white-space:pre-line}.cfo-table-wrap{overflow:auto;max-height:290px;border:1px solid #e1e7ef;border-radius:10px}.cfo-table{width:100%;border-collapse:collapse;min-width:720px}.cfo-table th,.cfo-table td{padding:10px 12px;border-bottom:1px solid #edf1f5;text-align:right;font-size:12px}.cfo-table th{background:#f6f8fb;color:#526174;position:sticky;top:0}.cfo-table th:first-child,.cfo-table td:first-child,.cfo-table th:nth-child(2),.cfo-table td:nth-child(2){text-align:left}.cfo-summary{font-size:13px;line-height:1.75;color:#334155;white-space:pre-line}'+
      '@media(max-width:1000px){.workspace-nav.workspace-nav-groups:has(#cfoReportTab),.workspace-nav.workspace-nav-groups:has(#cfoReportTab):has(#sourceTab:not([hidden])){grid-template-columns:repeat(2,minmax(0,1fr))}.cfo-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.cfo-panel{grid-column:span 12}}@media(max-width:560px){.cfo-kpis{grid-template-columns:1fr}.cfo-head{flex-direction:column}.cfo-copy{width:100%}}';
    document.head.appendChild(s);
  }

  function createWorkspace(){
    if ($('cfoWorkspace')) return $('cfoWorkspace');
    const node=document.createElement('section');
    node.className='cfo-workspace';
    node.id='cfoWorkspace';
    node.innerHTML=
      '<div class="cfo-head"><div><h2>CFO 자금상황 보고</h2><div class="cfo-asof" id="cfoAsOf">현재 연결자료 확인 중</div></div><button type="button" class="cfo-copy" id="cfoCopyBtn">보고문구 복사</button></div>'+
      '<div class="cfo-kpis">'+
      '<div class="cfo-card"><div class="label">현재 총 자금</div><div class="value" id="cfoTotal">-</div><div class="detail">일일 마감잔액 · 보고서 기준</div></div>'+
      '<div class="cfo-card"><div class="label">원화 가용잔액</div><div class="value" id="cfoKrw">-</div><div class="detail">외화 평가액·별도 정기예금 제외</div></div>'+
      '<div class="cfo-card"><div class="label">USD 잔액</div><div class="value" id="cfoUsd">-</div><div class="detail">일일 마감 USD 원금</div></div>'+
      '<div class="cfo-card"><div class="label">자금운용 잔액</div><div class="value" id="cfoDeposits">-</div><div class="detail" id="cfoDepositDetail">등록 예치금 기준</div></div>'+
      '<div class="cfo-card"><div class="label">현재 USD/KRW</div><div class="value" id="cfoFxRate">-</div><div class="detail" id="cfoFxSource">KB STAR FX 기준</div></div>'+
      '</div>'+
      '<div class="cfo-grid">'+
      '<section class="cfo-panel"><h3>환전 필요 리스크</h3><div class="cfo-risk" id="cfoExchangeRisk"><div class="label">최소 환전 필요액</div><div class="big" id="cfoExchangeUsd">-</div><div class="cfo-row"><span>권장 실행일</span><b id="cfoExchangeDate">-</b></div><div class="cfo-row"><span>원화 부족 예상일</span><b id="cfoShortageDate">-</b></div><div class="cfo-row"><span>적용 기준환율</span><b id="cfoExchangeRate">-</b></div><div class="cfo-row"><span>예상 원화 확보액</span><b id="cfoExchangeKrw">-</b></div></div></section>'+
      '<section class="cfo-panel"><h3>현재 환율상황 · 전망</h3><div class="cfo-row"><span>단기 방향성</span><b id="cfoFxDirection">-</b></div><div class="cfo-row"><span>5영업일 예상 Range</span><b id="cfoFxRange">-</b></div><div class="cfo-fx-note" id="cfoFxNote">환율 분석 연결 대기</div></section>'+
      '<section class="cfo-panel full"><h3>자금운용 내역</h3><div class="cfo-table-wrap"><table class="cfo-table"><thead><tr><th>금융기관</th><th>상품</th><th>예치금액</th><th>금리</th><th>만기일</th><th>상태</th></tr></thead><tbody id="cfoDepositBody"><tr><td colspan="6" style="text-align:center;color:#667085">자금운용 내역 연결 대기</td></tr></tbody></table></div></section>'+
      '<section class="cfo-panel full"><h3>보고 핵심 요약</h3><div class="cfo-summary" id="cfoSummary">현재 연결자료를 확인하고 있습니다.</div></section>'+
      '</div>';
    return node;
  }

  function exchangeData(){
    try{return typeof exchangePlannerData==='function'?exchangePlannerData():null}catch(error){console.warn('CFO exchange data unavailable',error);return null}
  }
  function deposits(){
    try{return typeof depositProducts!=='undefined'&&Array.isArray(depositProducts)?depositProducts:[]}catch(error){return[]}
  }
  function maturity(item){
    try{return typeof depositMaturityStatus==='function'?depositMaturityStatus(item.maturity).label:'-'}catch(error){return'-'}
  }

  function render(){
    if (!$('cfoWorkspace')) return;
    const total=txt('dailyBalanceTotal'),krw=txt('dailyBalanceKrw'),usd=txt('dailyBalanceUsd'),dep=txt('currentDepositTotal'),rateNow=txt('currentRate'),direction=txt('direction'),range=txt('forecastRange');
    set('cfoTotal',total);set('cfoKrw',krw);set('cfoUsd',usd);set('cfoDeposits',dep);
    set('cfoDepositDetail','30일 내 만기 '+txt('currentDepositSoon')+' · 최근 만기 '+txt('currentDepositNextDate'));
    set('cfoFxRate',rateNow);set('cfoFxSource',txt('latestDate'));set('cfoFxDirection',direction);set('cfoFxRange',range);set('cfoFxNote',txt('reportText'));set('cfoAsOf',(txt('dailyBalanceAsOf')||'현재 연결자료')+' · CFO 보고 자동 요약');

    const data=exchangeData();
    let hasShort=false,exchangeText='계획 연결 대기',execute='-',shortageText='-',basis='-',krwReceipt='-';
    if(data){
      const recommended=Math.max(0,Number(data.recommended)||0),r=Number(data.rate)||0,shortage=data.before&&data.before.firstKrwShort;
      hasShort=!!shortage;
      if(hasShort){
        exchangeText=recommended>0?fmt(recommended,0)+' USD 매도':'환전 필요액 확인 필요';
        execute=data.date?fmtDate(data.date):'-';
        shortageText=shortage.dateObj?fmtDate(shortage.dateObj):(shortage.date?fmtDate(shortage.date):'-');
        basis=r?fmt(r,2)+'원/USD':'-';
        krwReceipt=recommended&&r?fmt(Math.round(recommended*r),0)+'원':'-';
      }else{
        exchangeText='계획기간 내 필요 없음';
        shortageText='원화 부족 예상 없음';
        basis=r?fmt(r,2)+'원/USD':'-';
      }
    }
    set('cfoExchangeUsd',exchangeText);set('cfoExchangeDate',execute);set('cfoShortageDate',shortageText);set('cfoExchangeRate',basis);set('cfoExchangeKrw',krwReceipt);
    if($('cfoExchangeRisk'))$('cfoExchangeRisk').classList.toggle('good',!!data&&!hasShort);

    const rows=deposits().slice().sort((a,b)=>String(a.maturity||'').localeCompare(String(b.maturity||'')));
    const body=$('cfoDepositBody');
    if(body){
      body.innerHTML=rows.length?rows.map(item=>'<tr><td>'+esc(item.bank||'-')+'</td><td>'+esc(item.product||'-')+'</td><td>'+esc(money(item.principal))+'</td><td>'+esc(fmt(Number(item.rate)||0,2))+'%</td><td>'+esc(String(item.maturity||'-').replaceAll('-','.'))+'</td><td>'+esc(maturity(item))+'</td></tr>').join(''):'<tr><td colspan="6" style="text-align:center;color:#667085">등록된 자금운용 내역이 없습니다.</td></tr>';
    }

    const summary=[
      '① 현재 총 자금 '+total+'이며, 원화 가용잔액 '+krw+', USD 잔액 '+usd+'입니다.',
      '② 자금운용 잔액은 '+dep+'이며, 30일 내 만기 도래액은 '+txt('currentDepositSoon')+', 가장 가까운 만기는 '+txt('currentDepositNextDate')+' ('+txt('currentDepositNextDetail')+')입니다.',
      hasShort?'③ 현 자금계획 기준 최소 환전 필요액은 '+exchangeText+'이며, 권장 실행일은 '+execute+', 원화 부족 예상일은 '+shortageText+'입니다.':'③ 현 자금계획 기준 계획기간 내 최소 필수환전은 발생하지 않습니다.',
      '④ 현재 원/달러 환율은 '+rateNow+'이며 단기 방향은 '+direction+', 5영업일 예상 범위는 '+range+'입니다.',
      '⑤ 환전 실행 전에는 실제 입출금 일정, 예금 만기 처리, 당시 은행 체결환율을 재확인합니다.'
    ];
    set('cfoSummary',summary.join('\n'));
  }

  function openReport(){
    if(!$('cfoWorkspace'))return;
    document.body.classList.add('cfo-mode');
    document.querySelectorAll('[data-cash-view]').forEach(btn=>btn.classList.toggle('active',btn.dataset.cashView==='cfo'));
    render();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function closeReport(){document.body.classList.remove('cfo-mode')}

  function install(){
    const nav=document.querySelector('.workspace-nav');
    if(!nav)return false;
    installStyle();

    if(!$('cfoWorkspace'))nav.insertAdjacentElement('afterend',createWorkspace());

    if(!$('cfoReportGroup')){
      const group=document.createElement('section');
      group.className='workspace-nav-group workspace-nav-cfo';
      group.id='cfoReportGroup';
      group.innerHTML='<div class="workspace-nav-group-title">보고</div><div class="workspace-nav-group-tabs"><button type="button" class="workspace-tab" id="cfoReportTab" data-cash-view="cfo">CFO 보고</button></div>';
      const sourceGroup=nav.querySelector('.workspace-nav-source');
      nav.insertBefore(group,sourceGroup||null);
    }
    const cfoTab=$('cfoReportTab');
    if(cfoTab&&!cfoTab.dataset.bound){cfoTab.dataset.bound='1';cfoTab.addEventListener('click',openReport)}

    if(!nav.dataset.cfoCloseBound){
      nav.dataset.cfoCloseBound='1';
      nav.addEventListener('click',event=>{
        const button=event.target.closest('.workspace-tab');
        if(button&&button.id!=='cfoReportTab')closeReport();
      },true);
    }

    const source=$('sourceTab');
    if(source)source.hidden=!(window.dashboardAuth&&window.dashboardAuth.isAdmin);

    const copy=$('cfoCopyBtn');
    if(copy&&!copy.dataset.bound){
      copy.dataset.bound='1';
      copy.addEventListener('click',async()=>{
        render();
        try{
          await navigator.clipboard.writeText(txt('cfoSummary'));
          const old=copy.textContent;copy.textContent='복사 완료';setTimeout(()=>copy.textContent=old,1200);
        }catch(error){console.warn('CFO copy failed',error)}
      });
    }
    return true;
  }

  let tries=0;
  const timer=setInterval(()=>{
    try{if(install()||++tries>120)clearInterval(timer)}catch(error){console.warn('CFO report install failed',error);if(++tries>120)clearInterval(timer)}
  },100);
  setInterval(()=>{try{install();if(document.body.classList.contains('cfo-mode'))render()}catch(error){console.warn('CFO report refresh failed',error)}},2000);
})();
