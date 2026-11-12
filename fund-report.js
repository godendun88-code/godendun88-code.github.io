(()=>{
  'use strict';
  const KEY='act.fund-report.v2';
  let reportOpen=false, installed=false;
  const $=id=>document.getElementById(id);
  const n=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0};
  const admin=()=>window.dashboardAuth?.isAdmin===true;
  const read=()=>{try{const old=JSON.parse(localStorage.getItem(KEY)||'{}');if('scenario' in old){const isUpside=old.scenario==='upside';return {name:isUpside?'업사이드':'베이스',krw:isUpside?n(old.upsideKrw):n(old.baseKrw),usd:n(isUpside?old.upsideUsd:old.baseUsd),note:String(old.note||'')}}return {...{name:'',krw:0,usd:0,note:''},...old}}catch(_){return {name:'',krw:0,usd:0,note:''}}};
  const write=value=>localStorage.setItem(KEY,JSON.stringify(value));
  const won=value=>{try{return typeof fmtKrw==='function'?fmtKrw(value):Math.round(n(value)).toLocaleString('ko-KR')+'원'}catch(_){return Math.round(n(value)).toLocaleString('ko-KR')+'원'}};
  const usd=value=>{try{return typeof fmt==='function'?fmt(value,0)+' USD':Math.round(n(value)).toLocaleString('ko-KR')+' USD'}catch(_){return Math.round(n(value)).toLocaleString('ko-KR')+' USD'}};
  const date=value=>{if(!value)return '부족 없음';try{return typeof fmtDate==='function'?fmtDate(new Date(String(value).slice(0,10)+'T00:00:00')):String(value)}catch(_){return String(value)}};
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const card=(label,value,note,tone='')=>'<div class="fund-report-card '+tone+'"><div class="fund-report-label">'+label+'</div><div class="fund-report-value">'+value+'</div><div class="fund-report-note">'+note+'</div></div>';
  const conciseWon=value=>{const amount=n(value);return Math.abs(amount)>=100000000?(amount/100000000).toLocaleString('ko-KR',{maximumFractionDigits:2})+'억원':won(amount)};
  function addStyle(){
    if($('fundReportStyle'))return;
    const style=document.createElement('style');style.id='fundReportStyle';
    style.textContent='#fundReportPanel[hidden]{display:none!important}body.fund-report-mode .grid,body.fund-report-mode #dataFreshness{display:none!important}body.fund-report-mode #fundReportPanel{display:block!important}.fund-report-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:15px}.fund-report-head h2{margin:0;color:#14243c;font-size:23px}.fund-report-head p{margin:6px 0 0;color:#667085;font-size:13px}.fund-report-chip{padding:7px 10px;border-radius:999px;background:#ecfdf5;color:#087f70;font-size:12px;font-weight:900}.fund-report-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.fund-report-card{border:1px solid #dbe5ee;border-radius:13px;padding:14px;background:#fff}.fund-report-label{font-size:12px;font-weight:850;color:#526174}.fund-report-value{margin-top:7px;font-size:22px;font-weight:950;color:#14243c}.fund-report-note{margin-top:6px;font-size:12px;color:#667085}.fund-report-card.warn .fund-report-value{color:#c2410c}.fund-report-card.good .fund-report-value{color:#087f70}.fund-report-controls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:14px}.fund-report-controls label{display:grid;gap:6px;font-size:12px;font-weight:850;color:#344054}.fund-report-controls input,.fund-report-controls select,.fund-report-controls textarea{box-sizing:border-box;width:100%;padding:9px;border:1px solid #cbd9e6;border-radius:8px;background:#fff;color:#14243c;font:inherit}.fund-report-controls textarea{min-height:72px;resize:vertical}.fund-report-controls .wide{grid-column:span 2}.fund-report-actions{display:flex;gap:7px;align-items:end}.fund-report-actions button{padding:9px 10px;border:1px solid #a7d8d0;border-radius:8px;background:#edf7f5;color:#087f70;font-weight:900;cursor:pointer}.fund-report-actions button.active{background:#087f70;color:#fff}.fund-report-meta{margin-top:13px;padding:11px 13px;background:#f8fafc;border-radius:9px;color:#526174;font-size:12px;line-height:1.6}.fund-report-section{margin-top:18px;padding-top:2px;break-inside:avoid}.fund-report-section h3{margin:0 0 10px;color:#14243c;font-size:16px}.fund-report-section p{margin:0 0 10px;color:#667085;font-size:12px}.fund-report-chart{border:1px solid #dbe5ee;border-radius:12px;padding:10px;background:#fbfdff}.fund-report-chart svg{display:block;width:100%;height:auto}.fund-report-plan-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:11px}.fund-report-plan-item{padding:10px;border-left:3px solid #087f70;background:#f8fafc;border-radius:7px}.fund-report-plan-item.warn{border-left-color:#c2410c}.fund-report-plan-label{font-size:11px;color:#667085;font-weight:800}.fund-report-plan-value{margin-top:4px;color:#14243c;font-weight:950;font-size:14px}.fund-report-table-wrap{overflow:auto;border:1px solid #dbe5ee;border-radius:10px}.fund-report-table{width:100%;border-collapse:collapse;font-size:12px}.fund-report-table th{padding:9px;background:#f1f5f9;color:#526174;text-align:left;white-space:nowrap}.fund-report-table td{padding:9px;border-top:1px solid #e7edf3;color:#24364d;white-space:nowrap}.fund-report-table td.num{text-align:right}.fund-report-table .release{color:#087f70;font-weight:900}.fund-report-table .reinvest{color:#526174;font-weight:800}@media(max-width:900px){.fund-report-grid,.fund-report-controls{grid-template-columns:repeat(2,minmax(0,1fr)}.fund-report-controls .wide{grid-column:span 2}}@media(max-width:600px){.fund-report-grid,.fund-report-controls{grid-template-columns:1fr}.fund-report-controls .wide{grid-column:span 1}.fund-report-head{display:grid}}@media print{@page{size:A4;margin:12mm}body.fund-report-print *{visibility:hidden!important}body.fund-report-print #fundReportPanel,body.fund-report-print #fundReportPanel *{visibility:visible!important}body.fund-report-print #fundReportPanel{display:block!important;position:absolute!important;left:0!important;top:0!important;width:100%!important;margin:0!important;border:0!important;box-shadow:none!important}body.fund-report-print #fundReportPrint,body.fund-report-print .fund-report-scenario,body.fund-report-print #fundReportMeta{display:none!important}.fund-report-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}';
    document.head.append(style);
  }
  function createPanel(){
    if($('fundReportPanel'))return;
    const nav=document.querySelector('.workspace-nav');if(!nav)return;
    const panel=document.createElement('section');panel.id='fundReportPanel';panel.className='panel';panel.hidden=true;
    panel.innerHTML='<div class="fund-report-head"><div><h2>자금보고</h2><p>관리자 전용 · 실제 잔고, 수기 시나리오와 환전 판단을 요약합니다.</p></div><div class="fund-report-actions"><span class="fund-report-chip">관리자 전용</span><button id="fundReportPrint" type="button">인쇄 / PDF 저장</button></div></div><section class="fund-report-section"><h3>현재 자금상황</h3><div id="fundReportMetrics" class="fund-report-grid"></div></section><section class="fund-report-section fund-report-scenario"><h3>수기 시나리오</h3><div class="fund-report-controls"><label class="wide">적용 시나리오<input id="fundReportScenarioName" type="text" maxlength="80" placeholder="예: 매출 상향 / 보수적 비용 반영"></label><label>원화 영향액 (원)<input id="fundReportKrw" type="number" step="1000000" placeholder="0"></label><label>USD 영향액<input id="fundReportUsd" type="number" step="1000" placeholder="0"></label><label class="wide">시나리오 메모<textarea id="fundReportNote" placeholder="매출 상향, 비용 절감, 일회성 자금 유입 등"></textarea></label></div></div><div id="fundReportMeta" class="fund-report-meta"></div></section><section class="fund-report-section"><h3>환전 필요 시점 및 자금 전망</h3><p>파란선은 선택 시나리오가 반영된 일자별 원화 가용잔액입니다.</p><div id="fundReportForecast"></div></section><section class="fund-report-section"><h3>운용 중 예금 현황</h3><p>원본 예금현황의 만기·처리방식을 기준으로 표시합니다.</p><div id="fundReportDeposits"></div></section>';
    nav.insertAdjacentElement('afterend',panel);
    ['fundReportScenarioName','fundReportKrw','fundReportUsd','fundReportNote'].forEach(id=>$(id)?.addEventListener('change',saveInputs));$('fundReportPrint')?.addEventListener('click',printReport);
  }
  function printReport(){document.body.classList.add('fund-report-print');const clean=()=>document.body.classList.remove('fund-report-print');window.addEventListener('afterprint',clean,{once:true});setTimeout(()=>window.print(),30);setTimeout(clean,3000)}
  function scenarioModel(krw,usdDelta){
    try{
      if(typeof cashModel==='undefined'||!cashModel)return null;
      const source=typeof applyDepositMaturityScenario==='function'?applyDepositMaturityScenario(cashModel):cashModel;
      return {...source,points:(source.points||[]).map(point=>({...point,krwBalance:n(point.krwBalance)+krw,usdBalance:n(point.usdBalance)+usdDelta}))};
    }catch(_){return null}
  }
  function depositItems(model){
    try{if(typeof currentDepositMaturityItems==='function')return currentDepositMaturityItems(model)||[];return Array.isArray(model?.depositProducts)?model.depositProducts:[]}catch(_){return []}
  }
  function renderDeposits(model){
    const target=$('fundReportDeposits');if(!target)return;
    const items=depositItems(model).slice().sort((a,b)=>String(a.maturity||'').localeCompare(String(b.maturity||'')));
    if(!items.length){target.innerHTML='<div class="fund-report-meta">연결된 예금 운용 내역이 없습니다.</div>';return}
    const rows=items.map(item=>{let released=false;try{released=typeof isDepositReleased==='function'&&isDepositReleased(item)}catch(_){}const handling=String(item.maturityHandling||'').trim()||(released?'만기해지 · 원화 가용':'재예치 · 계속 운용');return '<tr><td>'+esc(item.bank||'—')+'</td><td>'+esc(item.product||'정기예금(원화)')+'</td><td class="num">'+conciseWon(item.principal)+'</td><td class="num">'+n(item.rate).toLocaleString('ko-KR',{maximumFractionDigits:2})+'%</td><td>'+esc(date(item.maturity))+'</td><td class="'+(released?'release':'reinvest')+'">'+esc(handling)+'</td></tr>'}).join('');
    target.innerHTML='<div class="fund-report-table-wrap"><table class="fund-report-table"><thead><tr><th>금융기관</th><th>상품</th><th>원금</th><th>연이율</th><th>만기일</th><th>만기 처리</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  }
  function forecastSvg(model,first){
    const all=(model?.points||[]).filter(point=>point?.date&&Number.isFinite(n(point.krwBalance)));if(!all.length)return '<div class="fund-report-meta">일자별 자금계획을 불러오는 중입니다.</div>';
    const step=Math.max(1,Math.ceil(all.length/130)),points=all.filter((_,index)=>index%step===0||index===all.length-1),width=900,height=245,left=58,right=18,top=22,bottom=36;
    const values=points.map(point=>n(point.krwBalance)),rawMin=Math.min(...values),rawMax=Math.max(...values),span=Math.max(1,rawMax-rawMin),min=rawMin-span*.12,max=rawMax+span*.12;
    const x=index=>left+(width-left-right)*(index/Math.max(1,points.length-1)),y=value=>top+(height-top-bottom)*(1-(n(value)-min)/(max-min));
    const line=points.map((point,index)=>x(index).toFixed(1)+','+y(point.krwBalance).toFixed(1)).join(' ');
    const zeroY=y(0),firstIndex=first?points.findIndex(point=>String(point.date||'')>=String(first.date||'')):-1;
    const labels=[0,Math.floor((points.length-1)/2),points.length-1].map(index=>'<text x="'+x(index).toFixed(1)+'" y="'+(height-11)+'" text-anchor="middle" font-size="11" fill="#667085">'+esc(String(points[index].date||'').slice(0,10))+'</text>').join('');
    const grid=[min,(min+max)/2,max].map(value=>'<g><line x1="'+left+'" x2="'+(width-right)+'" y1="'+y(value).toFixed(1)+'" y2="'+y(value).toFixed(1)+'" stroke="#dbe5ee"/><text x="'+(left-8)+'" y="'+(y(value)+4).toFixed(1)+'" text-anchor="end" font-size="11" fill="#667085">'+esc(conciseWon(value))+'</text></g>').join('');
    const marker=firstIndex>=0?'<g><line x1="'+x(firstIndex).toFixed(1)+'" x2="'+x(firstIndex).toFixed(1)+'" y1="'+top+'" y2="'+(height-bottom)+'" stroke="#c2410c" stroke-dasharray="5 4"/><text x="'+x(firstIndex).toFixed(1)+'" y="14" text-anchor="middle" font-size="11" fill="#c2410c">첫 부족일</text></g>':'';
    return '<div class="fund-report-chart"><svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="원화 가용잔액 추이">'+grid+'<line x1="'+left+'" x2="'+(width-right)+'" y1="'+zeroY.toFixed(1)+'" y2="'+zeroY.toFixed(1)+'" stroke="#f59e8b" stroke-dasharray="4 4"/>'+marker+'<polyline points="'+line+'" fill="none" stroke="#2563eb" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>'+labels+'</svg></div>';
  }
  function renderForecast(model,analysis,first,next,rate){
    const target=$('fundReportForecast');if(!target)return;
    const firstAmount=first?Math.abs(n(first.krwBalance)):0,needed=analysis?Math.max(0,n(analysis.mandatoryUsd)):0;
    target.innerHTML=forecastSvg(model,first)+'<div class="fund-report-plan-grid"><div class="fund-report-plan-item '+(first?'warn':'')+'"><div class="fund-report-plan-label">첫 원화 부족일</div><div class="fund-report-plan-value">'+(first?esc(date(first.date)):'부족 없음')+'</div></div><div class="fund-report-plan-item '+(first?'warn':'')+'"><div class="fund-report-plan-label">부족 예상액</div><div class="fund-report-plan-value">'+(first?won(firstAmount):'0원')+'</div></div><div class="fund-report-plan-item"><div class="fund-report-plan-label">권장 환전 필요금액</div><div class="fund-report-plan-value">'+usd(needed)+'</div></div><div class="fund-report-plan-item"><div class="fund-report-plan-label">환전 후 다음 부족</div><div class="fund-report-plan-value">'+(next?esc(date(next.date)):'추가 부족 없음')+'</div></div></div><div class="fund-report-meta">산정 기준: 기준환율 '+(rate?n(rate).toLocaleString('ko-KR')+'원':'—')+' · 첫 부족일의 원화 부족액을 USD로 환산했습니다. 예금 만기 처리와 수기 시나리오를 반영합니다.</div>';
  }
  function render(){
    if(!reportOpen||!admin())return;
    createPanel();const metrics=$('fundReportMetrics');if(!metrics)return;
    const saved=read(),scenarioName=String(saved.name||'').trim()||'수기 시나리오',krw=n(saved.krw),usdDelta=n(saved.usd);
    let actual=null,model=null,rate=0,analysis=null,first=null,next=null;
    try{actual=typeof dailyBalanceData!=='undefined'?dailyBalanceData?.rows?.at(-1):null;model=scenarioModel(krw,usdDelta);rate=typeof fxReferenceRate==='function'&&typeof cashModel!=='undefined'&&cashModel?fxReferenceRate(cashModel):(model?.brokerRate||model?.planRate||0);analysis=model&&typeof cashAnalysis==='function'?cashAnalysis(model,rate):null;first=analysis?.firstKrwShort||null;if(first&&rate>0&&typeof simulateFxTransfer==='function'){const converted=simulateFxTransfer(model,{date:String(first.date||'').slice(0,10),direction:'sell',usd:Math.max(0,n(analysis.mandatoryUsd)),rate});if(converted?.valid)next=(converted.model?.points||[]).find(point=>String(point.date||'')>String(first.date||'')&&n(point.krwBalance)<0)||null}}catch(_){}
    const nowPoint=model?.points?.find(point=>String(point.date||'')>=new Date().toISOString().slice(0,10))||model?.points?.[0];
    const currentKrw=actual?.krw??nowPoint?.krwBalance,currentUsd=actual?.usd??nowPoint?.usdBalance;
    metrics.innerHTML=card('현재 원화 잔고',currentKrw==null?'—':won(currentKrw),actual?.date?'실제 잔고 '+actual.date:'연결된 계획 기준')+card('현재 USD 잔고',currentUsd==null?'—':usd(currentUsd),actual?.date?'실제 잔고 '+actual.date:'연결된 계획 기준')+card(scenarioName+' 반영',won(krw)+' · '+usd(usdDelta),'수기 입력 영향액','good')+card('원화 부족 시점',first?date(first.date):'부족 없음',first?won(Math.abs(n(first.krwBalance)))+' · '+usd(analysis.mandatoryUsd)+' 필요':'현재 계획기간 기준',first?'warn':'good')+card('환전 필요금액',first?usd(analysis.mandatoryUsd):'0 USD',first&&rate?won(n(analysis.mandatoryUsd)*rate)+' · 기준환율 '+n(rate).toLocaleString('ko-KR')+'원':'환전 불필요')+card('환전 후 다음 환전시기',next?date(next.date):'추가 부족 없음',next?won(Math.abs(n(next.krwBalance)))+' 추가 부족':'계획 종료까지')+card('보고 기준환율',rate?n(rate).toLocaleString('ko-KR')+'원':'—','자동 조회 환율 기준')+card('원본 갱신',typeof cashModel!=='undefined'&&cashModel?.importedAt?new Date(cashModel.importedAt).toLocaleString('ko-KR'):'확인 중',cashModel?.sourceSheet||'자금운용');
    $('fundReportScenarioName').value=saved.name||'';$('fundReportKrw').value=saved.krw||'';$('fundReportUsd').value=saved.usd||'';$('fundReportNote').value=saved.note||'';$('fundReportMeta').textContent='수기 입력값과 메모는 이 관리자 브라우저에만 저장됩니다.'+(saved.note?' 메모: '+saved.note:'');renderForecast(model,analysis,first,next,rate);renderDeposits(model);
  }
  function saveInputs(){const next={name:String($('fundReportScenarioName').value||'').slice(0,80),krw:n($('fundReportKrw').value),usd:n($('fundReportUsd').value),note:String($('fundReportNote').value||'').slice(0,1000)};write(next);render()}
  function openReport(){
    if(!admin())return;
    reportOpen=true;
    document.body.classList.add('fund-report-mode');createPanel();$('fundReportPanel').hidden=false;document.querySelectorAll('[data-cash-view]').forEach(button=>button.classList.toggle('active',button.dataset.cashView==='fund-report'));render();
  }
  function install(){
    if(installed||typeof window.setCashView!=='function'||!$('sourceTab'))return false;
    installed=true;addStyle();createPanel();
    const tab=document.createElement('button');tab.type='button';tab.id='fundReportTab';tab.className='workspace-tab';tab.dataset.cashView='fund-report';tab.textContent='자금보고';tab.hidden=true;tab.addEventListener('click',openReport);$('sourceTab').parentElement.append(tab);
    const original=window.setCashView;window.__fundReportOriginalSetCashView=original;
    window.setCashView=function(view,...args){if(view==='fund-report'){openReport();return}reportOpen=false;document.body.classList.remove('fund-report-mode');const panel=$('fundReportPanel');if(panel)panel.hidden=true;return original.call(this,view,...args)};
    setInterval(()=>{const tab=$('fundReportTab');if(!tab)return;if(admin()){tab.hidden=false}else{tab.hidden=true;if(reportOpen){reportOpen=false;document.body.classList.remove('fund-report-mode');$('fundReportPanel').hidden=true}}},1000);
    return true;
  }
  const timer=setInterval(()=>{try{if(install())clearInterval(timer)}catch(_){}} ,100);
  setTimeout(()=>clearInterval(timer),15000);
})();