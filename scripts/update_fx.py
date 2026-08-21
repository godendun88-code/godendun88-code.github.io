import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

KB_URL = "https://fx.kbstar.com/"
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
    debug = {"captured_at_kst": datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S KST"), "http": [], "websocket": []}

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
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
                if interesting_payload(body) or any(k in resp.url.lower() for k in ["fx", "rate", "quote", "market", "price"]):
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
                    s = payload if isinstance(payload, str) else str(payload)
                    if interesting_payload(s) or re.search(r"\b1[1-8][0-9]{2}(?:\.[0-9]+)?\b", s):
                        entry["frames"].append(s[:3000])
                except Exception:
                    pass

            ws.on("framereceived", on_frame)

        page.on("response", on_response)
        page.on("websocket", on_websocket)

        page.goto(KB_URL, wait_until="domcontentloaded", timeout=90000)
        page.wait_for_timeout(18000)
        text = page.locator("body").inner_text(timeout=30000)
        browser.close()

    DEBUG_PATH.write_text(json.dumps(debug, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return find_market_watch(text, old_rate)


def main():
    report = load_report()
    old_rate = report.get("current_rate")
    now = datetime.now(KST)

    (rate, delta, pct, kb_time), forecast = get_kb_rate(old_rate)

    previous_close = None
    if delta is not None:
        previous_close = round(rate - delta, 4)

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

    if forecast:
        lo, hi = forecast
        report["kb_daily_forecast_range"] = [lo, hi]

    REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"KB STAR FX USD/KRW updated: {rate} ({delta}, {pct})")


if __name__ == "__main__":
    main()
