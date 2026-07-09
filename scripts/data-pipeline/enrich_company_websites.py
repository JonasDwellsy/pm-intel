#!/usr/bin/env python3
"""v0.25 — Company enrichment: fetch each operator's Dwellsy company page and
extract the PM's own website (+ phone) from the page's __NEXT_DATA__ JSON.

Dwellsy company pages are server-rendered Next.js: the company record is inline
in <script id="__NEXT_DATA__"> at props.pageProps.company.{website,phone,name}.
So this is a clean JSON parse, not brittle HTML scraping.

Input:  src/data/scorecard_data.json (operators + their companyId)
Output: src/data/company_enrichment.json
        { "<companyId>": {website, phone, name, checkedAt, nextData} }

Each record now carries `checkedAt` (ISO-UTC) + `nextData` (bool: was the page's
__NEXT_DATA__ present) so we can tell "genuinely no website" from "never
checked" / "throttled shell" — the v0.24 run lost ~1,400 operators to throttling
that were silently recorded as `{website:null}` with no error, so a plain rerun
skipped them. A throttle now records an `error` (retried next run), never a
permanent null.

Modes (stdlib argparse):
  (default)     fetch operators missing from the cache + prior errors.
  --recover     ALSO re-fetch fully-empty records (website AND phone both null,
                no error) — the throttle-suspect bucket. Phone-confirmed empties
                are left alone (a page that yielded a phone but no website is a
                genuine no-website operator).
  --sample N    cap the run to N operators (confirm genuine-vs-throttle cheaply
                before committing to a full recovery pass).
  --delay S     inter-request politeness delay in seconds (default 0.8 + jitter);
                the missing v0.24 rate-gate that caused the throttle.

Resumable: flushes every 25 completions; a mid-run throttle loses <25.
stdlib only.
"""
import argparse
import json
import os
import random
import re
import ssl
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
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


def fetch_company(company_id, delay):
    """Return (company_id, record). A success record carries website/phone/name
    + checkedAt + nextData=True. A throttle (missing __NEXT_DATA__, empty company
    object, or 429/network error, after retries) returns {"error": ...} so it is
    retried on the next run rather than recorded as a permanent null."""
    url = f"https://dwellsy.com/company/{company_id}"
    last_err = "unknown"
    for attempt in range(RETRIES):
        # Politeness delay BEFORE every request (jittered). This steady-state
        # rate-gate — absent in v0.24 — is the actual throttle fix; the
        # per-attempt backoff below only spaced retries of the same operator.
        time.sleep(delay + random.random() * 0.4 + attempt * 1.5)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT, context=SSL_CTX) as r:
                html = r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:  # noqa: BLE001
            # Honor Retry-After on 429/503 before the next attempt.
            if e.code in (429, 503):
                ra = e.headers.get("Retry-After") if e.headers else None
                try:
                    time.sleep(min(30, float(ra)) if ra else 5.0)
                except (TypeError, ValueError):
                    time.sleep(5.0)
            last_err = f"http {e.code}"
            continue
        except Exception as e:  # noqa: BLE001 — network
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
        if not c:
            # Parsed, but the company object is empty — a soft-throttle
            # symptom the v0.24 code recorded as a legit null. Retry; if it
            # stays empty across attempts, fall through to error (not null).
            last_err = "empty company"
            continue
        return company_id, {
            "website": (c.get("website") or "").strip() or None,
            "phone": (c.get("phone") or "").strip() or None,
            "name": (c.get("name") or "").strip() or None,
            "checkedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "nextData": True,
        }
    return company_id, {"error": last_err}


def select_todo(company_ids, cache, recover):
    """Missing + prior-error always. With --recover, also the fully-empty
    throttle-suspect bucket (no website, no phone, no error)."""
    todo = []
    for cid in company_ids:
        rec = cache.get(cid)
        if rec is None or "error" in rec:
            todo.append(cid)
        elif recover and not rec.get("website") and not rec.get("phone"):
            todo.append(cid)
    return todo


def main():
    ap = argparse.ArgumentParser(description="Enrich operator websites from Dwellsy company pages.")
    ap.add_argument("--recover", action="store_true",
                    help="also re-fetch fully-empty (throttle-suspect) records")
    ap.add_argument("--sample", type=int, default=0,
                    help="cap the run to N operators (0 = no cap)")
    ap.add_argument("--delay", type=float, default=0.8,
                    help="inter-request politeness delay in seconds (default 0.8)")
    args = ap.parse_args()

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
    todo = select_todo(company_ids, cache, args.recover)
    if args.sample:
        todo = todo[:args.sample]
    print(f"operators: {len(company_ids)} | cached: {len(cache)} | "
          f"to fetch: {len(todo)} | recover={args.recover} sample={args.sample} "
          f"delay={args.delay}s workers={WORKERS}")
    done = 0
    recovered = 0
    t0 = time.time()

    def flush():
        json.dump(cache, open(OUT, "w"), separators=(",", ":"), sort_keys=True)

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(fetch_company, cid, args.delay): cid for cid in todo}
        for fut in as_completed(futs):
            cid, res = fut.result()
            if res.get("website"):
                recovered += 1
            cache[cid] = res
            done += 1
            if done % 25 == 0 or done == len(todo):
                flush()
                rate = done / max(time.time() - t0, 0.001)
                print(f"  {done}/{len(todo)} ({rate:.2f}/s) | websites this run: {recovered}",
                      flush=True)
    flush()
    with_site = sum(1 for v in cache.values() if v.get("website"))
    errors = sum(1 for v in cache.values() if v.get("error"))
    print(f"DONE. {len(cache)} companies | with website: {with_site} | "
          f"errors (will retry next run): {errors} | websites found this run: {recovered} | "
          f"wrote {OUT} ({os.path.getsize(OUT):,} bytes)")


if __name__ == "__main__":
    sys.exit(main())
