(()=>{
  'use strict';
  const KEY='act.fund-report.v2';
  let reportOpen=false, installed=false;
  const $=id=>document.getElementById(id);
  const n=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0};
  const admin=()=>window.dashboardAuth?.isAdmin===true;
  const read=()=>{try{return {...{scenario:'base',baseKrw:0,baseUsd:0,upsideKrw:0,upsideUsd:0,note:''},...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch(_){return {scenario:'base',baseKrw:0,baseUsd:0,upsideKrw:0,upsideUsd:0,note:''}}};
  const write=value=>localStorage.setItem(KEY,JSON.stringify(value));
  const won=value=>{try{return typeof fmtKrw==='function'?fmtKrw(value):Math.round(n(value)).toLocaleString('ko-KR')+'원'}catch(_){return Math.round(n(value)).toLocaleString('ko-KR')+'원'}};
  const usd=value=>{try{return typeof fmt==='function'?fmt(value,0)+' USD':Math.round(n(value)).toLocaleString('ko-KR')+' USD'}catch(_){return Math.round(n(value)).toLocaleString('ko-KR')+' USD'}};
  const date=value=>{if(!value)return '부족 없음';try{return typeof fmtDate==='function'?fmtDate(new Date(String(value).slice(0,10)+'T00:00:00')):String(value)}catch(_){return String(value)}};
  const card=(label,value,note,tone='')=>'<div class="fund-report-card '+tone+'"><div class="fund-report-label">'+label+'</div><div class="fund-report-value">'+value+'</div><div class="fund-report-note">'+note+'</div></div>';
  function addStyle(){
    if($('fundReportStyle'))return;
    const style=document.createElement('style');style.id='fundReportStyle';
    style.textContent='#fundReportPanel[hidden]{display:none!important}body.fund-report-mode .grid,body.fund-report-mode #dataFreshness{display:none!important}body.fund-report-mode #fundReportPanel{display:block!important}.fund-report-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:15px}.fund-report-head h2{margin:0;color:#14243c;font-size:23px}.fund-report-head p{margin:6px 0 0;color:#667085;font-size:13px}.fund-report-chip{padding:7px 10px;border-radius:999px;background:#ecfdf5;color:#087f70;font-size:12px;font-weight:900}.fund-report-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.fund-report-card{border:1px solid #dbe5ee;border-radius:13px;padding:14px;background:#fff}.fund-report-label{font-size:12px;font-weight:850;color:#526174}.fund-report-value{margin-top:7px;font-size:22px;font-weight:950;color:#14243c}.fund-report-note{margin-top:6px;font-size:12px;color:#667085}.fund-report-card.warn .fund-report-value{color:#c2410c}.fund-report-card.good .fund-report-value{color:#087f70}.fund-report-controls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:14px}.fund-report-controls label{display:grid;gap:6px;font-size:12px;font-weight:850;color:#344054}.fund-report-controls input,.fund-report-controls select,.fund-report-controls textarea{box-sizing:border-box;width:100%;padding:9px;border:1px solid #cbd9e6;border-radius:8px;background:#fff;color:#14243c;font:inherit}.fund-report-controls textarea{min-height:72px;resize:vertical}.fund-report-controls .wide{grid-column:span 2}.fund-report-actions{display:flex;gap:7px;align-items:end}.fund-report-actions button{padding:9px 10px;border:1px solid #a7d8d0;border-radius:8px;background:#edf7f5;color:#087f70;font-weight:900;cursor:pointer}.fund-report-actions button.active{background:#087f70;color:#fff}.fund-report-meta{margin-top:13px;padding:11px 13px;background:#f8fafc;border-radius:9px;color:#526174;font-size:12px;line-height:1.6}@media(max-width:900px){.fund-report-grid,.fund-report-controls{grid-template-columns:repeat(2,minmax(0,1fr)}.fund-report-controls .wide{grid-column:span 2}}@media(max-width:600px){.fund-report-grid,.fund-report-controls{grid-template-columns:1fr}.fund-report-controls .wide{grid-column:span 1}.fund-report-head{display:grid}}';
    document.head.append(style);
  }
  function createPanel(){
    if($('fundReportPanel'))return;
    const nav=document.querySelector('.workspace-nav');if(!nav)return;
    const panel=document.createElement('section');panel.id='fundReportPanel';panel.className='panel';panel.hidden=true;
    panel.innerHTML='<div class="fund-report-head"><div><h2>자금보고</h2><p>관리자 전용 · 실제 잔고, 수기 시나리오와 환전 판단을 요약합니다.</p></div><span class="fund-report-chip">관리자 전용</span></div><div id="fundReportMetrics" class="fund-report-grid"></div><div class="fund-report-controls"><label>적용 시나리오<select id="fundReportScenario"><option value="base">베이스</option><option value="upside">업사이드</option></select></label><label>베이스 원화 영향액 (원)<input id="fundReportBaseKrw" type="number" step="1000000" placeholder="0"></label><label>베이스 USD 영향액<input id="fundReportBaseUsd" type="number" step="1000" placeholder="0"></label><label>업사이드 원화 영향액 (원)<input id="fundReportUpsideKrw" type="number" step="1000000" placeholder="0"></label><label>업사이드 USD 영향액<input id="fundReportUpsideUsd" type="number" step="1000" placeholder="0"></label><label class="wide">시나리오 메모<textarea id="fundReportNote" placeholder="매출 상향, 비용 절감, 일회성 자금 유입 등"></textarea></label><div class="fund-report-actions"><button type="button" id="fundReportBaseBtn">베이스 적용</button><button type="button" id="fundReportUpsideBtn">업사이드 적용</button></div></div><div id="fundReportMeta" class="fund-report-meta"></div>';
    nav.insertAdjacentElement('afterend',panel);
    ['fundReportScenario','fundReportBaseKrw','fundReportBaseUsd','fundReportUpsideKrw','fundReportUpsideUsd','fundReportNote'].forEach(id=>$(id)?.addEventListener('change',saveInputs));
    $('fundReportBaseBtn').addEventListener('click',()=>{const v=read();v.scenario='base';write(v);render()});
    $('fundReportUpsideBtn').addEventListener('click',()=>{const v=read();v.scenario='upside';write(v);render()});
  }
  function scenarioModel(krw,usdDelta){
    try{
      if(typeof cashModel==='undefined'||!cashModel)return null;
      const source=typeof applyDepositMaturityScenario==='function'?applyDepositMaturityScenario(cashModel):cashModel;
      return {...source,points:(source.points||[]).map(point=>({...point,krwBalance:n(point.krwBalance)+krw,usdBalance:n(point.usdBalance)+usdDelta}))};
    }catch(_){return null}
  }
  function render(){
    if(!reportOpen||!admin())return;
    createPanel();const metrics=$('fundReportMetrics');if(!metrics)return;
    const saved=read(),kind=saved.scenario==='upside'?'upside':'base',krw=n(kind==='upside'?saved.upsideKrw:saved.baseKrw),usdDelta=n(kind==='upside'?saved.upsideUsd:saved.baseUsd);
    let actual=null,model=null,rate=0,analysis=null,first=null,next=null;
    try{actual=typeof dailyBalanceData!=='undefined'?dailyBalanceData?.rows?.at(-1):null;model=scenarioModel(krw,usdDelta);rate=typeof fxReferenceRate==='function'&&typeof cashModel!=='undefined'&&cashModel?fxReferenceRate(cashModel):(model?.brokerRate||model?.planRate||0);analysis=model&&typeof cashAnalysis==='function'?cashAnalysis(model,rate):null;first=analysis?.firstKrwShort||null;if(first&&rate>0&&typeof simulateFxTransfer==='function'){const converted=simulateFxTransfer(model,{date:String(first.date||'').slice(0,10),direction:'sell',usd:Math.max(0,n(analysis.mandatoryUsd)),rate});if(converted?.valid)next=(converted.model?.points||[]).find(point=>String(point.date||'')>String(first.date||'')&&n(point.krwBalance)<0)||null}}catch(_){}
    const nowPoint=model?.points?.find(point=>String(point.date||'')>=new Date().toISOString().slice(0,10))||model?.points?.[0];
    const currentKrw=actual?.krw??nowPoint?.krwBalance,currentUsd=actual?.usd??nowPoint?.usdBalance;
    metrics.innerHTML=card('현재 원화 잔고',currentKrw==null?'—':won(currentKrw),actual?.date?'실제 잔고 '+actual.date:'연결된 계획 기준')+card('현재 USD 잔고',currentUsd==null?'—':usd(currentUsd),actual?.date?'실제 잔고 '+actual.date:'연결된 계획 기준')+card(kind==='upside'?'업사이드 반영':'베이스 반영',won(krw)+' · '+usd(usdDelta),'수기 입력 영향액',kind==='upside'?'good':'')+card('원화 부족 시점',first?date(first.date):'부족 없음',first?won(Math.abs(n(first.krwBalance)))+' · '+usd(analysis.mandatoryUsd)+' 필요':'현재 계획기간 기준',first?'warn':'good')+card('환전 필요금액',first?usd(analysis.mandatoryUsd):'0 USD',first&&rate?won(n(analysis.mandatoryUsd)*rate)+' · 기준환율 '+n(rate).toLocaleString('ko-KR')+'원':'환전 불필요')+card('환전 후 다음 환전시기',next?date(next.date):'추가 부족 없음',next?won(Math.abs(n(next.krwBalance)))+' 추가 부족':'계획 종료까지')+card('보고 기준환율',rate?n(rate).toLocaleString('ko-KR')+'원':'—','자동 조회 환율 기준')+card('원본 갱신',typeof cashModel!=='undefined'&&cashModel?.importedAt?new Date(cashModel.importedAt).toLocaleString('ko-KR'):'확인 중',cashModel?.sourceSheet||'자금운용');
    $('fundReportScenario').value=kind;$('fundReportBaseKrw').value=saved.baseKrw||'';$('fundReportBaseUsd').value=saved.baseUsd||'';$('fundReportUpsideKrw').value=saved.upsideKrw||'';$('fundReportUpsideUsd').value=saved.upsideUsd||'';$('fundReportNote').value=saved.note||'';$('fundReportBaseBtn').classList.toggle('active',kind==='base');$('fundReportUpsideBtn').classList.toggle('active',kind==='upside');$('fundReportMeta').textContent='수기 입력값과 메모는 이 관리자 브라우저에만 저장됩니다.'+(saved.note?' 메모: '+saved.note:'');
  }
  function saveInputs(){const prior=read(),next={...prior,scenario:$('fundReportScenario').value==='upside'?'upside':'base',baseKrw:n($('fundReportBaseKrw').value),baseUsd:n($('fundReportBaseUsd').value),upsideKrw:n($('fundReportUpsideKrw').value),upsideUsd:n($('fundReportUpsideUsd').value),note:String($('fundReportNote').value||'').slice(0,1000)};write(next);render()}
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