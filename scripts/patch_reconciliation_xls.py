from pathlib import Path
import re

path = Path('index.html')
text = path.read_text(encoding='utf-8')

start = text.find('    function parseReconciliationWorkbook(workbook,file,unit=1){')
end = text.find('    function reconciliationInputs(values={})', start)
if start < 0 or end < 0:
    raise SystemExit('parseReconciliationWorkbook block not found')

replacement = r'''    function parseReconciliationWorkbook(workbook,file,unit=1){
      if(![1,1000,1000000].includes(unit))throw new Error('원본 금액 단위를 확인해 주세요.');
      const candidates=[];
      const normalize=v=>String(v??'').replace(/\s/g,'');
      const parseHeaderDate=value=>{
        const text=String(value??'').replace(/\s+/g,' ');
        let m=text.match(/(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
        if(!m)m=text.match(/(20\d{2})[/.\-]\s*(\d{1,2})[/.\-]\s*(\d{1,2})/);
        if(!m)return null;
        const y=+m[1],mo=+m[2],d=+m[3],date=new Date(y,mo-1,d);
        return date.getFullYear()===y&&date.getMonth()===mo-1&&date.getDate()===d?`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`:null;
      };
      for(const name of workbook.SheetNames||[]){
        const sheet=workbook.Sheets[name];if(!sheet)continue;
        const range=XLSX.utils.decode_range(sheet['!ref']||'A1');
        if(range.e.r>5000||range.e.c>100)continue;
        const rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null,range:0});
        for(let r=0;r<Math.min(35,rows.length);r++){
          const row=rows[r]||[],accountCol=row.findIndex(v=>/^(과목|계정과목|계정명)$/.test(normalize(v)));if(accountCol<0)continue;
          const currentCols=row.map((v,c)=>({text:normalize(v),c})).filter(x=>/\(당\)기|당기/.test(x.text));
          if(!currentCols.length)continue;
          const current=currentCols[0];

          // Some accounting exports (.xls) put the current/prior dates on separate rows
          // above the '당기/전기' header instead of inside the period header cell.
          const headerDates=[];
          for(let hr=0;hr<=Math.min(r+1,20);hr++)for(const cell of rows[hr]||[]){const d=parseHeaderDate(cell);if(d)headerDates.push(d)}
          const uniqueDates=[...new Set(headerDates)].sort();
          let date=uniqueDates.at(-1)||null;
          if(!date){
            const inline=(String(row[current.c]??'').match(/20\d{2}[/.\-]\d{1,2}[/.\-]\d{1,2}/g)||[]).map(parseHeaderDate).filter(Boolean).sort();
            date=inline.at(-1)||null;
          }
          if(!date)throw new Error('당기 기말일을 읽을 수 없습니다. 재무상태표 상단의 기준일(예: 2026년 01월 31일)을 확인해 주세요.');
          const month=date.slice(0,7);if(month<'2026-01'||date!==reconciliationMonthEnd(month))throw new Error('2026년 이후 월말 기준 재무제표를 선택해 주세요.');
          const startDate=date;

          const nextPeriod=row.findIndex((v,c)=>c>current.c&&(/\(전\)기|전기/.test(normalize(v))||/20\d{2}/.test(String(v??''))));
          const merged=(sheet['!merges']||[]).find(m=>m.s.r===r&&m.s.c===current.c);
          // Typical legacy .xls reports use B:C for current period and D:E for prior period.
          const endCol=nextPeriod>=0?nextPeriod-1:merged?merged.e.c:Math.min(range.e.c,current.c+2);

          const topText=rows.slice(0,Math.min(r+4,rows.length)).flat().map(v=>String(v??'')).join(' ');
          const unitText=topText.match(/단\s*위\s*[:：]?\s*(백\s*만\s*원|천\s*원|원)/);
          if(unitText){const normalizedUnit=unitText[1].replace(/\s/g,''),detected={원:1,천원:1000,백만원:1000000}[normalizedUnit];if(detected&&detected!==unit)throw new Error(`원본에 표시된 단위는 ${normalizedUnit}입니다. 금액 단위를 바꾸고 다시 선택해 주세요.`)}

          const amounts={},refs={},unsupported=[];
          for(let i=r+1;i<rows.length;i++){
            const label=normalize(rows[i]?.[accountCol]);if(!label)continue;
            const canonical=label.replace(/^[\dIVXⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ.()가-힣]*[.)]?/,'');
            const target=['보통예금','기타단기금융상품'].find(key=>label===key||label.endsWith(key));
            if(!target){
              if(/^(현금|현금및현금성자산|당좌예금|정기예금|정기적금|외화예금|단기금융상품|단기금융자산|장기금융상품|장기금융자산)$/.test(label))unsupported.push(label);
              continue;
            }
            if(Object.prototype.hasOwnProperty.call(amounts,target))throw new Error(`${target} 계정이 여러 번 나옵니다. 계정별 단일 재무상태표를 선택해 주세요.`);
            let amount=null,col=-1;
            for(let c=current.c;c<=endCol;c++){
              const cell=sheet[XLSX.utils.encode_cell({r:i,c})];
              if(cell?.t==='e')throw new Error(`${target} 당기 셀에 수식 오류가 있습니다.`);
              const v=reconciliationNumber(rows[i]?.[c]);if(v!=null){amount=v*unit;col=c}
            }
            if(amount==null||!Number.isSafeInteger(amount))throw new Error(`${target} 당기 금액을 원 단위 정수로 읽을 수 없습니다.`);
            amounts[target]=amount;refs[target]=XLSX.utils.encode_cell({r:i,c:col});
          }
          if(amounts['보통예금']==null)continue;
          candidates.push({month,date,startDate,unit,bankAmount:amounts['보통예금'],shortAmount:amounts['기타단기금융상품']??null,fileName:String(file.name||'재무상태표').slice(0,200),sheet:name,bankCell:refs['보통예금'],shortCell:refs['기타단기금융상품']||'',unsupported:[...new Set(unsupported)]});
        }
      }
      if(candidates.length!==1)throw new Error(candidates.length?'검증 가능한 재무제표가 여러 개입니다. 해당 월 재무상태표 하나만 포함한 파일을 선택해 주세요.':'보통예금 당기 금액을 찾지 못했습니다. 재무상태표에 보통예금 계정과 당기 금액이 있는지 확인해 주세요.');
      return candidates[0];
    }
'''

patched = text[:start] + replacement + text[end:]
if patched == text:
    raise SystemExit('no changes')
path.write_text(patched, encoding='utf-8')
print('patched reconciliation XLS parser')
