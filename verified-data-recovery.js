(() => {
  'use strict';

  const VERIFIED_DEPOSITS=[
    {bank:'한국투자증권',product:'정기예금(원화)',maturity:'2026-12-29',account:'미제공',rate:3.55,principal:1000000000},
    {bank:'경남은행',product:'정기예금(원화)',maturity:'2026-10-26',account:'223-****-06',rate:3.00,principal:300000000},
    {bank:'국민은행',product:'정기예금(원화)',maturity:'2026-08-26',account:'268-****-01',rate:2.67,principal:200000000},
    {bank:'국민은행',product:'정기예금(원화)',maturity:'2027-02-07',account:'268-****-01',rate:3.02,principal:300000000}
  ];

  const VERIFIED_USD=[
    {month:'2026-04',amount:294565.7},
    {month:'2026-05',amount:0},
    {month:'2026-06',amount:95534.34},
    {month:'2026-07',amount:788728.47}
  ];

  const nonEmpty=value=>Array.isArray(value)&&value.length>0;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const setStatus=(message,state='info')=>{
    let host=document.getElementById('verifiedRecoveryStatus');
    if(!host){
      host=document.createElement('div');
      host.id='verifiedRecoveryStatus';
      host.style.cssText='position:fixed;right:16px;bottom:16px;z-index:9999;max-width:360px;padding:11px 13px;border-radius:10px;border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a5f;font:12px/1.5 system-ui;box-shadow:0 8px 24px rgba(15,23,42,.12)';
      document.body.appendChild(host);
    }
    host.style.borderColor=state==='ok'?'#b7e4d5':state==='warn'?'#f5d28c':'#bfdbfe';
    host.style.background=state==='ok'?'#ecfdf5':state==='warn'?'#fff8e8':'#eff6ff';
    host.style.color=state==='ok'?'#087f70':state==='warn'?'#9a5b00':'#1e3a5f';
    host.textContent=message;
    if(state==='ok')setTimeout(()=>{if(host)host.style.display='none'},8000);
  };

  function mergeUsd(existing){
    const map=new Map();
    (Array.isArray(existing)?existing:[]).forEach(row=>{
      if(row&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(row.month||''))&&Number.isFinite(Number(row.amount)))map.set(String(row.month),Number(row.amount));
    });
    let changed=false;
    VERIFIED_USD.forEach(row=>{
      if(!map.has(row.month)){map.set(row.month,row.amount);changed=true}
    });
    return {rows:[...map.entries()].map(([month,amount])=>({month,amount})).sort((a,b)=>a.month.localeCompare(b.month)),changed};
  }

  async function recover(){
    for(let i=0;i<180;i++){
      if(window.dashboardAuth?.isAdmin &&
         typeof window.saveDepositProducts==='function' &&
         typeof window.saveMonthlyUsdBalances==='function' &&
         window.__cashPlanSnapshotData &&
         typeof window.__cashPlanSnapshotData==='object') break;
      await sleep(250);
    }

    if(!window.dashboardAuth?.isAdmin){
      setStatus('복구 대기 · 관리자 로그인 후 자동 복구됩니다.','warn');
      return;
    }
    const data=window.__cashPlanSnapshotData;
    if(!data||typeof data!=='object'){
      setStatus('복구 확인 실패 · 공유 저장소 상태를 읽지 못했습니다.','warn');
      return;
    }

    const restored=[];
    const preserved=[];
    const failed=[];

    try{
      if(nonEmpty(data.depositProducts)){
        preserved.push('자금운용 내역 기존값 유지');
      }else{
        await window.saveDepositProducts(VERIFIED_DEPOSITS);
        window.dashboardBridge?.setDepositProducts?.(VERIFIED_DEPOSITS);
        restored.push('자금운용 4건');
      }
    }catch(error){
      failed.push('자금운용: '+(error?.message||String(error)));
    }

    try{
      const merged=mergeUsd(data.monthlyUsdBalances);
      if(merged.changed){
        await window.saveMonthlyUsdBalances(merged.rows);
        window.dashboardBridge?.setMonthlyUsdBalances?.(merged.rows);
        restored.push('USD 월말잔액 확인값');
      }else{
        preserved.push('USD 월말잔액 기존값 유지');
      }
    }catch(error){
      failed.push('USD 월말잔액: '+(error?.message||String(error)));
    }

    if(nonEmpty(data.cashReconciliations)){
      preserved.push('월말 검증/확정 기존값 유지');
    }else{
      preserved.push('월말 검증/확정은 확인된 원본 없음 · 미생성');
    }

    try{
      localStorage.setItem('act.verifiedRecovery.lastRun.v1',JSON.stringify({
        at:Date.now(),restored,preserved,failed
      }));
    }catch{}

    if(failed.length){
      setStatus('복구 일부 실패 · '+failed.join(' / '),'warn');
      return;
    }
    if(restored.length){
      setStatus('복구 완료 · '+restored.join(' · ')+' / '+preserved.join(' · '),'ok');
      setTimeout(()=>location.reload(),1800);
    }else{
      setStatus('복구 확인 완료 · '+preserved.join(' · '),'ok');
    }
  }

  recover().catch(error=>setStatus('복구 오류 · '+(error?.message||String(error)),'warn'));
})();