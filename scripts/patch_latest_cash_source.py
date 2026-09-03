from pathlib import Path
import re

path = Path('index.html')
text = path.read_text(encoding='utf-8')
original = text

# Daily closing sheets: the date inside the sheet is authoritative.
old = "for(const date of dates){const{name,sheet}=selected.get(date);try{const prefix=name.match(/^(\\d{2})(\\d{2})/);if(prefix&&prefix[1]+prefix[2]!==date.slice(5).replace('-',''))throw new Error('시트명 날짜와 표 안의 기준일이 다릅니다.');rows.push(parseDailyBalanceSheet(sheet,name,date))}catch(error){const message=`${date} · ${name}: ${error.message}`;skipped.push(message);if(date===dates.at(-1))latestError=message}}"
new = "for(const date of dates){const{name,sheet}=selected.get(date);try{rows.push(parseDailyBalanceSheet(sheet,name,date))}catch(error){const message=`${date} · ${name}: ${error.message}`;skipped.push(message);if(date===dates.at(-1))latestError=message}}"
if old not in text:
    raise SystemExit('daily parser target not found')
text = text.replace(old, new, 1)

# Cash-plan workbook: always select the newest matching Excel by lastModifiedDateTime.
pattern = re.compile(r"async function findMicrosoftDriveItem\(token,sourceUrl,fallbackName\)\{.*?\}\n    async function loadMicrosoftCashPlan", re.S)
replacement = r"""async function findMicrosoftDriveItem(token,sourceUrl,fallbackName){const headers={Authorization:`Bearer ${token}`},downloadUrlOf=item=>item?.['@microsoft.graph.downloadUrl']||item?.['@content.downloadUrl']||'',searchText=encodeURIComponent(MICROSOFT_FILE_QUERY);let response=await fetch(`https://graph.microsoft.com/v1.0/me/drive/root/search(q='${searchText}')?%24select=id,name,eTag,lastModifiedDateTime,parentReference,file,remoteItem&%24top=100`,{headers,cache:'no-store'});if(!response.ok){let detail='';try{detail=(await response.json())?.error?.message||''}catch(error){}throw new Error(`OneDrive 파일 검색 실패 (${response.status})${detail?`: ${detail}`:''}`)}const result=await response.json(),itemName=item=>String(item.name||item.remoteItem?.name||''),itemModified=item=>item.lastModifiedDateTime||item.remoteItem?.lastModifiedDateTime||'',normalizedQuery=MICROSOFT_FILE_QUERY.toLowerCase(),candidates=(result.value||[]).filter(item=>/\.xlsx?$/i.test(itemName(item))&&itemName(item).toLowerCase().includes(normalizedQuery)).sort((a,b)=>{const modifiedDiff=new Date(itemModified(b)||0)-new Date(itemModified(a)||0);return modifiedDiff||itemName(b).localeCompare(itemName(a),'ko')});const match=candidates[0];if(!match)throw new Error(`OneDrive에서 '${MICROSOFT_FILE_QUERY}' 이름이 포함된 Excel 파일을 찾지 못했습니다.`);const target=match.remoteItem||match,itemId=target.id||match.id,driveId=target.parentReference?.driveId||match.parentReference?.driveId,detailPath=driveId?`drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`:`me/drive/items/${encodeURIComponent(itemId)}`,detailUrl=`https://graph.microsoft.com/v1.0/${detailPath}`;response=await fetch(detailUrl,{headers,cache:'no-store'});if(!response.ok){let detail='';try{detail=(await response.json())?.error?.message||''}catch(error){}throw new Error(`최신 OneDrive 파일 확인 실패 (${response.status})${detail?`: ${detail}`:''}`)}let item=await response.json();if(!downloadUrlOf(item)){response=await fetch(`${detailUrl}?select=id,name,eTag,lastModifiedDateTime,@microsoft.graph.downloadUrl`,{headers,cache:'no-store'});if(response.ok)item={...item,...await response.json()}}if(!item.name)item.name=itemName(match);item.graphContentUrl=`${detailUrl}/content`;return item}
    async function loadMicrosoftCashPlan"""
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'Microsoft selector target count={count}')

text = text.replace("MS_ETAG_KEY='actgames-onedrive-cash-plan-etag-v591'", "MS_ETAG_KEY='actgames-onedrive-cash-plan-etag-v592'", 1)

old_load = "const item=await findMicrosoftDriveItem(token,sourceUrl,stored.model?.fileName),fileName=item.name||microsoftFileName(sourceUrl,stored.model?.fileName),etag=item.eTag||'';if(!force&&etag&&localStorage.getItem(MS_ETAG_KEY)===etag){"
new_load = "const item=await findMicrosoftDriveItem(token,sourceUrl,stored.model?.fileName),fileName=item.name||microsoftFileName(sourceUrl,stored.model?.fileName),etag=item.eTag||'',sourceFingerprint=`${item.id||''}:${etag}`;if(!force&&etag&&localStorage.getItem(MS_ETAG_KEY)===sourceFingerprint){"
if old_load not in text:
    raise SystemExit('load fingerprint target not found')
text = text.replace(old_load, new_load, 1)
text = text.replace("if(etag)localStorage.setItem(MS_ETAG_KEY,etag);setMicrosoftStatus", "if(etag)localStorage.setItem(MS_ETAG_KEY,sourceFingerprint);setMicrosoftStatus", 1)

text = text.replace(
    "대시보드를 열어 둔 동안 OneDrive 원본의 변경 여부를 1분마다 확인하고, 수정본이 있으면 자동으로 계산값을 갱신합니다.",
    "대시보드를 열어 둔 동안 OneDrive에서 'ACT_일자별_자금계획' 이름이 포함된 Excel 중 최종 수정시각이 가장 최신인 파일을 1분마다 확인해 자동 반영합니다.",
    1,
)
text = text.replace(
    "관리자가 대시보드를 열면 OneDrive 원본을 확인하고, 변경된 Excel이 있으면 자동으로 계산·공유합니다. Power Automate 유료 기능은 사용하지 않습니다.",
    "관리자가 대시보드를 열면 OneDrive에서 'ACT_일자별_자금계획' 이름이 포함된 Excel 중 최종 수정시각이 가장 최신인 파일을 자동 선택해 계산·공유합니다. 약 1분마다 새 파일 여부를 확인합니다.",
    1,
)
text = text.replace('CASH WORKSPACE V5.12.2 2026.08.31', 'CASH WORKSPACE V5.12.3 2026.09.03', 1)
text = text.replace('회사계정 보호 · v5.12.2', '회사계정 보호 · v5.12.3', 1)

if text == original:
    raise SystemExit('no changes made')

checks = [
    "MS_ETAG_KEY='actgames-onedrive-cash-plan-etag-v592'",
    "const match=candidates[0]",
    "sourceFingerprint=`${item.id||''}:${etag}`",
    "rows.push(parseDailyBalanceSheet(sheet,name,date))",
]
for check in checks:
    if check not in text:
        raise SystemExit(f'missing check: {check}')
if "시트명 날짜와 표 안의 기준일이 다릅니다." in text:
    raise SystemExit('old strict sheet-name/date rejection still present')

path.write_text(text, encoding='utf-8')
print('patch validation passed')
