import json
import re
import html as html_lib
import ssl
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

KB_URL = "https://fx.kbstar.com/"
SMBS_URL = "https://www.smbs.biz/ExRate/TodayExRatePop.jsp"
REPORT_PATH = Path("report.json")
DEBUG_PATH = Path("kb_network_debug.json")
KST = ZoneInfo("Asia/Seoul")


def to_float(v: str) -> float:
    return float(v.replace(",", "").strip())


def load_report() -> dict:
    if REPORT_PATH.exists():
        return json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    return {}


def normalize_text(text: str) -> str:
    text = text.replace("\u00a0", " ").replace("−", "-").replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", text).strip()


def find_forecast_range(text: str):
    flat = normalize_text(text)
    m = re.search(r"금일\s*달러/원\s*환율\s*([0-9,]+)\s*~\s*([0-9,]+)원\s*전망", flat)
    if not m:
        return None
    return to_float(m.group(1)), to_float(m.group(2))


def find_smbs_rate(text: str):
    flat = normalize_text(html_lib.unescape(re.sub(r"<[^>]+>", " ", text)))
    patterns = [
        r"미국\s*달러\s*\(\s*USD\s*\)\s*([0-9,]+(?:\.[0-9]+)?)",
        r"USD\s*/\s*KRW[^0-9]{0,80}([0-9,]+(?:\.[0-9]+)?)",
    ]
    rate = None
    for pattern in patterns:
        match = re.search(pattern, flat, flags=re.I)
        if match:
            candidate = to_float(match.group(1))
            if 1100 <= candidate <= 1800:
                rate = candidate
                break
    if rate is None:
        print("----- SMBS BODY PREVIEW -----")
        print(flat[:5000])
        print("----- END SMBS PREVIEW -----")
        raise RuntimeError("서울외국환중개 페이지에서 USD 매매기준율을 찾지 못했습니다.")

    dates = []
    for y, m, d in re.findall(r"(20\d{2})\s*(?:[.\-/]|년\s*)(\d{1,2})\s*(?:[.\-/]|월\s*)(\d{1,2})", flat):
        try:
            dates.append(datetime(int(y), int(m), int(d)).date())
        except ValueError:
            pass
    today = datetime.now(KST).date()
    valid_dates = [d for d in dates if d <= today]
    rate_date = max(valid_dates).isoformat() if valid_dates else today.isoformat()
    return rate, rate_date


def get_smbs_rate(old_rate):
    request = Request(
        SMBS_URL,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    try:
        try:
            raw = urlopen(request, timeout=40).read()
        except ssl.SSLCertVerificationError as cert_error:
            # 서울외국환중개 공식 도메인의 인증서 이름 불일치가 발생하는 동안에만
            # 인증서 검증을 생략하고, 아래 환율 범위·전일 대비 검증을 그대로 적용합니다.
            print(f"SMBS certificate verification failed; retrying official host: {cert_error}")
            context = ssl._create_unverified_context()
            raw = urlopen(request, timeout=40, context=context).read()
        for encoding in ("utf-8", "cp949", "euc-kr"):
            try:
                text = raw.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            text = raw.decode("utf-8", errors="replace")
        rate, rate_date = find_smbs_rate(text)
    except Exception as first_error:
        print(f"Direct SMBS fetch failed, retrying with browser: {first_error}")
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
            page = browser.new_page(viewport={"width": 1280, "height": 1000}, ignore_https_errors=True)
            page.goto(SMBS_URL, wait_until="commit", timeout=45000)
            page.wait_for_timeout(5000)
            text = page.locator("body").inner_text(timeout=30000)
            browser.close()
        rate, rate_date = find_smbs_rate(text)

    if old_rate and abs(rate - float(old_rate)) > 150:
        raise RuntimeError(f"서울외국환중개 환율 급변 검증 실패: {old_rate} -> {rate}")
    return rate, rate_date


def find_market_watch(text: str, old_rate):
    flat = normalize_text(text)
    forecast = find_forecast_range(flat)
    candidates = []

    for m in re.finditer(r"USD/KRW", flat, flags=re.I):
        start = max(0, m.start() - 1200)
        end = min(len(flat), m.end() + 800)
        context = flat[start:end]
        after = flat[m.end():end]

        rate_match = re.search(r"(?<!\d)(1[1-8][0-9]{2}(?:\.[0-9]+)?|1,[1-8][0-9]{2}(?:\.[0-9]+)?)(?!\d)", after)
        if not rate_match:
            continue

        rate = to_float(rate_match.group(1))
        if not (1100 <= rate <= 1800):
            continue
        if old_rate and abs(rate - float(old_rate)) > 150:
            continue
        if forecast:
            lo, hi = forecast
            if not (lo - 120 <= rate <= hi + 120):
                continue

        tail = after[rate_match.end():rate_match.end() + 180]
        delta = None
        pct = None

        dm = re.search(r"(?:▲|△)?\s*([+]?[0-9,]+(?:\.[0-9]+)?)\s*\(([+]?[0-9.]+)%\)", tail)
        if dm:
            delta = to_float(dm.group(1))
            pct = float(dm.group(2))
        else:
            dm = re.search(r"(?:▼|▽)\s*([0-9,]+(?:\.[0-9]+)?)\s*\((-?[0-9.]+)%\)", tail)
            if dm:
                delta = -to_float(dm.group(1))
                pct = float(dm.group(2))
            else:
                dm = re.search(r"([+-][0-9,]+(?:\.[0-9]+)?)\s*\(([+-]?[0-9.]+)%\)", tail)
                if dm:
                    delta = to_float(dm.group(1))
                    pct = float(dm.group(2))

        tm = re.search(r"(20\d{2}[.\-/]\d{2}[.\-/]\d{2}\s+\d{2}:\d{2}:\d{2})", context)
        kb_time = tm.group(1) if tm else None

        score = 0
        if re.search(r"Market\s*Watch", context, flags=re.I):
            score += 20
        if kb_time:
            score += 5
        if delta is not None:
            score += 5
        if old_rate:
            score += max(0, 10 - abs(rate - float(old_rate)) / 10)

        candidates.append((score, m.start(), rate, delta, pct, kb_time, context))

    if not candidates:
        print("----- KB STAR FX BODY PREVIEW -----")
        print(text[:12000])
        print("----- END PREVIEW -----")
        raise RuntimeError("KB STAR FX 페이지에서 유효한 USD/KRW 시장환율을 찾지 못했습니다.")

    candidates.sort(key=lambda x: (x[0], x[1]))
    _, _, rate, delta, pct, kb_time, context = candidates[-1]
    print("Selected KB STAR FX context:", context[:1200])
    return (rate, delta, pct, kb_time), forecast


def interesting_payload(text: str) -> bool:
    t = text.lower()
    if "usd/krw" in t or "usdkrw" in t or "market watch" in t:
        return True
    if re.search(r"\b1[1-8][0-9]{2}(?:\.[0-9]+)?\b", text) and any(k in t for k in ["rate", "fx", "quote", "spot", "krw", "usd"]):
        return True
    return False


def get_kb_rate(old_rate):
    debug = {
        "captured_at_kst": datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S KST"),
        "attempts": [],
        "http": [],
        "websocket": [],
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        errors = []
        try:
            for attempt in range(1, 4):
                page = browser.new_page(
                    viewport={"width": 1440, "height": 1200},
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/151.0.0.0 Safari/537.36"
                    ),
                )

                def on_response(resp):
                    if len(debug["http"]) >= 60:
                        return
                    try:
                        ct = (resp.headers.get("content-type") or "").lower()
                        if not any(x in ct for x in ["json", "text", "javascript", "xml"]):
                            return
                        body = resp.text()
                        if interesting_payload(body) or any(
                            k in resp.url.lower() for k in ["fx", "rate", "quote", "market", "price"]
                        ):
                            debug["http"].append({
                                "url": resp.url,
                                "status": resp.status,
                                "content_type": ct,
                                "body_preview": body[:3000],
                            })
                    except Exception:
                        pass

                def on_websocket(ws):
                    entry = {"url": ws.url, "frames": []}
                    debug["websocket"].append(entry)

                    def on_frame(payload):
                        if len(entry["frames"]) >= 40:
                            return
                        try:
                            value = payload if isinstance(payload, str) else str(payload)
                            if interesting_payload(value) or re.search(
                                r"\b1[1-8][0-9]{2}(?:\.[0-9]+)?\b", value
                            ):
                                entry["frames"].append(value[:3000])
                        except Exception:
                            pass

                    ws.on("framereceived", on_frame)

                page.on("response", on_response)
                page.on("websocket", on_websocket)
                try:
                    # KB 페이지는 부가 리소스 때문에 DOMContentLoaded가 지연될 수 있어
                    # 최초 응답(commit)까지만 기다린 뒤 본문을 별도로 읽습니다.
                    page.goto(KB_URL, wait_until="commit", timeout=45000)
                    page.wait_for_timeout(18000)
                    text = page.locator("body").inner_text(timeout=25000)
                    result = find_market_watch(text, old_rate)
                    debug["attempts"].append({"attempt": attempt, "status": "success"})
                    DEBUG_PATH.write_text(
                        json.dumps(debug, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8",
                    )
                    return result
                except Exception as error:
                    message = f"{type(error).__name__}: {error}"
                    errors.append(message)
                    debug["attempts"].append({"attempt": attempt, "status": "failed", "error": message})
                    print(f"KB STAR FX attempt {attempt}/3 failed: {message}")
                finally:
                    page.close()
        finally:
            browser.close()

    DEBUG_PATH.write_text(json.dumps(debug, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    raise RuntimeError("KB STAR FX 자동조회 3회 실패: " + " | ".join(errors))


def main():
    report = load_report()
    old_rate = report.get("current_rate")
    now = datetime.now(KST)
    forecast = None
    rate = old_rate
    delta = report.get("rate_change")
    pct = report.get("rate_change_pct")

    try:
        (rate, delta, pct, kb_time), forecast = get_kb_rate(old_rate)
        previous_close = round(rate - delta, 4) if delta is not None else None
        report["current_rate"] = rate
        report["previous_close"] = previous_close
        report["rate_updated_at_kst"] = (
            kb_time.replace(".", "-").replace("/", "-") + " KST"
            if kb_time else now.strftime("%Y-%m-%d %H:%M:%S KST")
        )
        report["rate_source"] = "KB STAR FX Market Watch"
        report["rate_source_time"] = report["rate_updated_at_kst"]
        report["rate_url"] = KB_URL
        report["rate_change"] = delta
        report["rate_change_pct"] = pct
        report["rate_check_status"] = "success"
        report.pop("rate_fetch_error", None)
    except Exception as error:
        # 이전 정상값은 보존하고 오류와 확인시각을 기록해 대시보드가
        # '최신값'으로 오인하지 않도록 합니다.
        report["rate_check_status"] = "failed"
        report["rate_fetch_error"] = f"{type(error).__name__}: {error}"
        print(f"KB STAR FX update failed; keeping previous rate: {error}")

    report["rate_job_checked_at_kst"] = now.strftime("%Y-%m-%d %H:%M:%S KST")

    try:
        smbs_rate, smbs_rate_date = get_smbs_rate(report.get("smbs_base_rate"))
        report["smbs_base_rate"] = smbs_rate
        report["smbs_rate_date"] = smbs_rate_date
        report["smbs_rate_updated_at_kst"] = now.strftime("%Y-%m-%d %H:%M:%S KST")
        report["smbs_rate_source"] = "서울외국환중개 매매기준율"
        report["smbs_rate_url"] = SMBS_URL
        report.pop("smbs_rate_error", None)
        print(f"SMBS USD/KRW base rate updated: {smbs_rate} ({smbs_rate_date})")
    except Exception as error:
        report["smbs_rate_error"] = f"{type(error).__name__}: {error}"
        print(f"SMBS update skipped; keeping previous value: {error}")

    if forecast:
        lo, hi = forecast
        report["kb_daily_forecast_range"] = [lo, hi]

    REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"KB STAR FX job completed: rate={report.get('current_rate')} "
        f"status={report.get('rate_check_status')} checked={report['rate_job_checked_at_kst']}"
    )


if __name__ == "__main__":
    main()
