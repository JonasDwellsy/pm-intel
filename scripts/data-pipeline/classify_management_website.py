#!/usr/bin/env python3
"""v0.26 — Management-model website classifier.

Fetch each operator's own website (URL from company_enrichment.json) and
keyword-classify whether it markets third-party property-management services
(hireable) or presents an owned portfolio. Writes a companyId-keyed verdict
cache consumed at seed time by src/lib/management-model/resolve.ts.

Deterministic keyword classifier (no LLM) so reseeds stay reproducible.

Usage (from scripts/data-pipeline/):
  python3 classify_management_website.py            # classify new/uncached
  python3 classify_management_website.py --recover  # also retry prior errors
  python3 classify_management_website.py --sample 20
"""
import argparse
import json
import os
import re
import ssl
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ENRICH_PATH = os.path.join(ROOT, "src", "data", "company_enrichment.json")
CACHE_PATH = os.path.join(ROOT, "src", "data", "management_model_website.json")

UA = "Mozilla/5.0 (compatible; OperatorIQ/1.0; +https://dwellsy.com)"
TIMEOUT = 10
MAX_PAGES = 3
INTERNAL_LINK_RE = re.compile(
    r"(owner|service|manage|property[- ]management|landlord|list[- ]your|rent[- ]your)", re.I
)

# ── keyword classifier (pure, unit-tested) ──────────────────────────
STRONG_TP = [
    "owner portal", "owner login", "owners login", "free rental analysis",
    "list your property", "list your rental", "property management services",
    "for property owners", "rent your home for you",
]
WEAK_TP = [
    "management services", "we manage", "let us manage",
    "professional property management", "management fee", "leasing fee",
    "our services", "become a client", "landlord", "property owners",
    "add your property", "tenant placement",
]
OO_TELLS = [
    "our communities", "our portfolio", "our properties",
    "properties we own", "we own and operate", "acquisitions",
    "our developments",
]


def classify_text(text):
    """Return (verdict, confidence, matched). Pure; unit-tested."""
    t = (text or "").lower()
    strong = [p for p in STRONG_TP if p in t]
    weak = [p for p in WEAK_TP if p in t]
    oo = [p for p in OO_TELLS if p in t]
    if "resident portal" in t and "owner portal" not in t and "owner login" not in t:
        oo = oo + ["resident portal"]
    if strong:
        return ("third_party", "high", strong + weak)
    if len(weak) >= 2:
        return ("third_party", "high", weak)
    if len(weak) == 1:
        return ("third_party", "medium", weak)
    if oo:
        return ("owner_operator", "medium", oo)
    return ("inconclusive", None, [])


# ── fetch machinery (mirrors enrich_company_websites.py) ─────────────
class _Extract(HTMLParser):
    def __init__(self):
        super().__init__()
        self.texts = []
        self.links = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._skip += 1
        if tag == "a":
            for k, v in attrs:
                if k == "href" and v:
                    self.links.append(v)

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip:
            s = data.strip()
            if s:
                self.texts.append(s)


def _make_ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:  # noqa: BLE001
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx


SSL_CTX = _make_ssl_context()


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT, context=SSL_CTX) as r:
        raw = r.read(2_000_000)  # cap 2 MB
        charset = r.headers.get_content_charset() or "utf-8"
    return raw.decode(charset, errors="replace")


def _extract(html):
    ex = _Extract()
    try:
        ex.feed(html)
    except Exception:  # noqa: BLE001
        pass
    return ex


def fetch_and_classify(url):
    """Fetch homepage + up to MAX_PAGES-1 relevant internal links, classify."""
    try:
        home = _extract(_get(url))
    except Exception as e:  # noqa: BLE001
        return {"verdict": "inconclusive", "confidence": None, "matched": [], "error": str(e)[:120]}
    texts = list(home.texts)
    base = urlparse(url)
    seen, followups = set(), []
    for href in home.links:
        if not INTERNAL_LINK_RE.search(href):
            continue
        full = urljoin(url, href)
        u = urlparse(full)
        if u.scheme in ("http", "https") and u.netloc == base.netloc and full != url and full not in seen:
            seen.add(full)
            followups.append(full)
        if len(followups) >= MAX_PAGES - 1:
            break
    for f in followups:
        try:
            texts.extend(_extract(_get(f)).texts)
        except Exception:  # noqa: BLE001
            pass
    verdict, confidence, matched = classify_text(" ".join(texts))
    return {"verdict": verdict, "confidence": confidence, "matched": matched}


def _load(path, default):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return default


def select_todo(enrich, cache, recover):
    todo = []
    for cid, rec in enrich.items():
        url = (rec or {}).get("website")
        if not url:
            continue
        cur = cache.get(cid)
        if cur is None or (recover and cur.get("error")):
            todo.append((cid, url))
    return todo


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--recover", action="store_true", help="also retry prior errors")
    ap.add_argument("--sample", type=int, default=0)
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    enrich = _load(ENRICH_PATH, {})
    cache = _load(CACHE_PATH, {})
    todo = select_todo(enrich, cache, args.recover)
    if args.sample:
        todo = todo[: args.sample]
    with_site = sum(1 for r in enrich.values() if (r or {}).get("website"))
    print(f"companies with website: {with_site} | to classify: {len(todo)}")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(fetch_and_classify, url): (cid, url) for cid, url in todo}
        for fut in as_completed(futs):
            cid, url = futs[fut]
            res = fut.result()
            res["url"] = url
            res["checkedAt"] = now
            cache[cid] = res
            done += 1
            if done % 50 == 0:
                print(f"  {done}/{len(todo)}")

    with open(CACHE_PATH, "w") as f:
        json.dump(cache, f, indent=1, sort_keys=True)
    tp = sum(1 for v in cache.values() if v.get("verdict") == "third_party")
    oo = sum(1 for v in cache.values() if v.get("verdict") == "owner_operator")
    inc = sum(1 for v in cache.values() if v.get("verdict") == "inconclusive")
    print(f"DONE. cache={len(cache)} third_party={tp} owner_operator={oo} inconclusive={inc}")


if __name__ == "__main__":
    main()
