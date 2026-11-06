(() => {
  'use strict';
  const CASH_KEY='actCashPlan.v1';
  const DEP_KEY='act.recovery.depositProducts.v1';
  const REC_KEY='act.recovery.cashReconciliations.v1';
  const USD_KEY='act.recovery.monthlyUsdBalances.v1';
  const USD_FALLBACK_KEY='act.monthlyUsdFallback.v1';

  const readJson=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
  const writeJson=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
  const nonEmptyArray=value=>Array.isArray(value)&&value.length>0;

  function scanLegacy(field){
    try{
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i);
        if(!key||[DEP_KEY,REC_KEY,USD_KEY].includes(key))continue;
        const raw=localStorage.getItem(key);
        if(!raw||!raw.includes(field))continue;
        try{
          const parsed=JSON.parse(raw);
          if(nonEmptyArray(parsed?.[field]))return parsed[field];
          if(nonEmptyArray(parsed?.data?.[field]))return parsed.data[field];
        }catch{}
      }
    }catch{}
    return null;
  }

  function cachedDeposits(){
    const direct=readJson(DEP_KEY);
    if(nonEmptyArray(direct))return direct;
    const model=readJson(CASH_KEY);
    if(nonEmptyArray(model?.depositProducts))return model.depositProducts;
    return scanLegacy('depositProducts');
  }

  function cachedReconciliations(){
    const direct=readJson(REC_KEY);
    if(nonEmptyArray(direct))return direct;
    return scanLegacy('cashReconciliations');
  }

  function cachedMonthlyUsd(){
    const direct=readJson(USD_KEY);
    if(nonEmptyArray(direct))return direct;
    const legacy=scanLegacy('monthlyUsdBalances');
    if(nonEmptyArray(legacy))return legacy;
    const fallback=readJson(USD_FALLBACK_KEY);
    if(fallback&&typeof fallback==='object'&&!Array.isArray(fallback)){
      const rows=Object.entries(fallback)
        .filter(([month,amount])=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)&&Number.isFinite(Number(amount)))
        .map(([month,amount])=>({month,amount:Number(amount)}))
        .sort((a,b)=>a.month.localeCompare(b.month));
      if(rows.length)return rows;
    }
    return null;
  }

  function install(){
    const bridge=window.dashboardBridge;
    if(!bridge||bridge.__recoveryInstalled)return false;
    bridge.__recoveryInstalled=true;

    const originalDeposit=typeof bridge.setDepositProducts==='function'?bridge.setDepositProducts.bind(bridge):null;
    const originalRec=typeof bridge.setCashReconciliations==='function'?bridge.setCashReconciliations.bind(bridge):null;
    const originalUsd=typeof bridge.setMonthlyUsdBalances==='function'?bridge.setMonthlyUsdBalances.bind(bridge):null;
    const originalModel=typeof bridge.setCashModel==='function'?bridge.setCashModel.bind(bridge):null;

    if(originalDeposit){
      bridge.setDepositProducts=products=>{
        let next=products;
        if(nonEmptyArray(products))writeJson(DEP_KEY,products);
        else{
          const cached=cachedDeposits();
          if(nonEmptyArray(cached))next=cached;
        }
        return originalDeposit(next||[]);
      };
    }

    if(originalRec){
      bridge.setCashReconciliations=rows=>{
        let next=rows;
        if(nonEmptyArray(rows))writeJson(REC_KEY,rows);
        else{
          const cached=cachedReconciliations();
          if(nonEmptyArray(cached))next=cached;
        }
        return originalRec(next||[]);
      };
    }

    if(originalUsd){
      bridge.setMonthlyUsdBalances=rows=>{
        let next=rows;
        if(nonEmptyArray(rows))writeJson(USD_KEY,rows);
        else{
          const cached=cachedMonthlyUsd();
          if(nonEmptyArray(cached))next=cached;
        }
        return originalUsd(next||[]);
      };
    }

    if(originalModel){
      bridge.setCashModel=(model,meta)=>{
        if(nonEmptyArray(model?.depositProducts))writeJson(DEP_KEY,model.depositProducts);
        const result=originalModel(model,meta);
        if(nonEmptyArray(model?.depositProducts)&&originalDeposit)bridge.setDepositProducts(model.depositProducts);
        return result;
      };
    }

    const dep=cachedDeposits();if(nonEmptyArray(dep)&&originalDeposit)bridge.setDepositProducts(dep);
    const rec=cachedReconciliations();if(nonEmptyArray(rec)&&originalRec)bridge.setCashReconciliations(rec);
    const usd=cachedMonthlyUsd();if(nonEmptyArray(usd)&&originalUsd)bridge.setMonthlyUsdBalances(usd);

    const model=readJson(CASH_KEY);
    if(model?.points?.length&&nonEmptyArray(model.depositProducts)&&originalDeposit)bridge.setDepositProducts(model.depositProducts);

    document.documentElement.dataset.recoveryPatch='active';
    return true;
  }

  let tries=0;
  const timer=setInterval(()=>{
    try{if(install()||++tries>120)clearInterval(timer)}
    catch(error){console.warn('dashboard recovery patch failed',error);if(++tries>120)clearInterval(timer)}
  },100);
})();