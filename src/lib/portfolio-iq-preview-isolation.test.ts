import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { portfolioIqPreviewEnabled } from "@/lib/portfolio-iq/feature";

const portfolioPreviewSurfaces = [
  {
    path: "src/components/layout/SiteHeader.tsx",
    gate: /isSignedIn && portfolioIqPreviewEnabled\(\)/,
  },
  {
    path: "src/app/portfolio-iq/page.tsx",
    gate: /if \(!portfolioIqPreviewEnabled\(\)\) notFound\(\)/,
  },
  {
    path: "src/app/today/page.tsx",
    gate: /if \(!portfolioIqPreviewEnabled\(\)\) notFound\(\)/,
  },
  {
    path: "src/app/onboarding/page.tsx",
    gate: /if \(!portfolioIqPreviewEnabled\(\)\) notFound\(\)/,
  },
  {
    path: "src/app/portfolio-iq/properties/[slug]/page.tsx",
    gate: /if \(!portfolioIqPreviewEnabled\(\)\) notFound\(\)/,
  },
  {
    path: "src/app/today/cases/[signalId]/page.tsx",
    gate: /if \(!portfolioIqPreviewEnabled\(\)\) notFound\(\)/,
  },
  {
    path: "src/app/api/portfolio-iq/watch-activity/count/route.ts",
    gate: /if \(!portfolioIqPreviewEnabled\(\)\).*status: 404/,
  },
] as const;

test("Market IQ preview mode cannot enable Portfolio IQ", () => {
  const previousPortfolioFlag = process.env.PORTFOLIO_IQ_PREVIEW_ENABLED;
  const previousMarketFlag = process.env.MARKET_IQ_PREVIEW_ENABLED;

  try {
    delete process.env.PORTFOLIO_IQ_PREVIEW_ENABLED;
    process.env.MARKET_IQ_PREVIEW_ENABLED = "1";
    assert.equal(portfolioIqPreviewEnabled(), false);

    process.env.PORTFOLIO_IQ_PREVIEW_ENABLED = "1";
    assert.equal(portfolioIqPreviewEnabled(), true);

    for (const disabledValue of ["", "0", "true"]) {
      process.env.PORTFOLIO_IQ_PREVIEW_ENABLED = disabledValue;
      assert.equal(portfolioIqPreviewEnabled(), false);
    }
  } finally {
    if (previousPortfolioFlag === undefined) {
      delete process.env.PORTFOLIO_IQ_PREVIEW_ENABLED;
    } else {
      process.env.PORTFOLIO_IQ_PREVIEW_ENABLED = previousPortfolioFlag;
    }
    if (previousMarketFlag === undefined) {
      delete process.env.MARKET_IQ_PREVIEW_ENABLED;
    } else {
      process.env.MARKET_IQ_PREVIEW_ENABLED = previousMarketFlag;
    }
  }
});

test("Portfolio IQ preview activation has no Market IQ fallback", async () => {
  const source = await readFile("src/lib/portfolio-iq/feature.ts", "utf8");

  assert.match(source, /process\.env\.PORTFOLIO_IQ_PREVIEW_ENABLED/);
  assert.doesNotMatch(source, /MARKET_IQ_PREVIEW_ENABLED/);
});

test("all seven exposed Portfolio IQ surfaces retain the dedicated preview gate", async () => {
  for (const surface of portfolioPreviewSurfaces) {
    const source = await readFile(surface.path, "utf8");
    assert.match(source, surface.gate, `${surface.path} must retain its Portfolio IQ preview gate`);
  }
});
