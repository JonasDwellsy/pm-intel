import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ context, page }) => {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") {
      await route.continue();
      return;
    }
    await route.abort("blockedbyclient");
  });
  await page.goto("/sign-in");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

async function signIn(page: Page) {
  await page.getByTestId("sign-in").click();
  await expect(page).toHaveURL(/\/market-iq\/daily$/);
}

test("moves from the public marketing page through sign-in to Market Intelligence", async ({ page }) => {
  await page.goto("/market-iq/welcome");
  await expect(page.getByRole("heading", { name: "See where local rents are moving, then explain why it matters." })).toBeVisible();
  await page.getByRole("link", { name: "Customer sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in\?redirect_url=%2Fmarket-iq%2Fdaily/);
  await page.getByTestId("sign-in").click();

  await expect(page).toHaveURL(/\/market-iq\/daily$/);
  await expect(page.getByRole("heading", { name: "What changed in Cleveland" })).toBeVisible();
  await expect(page.getByTestId("market-panel")).toContainText("Cleveland-Elyria, OH MSA");
});

test("returns a customer to Market Intelligence after required workspace setup", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("market-iq-test-state", JSON.stringify({ accessState: "setup" })));
  await page.goto("/market-iq/welcome");
  await page.getByRole("link", { name: "Customer sign in" }).click();
  await page.getByTestId("sign-in").click();

  await expect(page).toHaveURL(/\/setup-workspace\?from=%2Fmarket-iq%2Fdaily/);
  await expect(page.getByRole("heading", { name: "Activate your Market IQ workspace" })).toBeVisible();
  await page.getByTestId("complete-setup").click();
  await expect(page).toHaveURL(/\/market-iq\/daily$/);
  await expect(page.getByRole("heading", { name: "What changed in Cleveland" })).toBeVisible();
});

test("shows a Market IQ access page when the signed-in workspace has no product access", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("market-iq-test-state", JSON.stringify({ accessState: "none" })));
  await page.goto("/market-iq/welcome");
  await page.getByRole("link", { name: "Customer sign in" }).click();
  await page.getByTestId("sign-in").click();

  await expect(page).toHaveURL(/\/market-iq\/subscribe$/);
  await expect(page.getByRole("heading", { name: "Market IQ access" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Operator IQ");
});

test("switches Cleveland and Columbus without leaking market data or branding", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Market Intelligence" }).click();

  await expect(page.getByTestId("market-panel")).toContainText("Cleveland-Elyria, OH MSA");
  await expect(page.getByTestId("market-brand")).toHaveText("Lakefront Property Management");
  await expect(page.getByTestId("market-rent")).toHaveText("$1,240");
  await expect(page.getByTestId("market-panel")).not.toContainText("Capital City Management");

  await page.getByRole("button", { name: "Columbus" }).click();
  await expect(page).toHaveURL(/market=columbus-oh/);
  await expect(page.getByTestId("market-panel")).toContainText("Columbus, OH MSA");
  await expect(page.getByTestId("market-brand")).toHaveText("Capital City Management");
  await expect(page.getByTestId("market-rent")).toHaveText("$1,610");
  await expect(page.getByTestId("market-panel")).not.toContainText("Lakefront Property Management");
  await expect(page.getByTestId("market-panel")).not.toContainText("$1,240");
});

test("keeps the canonical Daily Edition usable at a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  await expect(page.getByRole("link", { name: "Market Intelligence" })).toHaveAttribute(
    "href",
    "/market-iq/daily?market=cleveland-oh"
  );
  await expect(page.getByRole("heading", { name: "What changed in Cleveland" })).toBeVisible();
  await expect(page.getByRole("link", { name: "← Previous day" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Daily event explorer" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("button", { name: "Columbus" }).click();
  await expect(page).toHaveURL(/\/market-iq\/daily\?market=columbus-oh/);
  await expect(page.getByRole("heading", { name: "What changed in Columbus" })).toBeVisible();
});

test("searches and filters only the records retained with the saved Daily Edition", async ({ page }) => {
  await signIn(page);

  const explorer = page.getByRole("region", { name: "Daily event explorer" });
  await expect(explorer).toContainText("The source observed 46 reportable events");
  await expect(page.getByTestId("event-count")).toHaveText("Showing 3 of 3 matching retained records.");

  await page.getByTestId("event-search").fill("Lakewood");
  await expect(page.getByTestId("event-count")).toHaveText("Showing 1 of 1 matching retained records.");
  await expect(explorer.getByText(/3-bedroom house in Lakewood/)).toBeVisible();
  await expect(explorer.getByText(/studio apartment in Cleveland/)).toBeHidden();

  await page.getByTestId("event-reset").click();
  await page.getByTestId("event-type").selectOption("off");
  await expect(page.getByTestId("event-count")).toHaveText("Showing 1 of 1 matching retained records.");
  await expect(explorer.getByText(/went off market/)).toBeVisible();
  await expect(explorer.getByText(/3-bedroom house in Lakewood/)).toBeHidden();
});

test("moves through persisted daily editions without reconstructing a missing edition", async ({ page }) => {
  await signIn(page);

  await expect(page.getByTestId("edition-comparison")).toContainText("Observed flow, side by side");
  await expect(page.getByTestId("edition-comparison")).toContainText("New listings46 +6");
  await expect(page.getByTestId("edition-comparison")).toContainText("not a rent trend or an inference about market direction");

  await page.getByRole("link", { name: "← Previous day" }).click();
  await expect(page).toHaveURL(/edition=prior/);
  await expect(page.getByTestId("edition-state")).toHaveText("Archived edition · Aug 20");
  await expect(page.getByTestId("edition-comparison")).toContainText("No preceding saved edition yet");
  await expect(page.getByTestId("edition-comparison")).toContainText("Nothing has been reconstructed to fill the gap");
  await page.getByRole("link", { name: "Next day →" }).click();
  await expect(page).toHaveURL(/\/market-iq\/daily\?market=cleveland-oh$/);
  await expect(page.getByTestId("edition-state")).toHaveText("Latest saved edition");

  await page.goto("/market-iq/daily?market=cleveland-oh&edition=missing");
  await expect(page.getByRole("heading", { name: "That saved edition is not available." })).toBeVisible();
  await expect(page.locator("body")).toContainText("No historical edition has been reconstructed or substituted.");
});

test("configures and saves a market, then opens edition review", async ({ page }) => {
  await signIn(page);
  await page.goto("/market-iq/market?market=columbus-oh");
  await page.getByTestId("configure-market").click();
  await page.getByTestId("market-setup-form").getByRole("button", { name: "Save and review edition" }).click();

  await expect(page).toHaveURL(/\/market-iq\/review\?market=columbus-oh/);
  await expect(page.getByTestId("edition-review")).toContainText("Configuration saved");
  await expect(page.getByTestId("edition-review")).toContainText("Capital City Management");
  await expect(page.getByTestId("edition-review")).toContainText("City: primary");
  await expect(page.getByTestId("edition-review")).toContainText("Nothing has been published or emailed");
});

test("imports a recipient and prepares a delivery without sending email", async ({ page }) => {
  await signIn(page);
  await page.goto("/market-iq/distribution");
  await page.getByTestId("recipient-import").setInputFiles({
    name: "recipients.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Name,Email,Company,Relationship\nAvery Owner,avery@example.com,Example Housing,Current client"),
  });

  await expect(page.getByTestId("recipient-row")).toContainText("Avery Owner");
  await expect(page.getByTestId("recipient-row")).toContainText("avery@example.com");
  await expect(page.getByTestId("recipient-row")).toContainText("Example Housing");
  await page.getByRole("button", { name: "Prepare delivery" }).click();
  await expect(page.getByTestId("delivery-recipient")).toHaveText("Avery Owner");
  await page.getByTestId("prepare-delivery").click();

  await expect(page.getByTestId("delivery-status")).toContainText("Delivery prepared, not sent");
  await expect(page.getByTestId("email-send-count")).toHaveText("Emails sent: 0");
});
