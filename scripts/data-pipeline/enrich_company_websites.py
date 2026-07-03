#!/usr/bin/env python3
"""v0.24 — Company enrichment: fetch each operator's Dwellsy company page and
extract the PM's own website (+ phone) from the page's __NEXT_DATA__ JSON.

Dwellsy company pages are server-rendered Next.js: the company record is inline
in <script id="__NEXT_DATA__"> at props.pageProps.company.{website,phone,name}.
So this is a clean JSON parse, not brittle HTML scraping.

Input:  src/data/scorecard_data.json (operators + their companyId)
Output: src/data/company_enrichment.json  { "<companyId>": {website, phone, name} }

Resumable: skips companyIds already recorded. Rerun to fill gaps / refresh.
stdlib only. Polite: small thread pool, per-request timeout.
"""
import json
import os
import random
import re
import ssl
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
SEED = os.path.join(REPO_ROOT, "src", "data", "scorecard_data.json")
OUT = os.path.join(REPO_ROOT, "src", "data", "company_enrichment.json")
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
WORKERS = 2       # gentle — Dwellsy throttles concurrent load into shell pages
TIMEOUT = 25
RETRIES = 4       # a throttled response omits __NEXT_DATA__; back off + retry
NEXT_RE = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.S
)


def _make_ssl_context():
    """macOS python.org builds often lack a CA bundle; try the system bundle
    (what curl uses) / certifi, then fall back to unverified — these are public,
    read-only marketing pages, so unverified read is an acceptable last resort."""
    for cafile in ("/etc/ssl/cert.pem", "/usr/local/etc/openssl@3/cert.pem"):
        if os.path.exists(cafile):
            try:
                return ssl.create_default_context(cafile=cafile)
            except Exception:  # noqa: BLE001
                pass
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:  # noqa: BLE001
        pass
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


SSL_CTX = _make_ssl_context()


def fetch_company(company_id):
    """Return (company_id, {website, phone, name}) or (company_id, {error}).
    A throttled response returns a shell without __NEXT_DATA__; retry with
    backoff before giving up so transient throttling doesn't lose an operator."""
    url = f"https://dwellsy.com/company/{company_id}"
    last_err = "unknown"
    for attempt in range(RETRIES):
        if attempt:
            time.sleep(attempt * 1.5 + random.random())
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT, context=SSL_CTX) as r:
                html = r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001 — network/HTTP
            last_err = str(e)[:120]
            continue
        m = NEXT_RE.search(html)
        if not m:
            last_err = "no __NEXT_DATA__"  # throttled shell — retry
            continue
        try:
            data = json.loads(m.group(1))
            c = (data.get("props", {}).get("pageProps", {}) or {}).get("company", {}) or {}
        except Exception as e:  # noqa: BLE001
            return company_id, {"error": f"parse: {str(e)[:80]}"}
        return company_id, {
            "website": (c.get("website") or "").strip() or None,
            "phone": (c.get("phone") or "").strip() or None,
            "name": (c.get("name") or "").strip() or None,
        }
    return company_id, {"error": last_err}


def main():
    seed = json.load(open(SEED))
    company_ids = sorted({
        p["companyId"] for p in seed["pms"]
        if p.get("companyId")
    })
    cache = {}
    if os.path.exists(OUT):
        try:
            cache = json.load(open(OUT))
        except Exception:  # noqa: BLE001
            cache = {}
    # Retry only genuine misses (network/parse errors); keep good + confirmed-empty.
    todo = [
        cid for cid in company_ids
        if cid not in cache or "error" in cache.get(cid, {})
    ]
    print(f"operators: {len(company_ids)} | already done: "
          f"{len(company_ids) - len(todo)} | to fetch: {len(todo)}")
    done = 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(fetch_company, cid): cid for cid in todo}
        for fut in as_completed(futs):
            cid, res = fut.result()
            cache[cid] = res
            done += 1
            if done % 100 == 0 or done == len(todo):
                json.dump(cache, open(OUT, "w"), separators=(",", ":"),
                          sort_keys=True)
                rate = done / max(time.time() - t0, 0.001)
                print(f"  {done}/{len(todo)} ({rate:.1f}/s)", flush=True)
    json.dump(cache, open(OUT, "w"), separators=(",", ":"), sort_keys=True)
    with_site = sum(1 for v in cache.values() if v.get("website"))
    errors = sum(1 for v in cache.values() if v.get("error"))
    print(f"DONE. {len(cache)} companies | with website: {with_site} | "
          f"errors: {errors} | wrote {OUT} ({os.path.getsize(OUT):,} bytes)")


if __name__ == "__main__":
    sys.exit(main())
