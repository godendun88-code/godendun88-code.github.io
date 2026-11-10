import * as XLSX from 'xlsx';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const required = ['MS_TENANT_ID','MS_CLIENT_ID','MS_CLIENT_SECRET','MS_SHAREPOINT_FILE_URL','FIREBASE_SERVICE_ACCOUNT_JSON'];
for (const key of required) if (!process.env[key]) throw new Error('Missing required secret: '+key);

const clean = value => String(value ?? '').replace(/\s+/g,'').trim();
const number = value => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '').trim().replace(/\s/g,'').replace(/^USD/i,'').replace(/[,원]/g,'');
  if (!text) return null;
  const parsed = Number(text.replace(/^\((.+)\)$/,'-$1'));
  return Number.isFinite(parsed) ? parsed : null;
};
const dateOf = value => {
  if (value instanceof Date && !Number.isNaN(value)) return new Date(value.getFullYear(),value.getMonth(),value.getDate());
  if (typeof value === 'number' && value > 20000) {
    const valueDate = new Date(Date.UTC(1899,11,30)+Math.round(value)*86400000);
    return new Date(valueDate.getUTCFullYear(),valueDate.getUTCMonth(),valueDate.getUTCDate());
  }
  const match = String(value ?? '').match(/(20\d{2})[^0-9]?(\d{1,2})/);
  return match ? new Date(Number(match[1]),Number(match[2])-1,1) : null;
};
const iso = value => {
  const date = dateOf(value);
  return date ? date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0') : '';
};
const eventDate = (month, value) => {
  if (!month || value == null) return null;
  const full = dateOf(value); if (full) return full;
  const text=String(value).trim(), max=new Date(month.getFullYear(),month.getMonth()+1,0).getDate(), match=text.match(/\d+/);
  const day=text.includes('말일') ? max : match ? Math.min(Number(match[0]),max) : 0;
  return day ? new Date(month.getFullYear(),month.getMonth(),day) : null;
};
const dayKey = date => date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');

async function graphToken() {
  const body = new URLSearchParams({client_id:process.env.MS_CLIENT_ID,client_secret:process.env.MS_CLIENT_SECRET,grant_type:'client_credentials',scope:'https://graph.microsoft.com/.default'});
  const response = await fetch('https://login.microsoftonline.com/'+encodeURIComponent(process.env.MS_TENANT_ID)+'/oauth2/v2.0/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  if (!response.ok) throw new Error('Microsoft token request failed: '+response.status);
  return (await response.json()).access_token;
}
const shareId = url => 'u!'+Buffer.from(url).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');

async function downloadWorkbook() {
  const token=await graphToken(), headers={authorization:'Bearer '+token};
  const meta=await fetch('https://graph.microsoft.com/v1.0/shares/'+shareId(process.env.MS_SHAREPOINT_FILE_URL)+'/driveItem',{headers});
  if (!meta.ok) throw new Error('SharePoint file lookup failed: '+meta.status);
  const item=await meta.json(), content=await fetch('https://graph.microsoft.com/v1.0/shares/'+shareId(process.env.MS_SHAREPOINT_FILE_URL)+'/driveItem/content',{headers,redirect:'follow'});
  if (!content.ok) throw new Error('SharePoint Excel download failed: '+content.status);
  return {item, bytes:Buffer.from(await content.arrayBuffer())};
}
function findSheet(workbook) {
  const name=(workbook.SheetNames||[]).find(value=>clean(value)==='자금운용');
  if (!name) throw new Error('자금운용 시트를 찾지 못했습니다.');
  return {name,sheet:workbook.Sheets[name]};
}
function deposits(workbook) {
  const result=[], seen=new Set();
  for (const name of workbook.SheetNames||[]) {
    const rows=XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,raw:true,defval:null});
    for (let row=0;row<Math.min(rows.length,100);row++) {
      const head=(rows[row]||[]).map(clean), bank=head.findIndex(v=>v==='금융기관'), maturity=head.findIndex(v=>v.includes('만기일')), amount=head.findIndex(v=>v==='금액(원)'||v.includes('예치금액')), rate=head.findIndex(v=>v==='금리'||v==='연이율'||v.includes('이율')), product=head.findIndex(v=>v==='상품'||v.includes('상품')), handling=head.findIndex(v=>v.includes('만기')&&(v.includes('처리')||v.includes('구분')||v.includes('재예치')||v.includes('해지')));
      if ([bank,maturity,amount,rate].some(v=>v<0)) continue;
      for (const data of rows.slice(row+1)) {
        const bankName=String(data[bank]??'').trim(), productName=String(product>=0?data[product]??'':'').trim(), principal=number(data[amount]), maturityDate=iso(data[maturity]), rawRate=number(data[rate]), maturityHandling=String(handling>=0?data[handling]??'':'').trim();
        const normalizedRate=rawRate!=null&&rawRate>0&&rawRate<=1?rawRate*100:rawRate;
        if (!product||!principal||!maturityDate||!normalizedRate) continue;
        const key=[product,maturityDate,principal].join('|'); if (seen.has(key)) continue; seen.add(key);
        result.push({bank:bankName,product:productName||'정기예금(원화)',maturity:maturityDate,maturityHandling,rate:normalizedRate,principal,account:''});
      }
    }
  }
  return result;
}
function parse(workbook,file) {
  const {name,sheet}=findSheet(workbook), rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null}), headerRow=rows.findIndex(row=>(row||[]).some(v=>String(v??'').trim()==='정산 및 지급월'));
  if (headerRow<0) throw new Error('자금운용 표 머리글을 찾지 못했습니다.');
  const headers=rows[headerRow].map(clean), t=headers.findIndex(v=>['가용원화','가용자금원화','가용원화잔액'].includes(v));
  if (t<0) throw new Error('자금운용 시트 T열 가용 원화를 찾지 못했습니다.');
  const q=headers.findIndex(v=>v==='원화잔액'), r=headers.findIndex(v=>v==='외화잔액'), status=headers.findIndex(v=>v==='상태'), fx=headers.findIndex(v=>v==='환전필요시기');
  let month=null; const points=[];
  for (let index=headerRow+1;index<rows.length;index++) {
    const row=rows[index]||[]; const foundMonth=dateOf(row[0]); if(foundMonth) month=foundMonth;
    const date=eventDate(month,row[4]); if(!date) continue;
    const available=number(row[t]); if(available==null) continue;
    const key=dayKey(date);
    points.push({date:key,row:index+1,category:String(row[2]??'').trim(),flow:String(row[3]??'').trim(),currency:String(row[6]??'').trim().toUpperCase(),status:status>=0?String(row[status]??'').trim():'',krwIn:number(row[7])||0,krwOut:number(row[8])||0,usdIn:number(row[14])||0,usdOut:number(row[15])||0,planKrwBalance:q>=0?number(row[q]):null,availableKrwBalance:available,krwBalance:available,usdBalance:r>=0?number(row[r])||0:0,exchangeRequired:fx>=0&&clean(row[fx]).includes('환전필요')});
  }
  if (!points.length) throw new Error('T열에서 읽은 가용 원화 행이 없습니다.');
  const jan31=points.filter(p=>p.date==='2027-01-31').at(-1);
  return {fileName:file.name||'SharePoint Excel',fileModified:Date.parse(file.lastModifiedDateTime)||Date.now(),importedAt:Date.now(),sourceSheet:name,points,depositProducts:deposits(workbook),sourceAudit:{availableKrwColumn:t+1,availableKrwHeader:headers[t],availableKrwRows:points.length,jan31AvailableKrw:jan31?.availableKrwBalance??null}};
}
const {item,bytes}=await downloadWorkbook();
const workbook=XLSX.read(bytes,{type:'buffer',cellDates:true});
const model=parse(workbook,item);
const service=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
if (!getApps().length) initializeApp({credential:cert(service)});
const db=getFirestore(), ref=db.doc('dashboard/cashPlan'), prior=(await ref.get()).data()||{};
await ref.set({model:{...(prior.model||{}),...model,sourceUrl:prior.sourceUrl||process.env.MS_SHAREPOINT_FILE_URL},depositProducts:model.depositProducts,updatedAt:FieldValue.serverTimestamp(),updatedBy:'GitHub Actions · SharePoint 자동동기화',cashPlanSync:{state:'ok',at:Date.now(),fileName:item.name||'',etag:item.eTag||'',tColumn:model.sourceAudit}}, {merge:true});
console.log(JSON.stringify({file:item.name,points:model.points.length,jan31:model.sourceAudit.jan31AvailableKrw,deposits:model.depositProducts.length}));
