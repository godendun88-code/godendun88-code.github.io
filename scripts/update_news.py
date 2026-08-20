import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

REPORT_PATH = Path("report.json")
KST = ZoneInfo("Asia/Seoul")

QUERIES = [
    'USD KRW Korean won Reuters when:1d',
    'Federal Reserve rates Treasury yields dollar Reuters when:1d',
    'US jobs employment inflation CPI PCE Reuters when:1d',
    'oil Brent Iran Middle East dollar Reuters when:1d',
]

TRUSTED = {
    'Reuters', 'Associated Press', 'AP News', 'Bloomberg', 'Financial Times',
    'The Wall Street Journal', 'CNBC', 'Yonhap News Agency', 'The Korea Herald',
    'The Korea Times'
}


def fetch_rss(query: str):
    q = urllib.parse.quote_plus(query)
    url = f"https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en"
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36'
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()

    root = ET.fromstring(data)
    out = []
    for item in root.findall('./channel/item'):
        title = (item.findtext('title') or '').strip()
        link = (item.findtext('link') or '').strip()
        pub = (item.findtext('pubDate') or '').strip()
        source_el = item.find('source')
        source = (source_el.text or '').strip() if source_el is not None else ''
        if not title or not link:
            continue
        out.append({'title': title, 'url': link, 'source': source, 'pub': pub})
    return out


def pub_dt(item):
    try:
        dt = parsedate_to_datetime(item.get('pub', ''))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return datetime(1970, 1, 1, tzinfo=timezone.utc)


def clean_title(title: str, source: str):
    t = re.sub(r'\s+', ' ', title).strip()
    if source and t.endswith(' - ' + source):
        t = t[:-(len(source) + 3)].strip()
    return t


def category(title: str):
    t = title.lower()
    if any(k in t for k in ['payroll', 'unemployment', 'jobless', 'employment', 'jobs report', 'labor market']):
        return '고용'
    if any(k in t for k in ['inflation', 'cpi', 'pce', 'consumer prices', 'prices rise', 'prices fall']):
        return '물가'
    if any(k in t for k in ['fed', 'federal reserve', 'rate cut', 'rate hike', 'interest rate', 'powell']):
        return '연준·금리'
    if any(k in t for k in ['treasury', 'yield', 'bond market']):
        return '미 국채금리'
    if any(k in t for k in ['oil', 'brent', 'crude', 'iran', 'middle east', 'hormuz', 'war']):
        return '유가·지정학'
    if any(k in t for k in ['won', 'krw', 'korea', 'kospi', 'foreign investors']):
        return '원화·국내수급'
    if any(k in t for k in ['dollar', 'dxy', 'currency']):
        return '달러'
    return '외환시장'


def signal(title: str):
    t = title.lower()
    down = [
        'dollar falls', 'dollar weakens', 'dollar slips', 'dollar drops', 'three-month low',
        'yields fall', 'yields drop', 'yield falls', 'yield drops', 'rate cut', 'dovish',
        'jobs weaken', 'job growth slows', 'unemployment rises', 'inflation cools',
        'inflation eases', 'prices cool', 'oil falls', 'oil drops', 'brent falls'
    ]
    up = [
        'dollar rises', 'dollar gains', 'dollar strengthens', 'dollar jumps',
        'yields rise', 'yields climb', 'yield rises', 'yield climbs', 'rate hike', 'hawkish',
        'jobs strong', 'job growth accelerates', 'unemployment falls', 'inflation rises',
        'inflation heats', 'oil rises', 'oil jumps', 'brent rises', 'war escalates'
    ]
    score = 0
    if any(k in t for k in down):
        score -= 1
    if any(k in t for k in up):
        score += 1
    return score


def driver_sentence(cat: str, title: str):
    t = title.lower()
    if cat == '고용':
        if any(k in t for k in ['weaken', 'slows', 'unemployment rises', 'jobless claims rise']):
            return '미국 고용 둔화 관련 보도가 확인돼 연준의 긴축 필요성을 낮추고 달러 약세 요인으로 작용하고 있습니다.'
        if any(k in t for k in ['strong', 'accelerates', 'unemployment falls']):
            return '미국 고용 강세 관련 보도가 확인돼 금리 인하 기대를 낮추고 달러 강세 요인으로 작용하고 있습니다.'
        return f'미국 고용 관련 최신 기사("{title}")가 확인돼 고용지표가 연준 금리 기대와 달러 방향성을 좌우하는 변수로 부각되고 있습니다.'

    if cat == '물가':
        if any(k in t for k in ['cools', 'eases', 'falls', 'slows']):
            return '미국 물가 둔화 관련 보도가 확인돼 추가 긴축 필요성이 낮아지면서 달러 강세 압력을 완화하는 요인으로 작용하고 있습니다.'
        if any(k in t for k in ['rises', 'heats', 'accelerates']):
            return '미국 물가 상승 압력이 다시 부각되며 연준의 매파적 금리 경로 우려가 커져 달러 강세 요인으로 작용하고 있습니다.'
        return f'미국 물가 관련 최신 기사("{title}")가 확인돼 CPI·PCE 흐름이 연준 금리 경로의 핵심 변수로 작용하고 있습니다.'

    if cat == '연준·금리':
        if 'rate cut' in t or 'dovish' in t:
            return '연준의 금리 인하 기대가 부각되며 미국 금리 전망이 낮아져 달러 약세 압력이 커지는 요인으로 작용하고 있습니다.'
        if 'rate hike' in t or 'hawkish' in t:
            return '연준의 추가 금리 인상 또는 매파적 기조 우려가 부각돼 달러 강세 압력이 높아지는 요인으로 작용하고 있습니다.'
        return f'연준·금리 관련 최신 기사("{title}")가 확인돼 향후 금리 경로에 대한 기대 변화가 달러 방향성을 좌우하고 있습니다.'

    if cat == '미 국채금리':
        if any(k in t for k in ['drop', 'fall', 'lower']):
            return '미 국채금리 하락 관련 보도가 확인돼 달러의 금리 매력이 낮아지면서 원/달러 환율 하락 압력으로 작용하고 있습니다.'
        if any(k in t for k in ['rise', 'climb', 'higher']):
            return '미 국채금리 상승 관련 보도가 확인돼 달러 수요를 지지하면서 원/달러 환율 상승 압력으로 작용하고 있습니다.'
        return f'미 국채금리 관련 최신 기사("{title}")가 확인돼 장기금리 흐름이 달러 강도에 영향을 주고 있습니다.'

    if cat == '유가·지정학':
        if any(k in t for k in ['rise', 'jump', 'higher', 'war', 'iran', 'hormuz']):
            return '유가 및 중동 지정학적 불확실성이 부각돼 에너지 수입 의존도가 높은 원화에는 약세 부담 요인으로 작용하고 있습니다.'
        if any(k in t for k in ['fall', 'drop', 'lower']):
            return '국제유가 하락이 한국의 수입물가 부담을 낮추는 방향으로 작용해 원화에는 상대적으로 우호적인 요인입니다.'
        return f'유가·지정학 관련 최신 기사("{title}")가 확인돼 원화 변동성 확대 요인으로 작용하고 있습니다.'

    if cat == '원화·국내수급':
        return f'원화·국내수급 관련 최신 기사("{title}")가 확인돼 외국인 자금 흐름과 원화 수급이 단기 환율 변수로 작용하고 있습니다.'

    if cat == '달러':
        if any(k in t for k in ['falls', 'weakens', 'slips', 'drops', 'low']):
            return '글로벌 달러 약세 관련 보도가 이어지며 원/달러 환율에는 하락 압력으로 작용하고 있습니다.'
        if any(k in t for k in ['rises', 'gains', 'strengthens', 'jumps']):
            return '글로벌 달러 강세 관련 보도가 이어지며 원/달러 환율에는 상승 압력으로 작용하고 있습니다.'
        return f'달러 관련 최신 기사("{title}")가 확인돼 달러인덱스 방향성이 원/달러 환율의 핵심 변수로 작용하고 있습니다.'

    return f'외환시장 관련 최신 기사("{title}")가 확인돼 단기 환율 변동 요인으로 작용하고 있습니다.'


def main():
    report = json.loads(REPORT_PATH.read_text(encoding='utf-8')) if REPORT_PATH.exists() else {}

    raw = []
    for q in QUERIES:
        try:
            raw.extend(fetch_rss(q))
        except Exception as e:
            print('RSS fetch failed:', q, e)

    seen = set()
    items = []
    for it in sorted(raw, key=pub_dt, reverse=True):
        source = it.get('source', '')
        if source and source not in TRUSTED and 'Reuters' not in source:
            continue
        title = clean_title(it['title'], source)
        key = re.sub(r'[^a-z0-9]+', '', title.lower())[:120]
        if not key or key in seen:
            continue
        seen.add(key)
        it['clean_title'] = title
        it['category'] = category(title)
        it['signal'] = signal(title)
        items.append(it)
        if len(items) >= 12:
            break

    if not items:
        raise RuntimeError('신뢰 가능한 최신 외환 뉴스를 찾지 못했습니다.')

    # 서로 다른 범주를 우선해 3개 핵심 요인을 선택
    chosen = []
    used_cat = set()
    preferred_order = ['연준·금리', '고용', '물가', '미 국채금리', '달러', '원화·국내수급', '유가·지정학', '외환시장']
    for cat in preferred_order:
        for it in items:
            if it['category'] == cat and cat not in used_cat:
                chosen.append(it)
                used_cat.add(cat)
                break
        if len(chosen) == 3:
            break
    if len(chosen) < 3:
        for it in items:
            if it not in chosen:
                chosen.append(it)
            if len(chosen) == 3:
                break

    drivers = [driver_sentence(it['category'], it['clean_title']) for it in chosen[:3]]
    score = sum(it['signal'] for it in chosen[:5])
    if score <= -1:
        bias = '하락 우세'
        outlook = '달러 약세·금리 하락 계열의 재료가 상대적으로 우세해 원/달러는 단기 하락 압력이 이어질 가능성이 있으나, 유가와 지정학적 리스크는 하단을 제한할 수 있습니다.'
    elif score >= 1:
        bias = '상승 우세'
        outlook = '달러 강세·금리 상승 계열의 재료가 상대적으로 우세해 원/달러는 단기 상승 압력이 나타날 수 있으나, 국내 수급과 위험선호 회복 여부에 따라 변동성이 예상됩니다.'
    else:
        bias = '혼조'
        outlook = '금리·달러·유가 재료가 엇갈리고 있어 원/달러는 단기적으로 방향성이 제한된 가운데 주요 경제지표 발표 전후 변동성이 커질 가능성이 있습니다.'

    now = datetime.now(KST)
    articles = []
    for it in items[:6]:
        dt = pub_dt(it).astimezone(KST)
        articles.append({
            'title': it['clean_title'],
            'url': it['url'],
            'domain': it.get('source') or 'Google News',
            'seen': dt.strftime('%Y-%m-%d %H:%M KST'),
        })

    report['updated_at_kst'] = now.strftime('%Y-%m-%d %H:%M KST')
    report['market_bias'] = bias
    report['drivers'] = drivers
    report['outlook'] = outlook
    report['articles'] = articles

    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'FX news updated: {len(articles)} articles / bias={bias}')


if __name__ == '__main__':
    main()
