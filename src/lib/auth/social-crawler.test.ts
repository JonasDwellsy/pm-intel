// PR #76 — Coverage for the social-crawler UA detector.
//
// The bypass logic is security-adjacent (it controls what the
// research-preview password gate lets through). Tests assert both
// directions:
//
//   - Known unfurl crawlers (Slack/Twitter/LinkedIn/etc.) are
//     recognized
//   - Real browser UAs + search engine bots are NOT recognized
//     (we don't want Googlebot indexing pre-launch content)

import test from "node:test";
import { strict as assert } from "node:assert";
import {
  SOCIAL_CRAWLER_PATTERNS,
  isSocialCrawler,
} from "./social-crawler";

// ── Known unfurl crawlers (positives) ───────────────────────────

test("recognizes Slackbot (link-expanding variant)", () => {
  // Verified from Slack's published crawler docs.
  assert.equal(
    isSocialCrawler("Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)"),
    true
  );
});

test("recognizes plain Slackbot UA (some legacy variants)", () => {
  assert.equal(isSocialCrawler("Slackbot 1.0 (+https://api.slack.com/robots)"), true);
});

test("recognizes Twitterbot", () => {
  assert.equal(isSocialCrawler("Twitterbot/1.0"), true);
});

test("recognizes LinkedInBot", () => {
  assert.equal(
    isSocialCrawler("LinkedInBot/1.0 (compatible; Mozilla/5.0; Jakarta Commons-HttpClient/3.1 +http://www.linkedin.com)"),
    true
  );
});

test("recognizes facebookexternalhit (Facebook + Messenger + Instagram + WhatsApp)", () => {
  // facebookexternalhit is the shared unfurl UA across the Meta
  // family (Facebook, Messenger, Instagram, and the modern
  // WhatsApp link-preview crawler).
  assert.equal(
    isSocialCrawler("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"),
    true
  );
});

test("recognizes Discordbot", () => {
  assert.equal(
    isSocialCrawler("Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)"),
    true
  );
});

test("recognizes TelegramBot", () => {
  assert.equal(isSocialCrawler("TelegramBot (like TwitterBot)"), true);
});

test("recognizes legacy WhatsApp UA (sometimes sent without the facebookexternalhit prefix)", () => {
  assert.equal(isSocialCrawler("WhatsApp/2.21.12.21 A"), true);
});

// ── Real browsers (negatives — must NOT be recognized) ──────────

test("does NOT recognize Chrome desktop", () => {
  assert.equal(
    isSocialCrawler(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    false
  );
});

test("does NOT recognize Safari mobile", () => {
  assert.equal(
    isSocialCrawler(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    ),
    false
  );
});

test("does NOT recognize Firefox", () => {
  assert.equal(
    isSocialCrawler(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0"
    ),
    false
  );
});

// ── Search engines (negatives — would index pre-launch content) ──

test("does NOT recognize Googlebot (search engine, must stay gated)", () => {
  // Critical: search engines crawl + index. The research-preview
  // gate exists to keep pre-launch content out of Google. If
  // Googlebot starts passing the bypass, pre-launch URLs end up in
  // search results.
  assert.equal(
    isSocialCrawler(
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
    ),
    false
  );
});

test("does NOT recognize Bingbot (search engine)", () => {
  assert.equal(
    isSocialCrawler(
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"
    ),
    false
  );
});

test("does NOT recognize DuckDuckBot (search engine)", () => {
  assert.equal(
    isSocialCrawler("DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)"),
    false
  );
});

test("does NOT recognize generic Mozilla UA prefix", () => {
  // Spoofing-defense partial: bare "Mozilla/5.0" without crawler
  // signature must NOT pass.
  assert.equal(isSocialCrawler("Mozilla/5.0"), false);
});

// ── Edge cases ──────────────────────────────────────────────────

test("returns false on empty string", () => {
  assert.equal(isSocialCrawler(""), false);
});

test("returns false on null", () => {
  assert.equal(isSocialCrawler(null), false);
});

test("returns false on undefined", () => {
  assert.equal(isSocialCrawler(undefined), false);
});

test("is case-insensitive on UA prefix matching", () => {
  // Some platforms occasionally lowercase or uppercase parts of
  // their UA. Patterns use /i so the bypass still works.
  assert.equal(isSocialCrawler("slackbot/1.0"), true);
  assert.equal(isSocialCrawler("TWITTERBOT/1.0"), true);
  assert.equal(isSocialCrawler("FacebookExternalHit/1.1"), true);
});

// ── Module shape guards ─────────────────────────────────────────

test("SOCIAL_CRAWLER_PATTERNS exports the documented 7-platform list", () => {
  // If a new platform is added without an accompanying test, this
  // guard surfaces it so we don't ship an undocumented expansion
  // of the bypass surface.
  assert.equal(
    SOCIAL_CRAWLER_PATTERNS.length,
    7,
    "must export exactly the 7 documented unfurl-crawler patterns; update tests if adding more"
  );
});

test("SOCIAL_CRAWLER_PATTERNS contains no overly broad patterns", () => {
  // Defensive: no pattern should match the generic Chrome UA.
  // Catches accidental over-broadening like /Mozilla/ or /bot/i.
  const chromeUa =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  for (const re of SOCIAL_CRAWLER_PATTERNS) {
    assert.equal(
      re.test(chromeUa),
      false,
      `pattern ${re} must NOT match a real browser UA`
    );
  }
});
