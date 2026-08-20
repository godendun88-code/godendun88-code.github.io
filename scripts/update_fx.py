import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

KB_URL = "https://fx.kbstar.com/"
REPORT_PATH = Path("report.json")
KST = ZoneInfo("Asia/Seoul")


def to_float(v: str) -> float:
    return float(v.replace(",", "").strip())


def load_report() -> dict:
    if REPORT_PATH.exists():
        return json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    return {}


def find_forecast_range(text: str):
    m = re.search(r"금일\s*달러/원\s*환율\s*([0-9,]+)\s*~\s*([0-9,]+)원\s*전망", text)
    if not m:
        return None
    return to_float(m.group(1)), to_float(m.group(2))


def find_market_watch(text: str, old_rate):
    forecast = find_forecast_range(text)
    sections = text.split("Market Watch")
    candidates = []

    for sec in sections[1:]:
        m = re.search(
            r"USD/KRW\s*([0-9,]+(?:\.[0-9]+)?)\s*([+-]?[0-9,]+(?:\.[0-9]+)?)\s*\(([+-]?[0-9.]+)%\)",
            sec,
            flags=re.S,
        )
        if not m:
            continue

        rate = to_float(m.group(1))
        delta = to_float(m.group(2))
        pct = float(m.group(3))

        if not (1100 <= rate <= 1800):
            continue
        if forecast:
            lo, hi = forecast
            if not (lo - 100 <= rate <= hi + 100):
                continue
        if old_rate and abs(rate - old_rate) > 150:
            continue

        tm = re.search(r"(20\d{2}\.\d{2}\.\d{2}\s+\d{2}:\d{2}:\d{2})", sec[:500])
        candidates.append((rate, delta, pct, tm.group(1) if tm else None))

    if not candidates:
        print("----- KB STAR FX BODY PREVIEW -----")
        print(text[:6000])
        print("----- END PREVIEW -----")
        raise RuntimeError("KB STAR FX Market Watch의 유효한 USD/KRW 값을 찾지 못했습니다.")

    return candidates[-1], forecast


def get_kb_rate(old_rate):
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
        page.goto(KB_URL, wait_until="domcontentloaded", timeout=90000)
        page.wait_for_timeout(15000)
        text = page.locator("body").inner_text(timeout=30000)
        browser.close()

    return find_market_watch(text, old_rate)


def main():
    report = load_report()
    old_rate = report.get("current_rate")
    now = datetime.now(KST)

    (rate, delta, pct, kb_time), forecast = get_kb_rate(old_rate)
    previous_close = round(rate - delta, 4)

    report["current_rate"] = rate
    report["previous_close"] = previous_close
    report["rate_updated_at_kst"] = (
        kb_time.replace(".", "-") + " KST" if kb_time else now.strftime("%Y-%m-%d %H:%M:%S KST")
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
    print(f"KB STAR FX USD/KRW updated: {rate} ({delta:+.2f}, {pct:+.2f}%)")


if __name__ == "__main__":
    main()
