import { createServer } from "node:http";

const port = 4178;

const html = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Market IQ browser fixture</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; color: #102044; background: #f7f7f4; }
    header { display: flex; gap: 24px; align-items: center; padding: 18px 32px; background: white; border-bottom: 1px solid #dce2ec; }
    header a { color: #102044; text-decoration: none; font-weight: 700; }
    main { max-width: 920px; margin: 40px auto; padding: 0 24px; }
    section { background: white; border: 1px solid #dce2ec; border-radius: 14px; padding: 24px; margin: 20px 0; }
    button, input, select { font: inherit; padding: 10px 14px; margin: 6px 4px 6px 0; }
    button { cursor: pointer; background: #102044; color: white; border: 0; border-radius: 7px; }
    .market-picker button { background: #eaf0f5; color: #102044; }
    .market-picker button[aria-current="true"] { background: #102044; color: white; }
    .muted { color: #60708d; }
    .success { color: #08775d; font-weight: 700; }
  </style>
</head>
<body>
  <header>
    <strong>Market IQ</strong>
    <a href="/market-iq" data-nav>Home</a>
    <a href="/market-iq/market?market=cleveland-oh" data-nav>Market Intelligence</a>
    <a href="/market-iq/distribution" data-nav>Recipients</a>
  </header>
  <main id="app"></main>
  <script>
    const markets = {
      "cleveland-oh": {
        name: "Cleveland-Elyria, OH MSA",
        brand: "Lakefront Property Management",
        rent: "$1,240",
        signal: "Cleveland apartment rents are holding steady"
      },
      "columbus-oh": {
        name: "Columbus, OH MSA",
        brand: "Capital City Management",
        rent: "$1,610",
        signal: "Columbus apartment rents are rising"
      }
    };

    const defaults = {
      signedIn: false,
      market: "cleveland-oh",
      configurations: {},
      recipients: [],
      preparedDeliveries: [],
      emailSendCount: 0
    };

    function state() {
      return { ...defaults, ...JSON.parse(localStorage.getItem("market-iq-test-state") || "{}") };
    }

    function save(next) {
      localStorage.setItem("market-iq-test-state", JSON.stringify(next));
    }

    function navigate(path) {
      history.pushState({}, "", path);
      render();
    }

    function queryMarket() {
      return new URL(location.href).searchParams.get("market") || state().market;
    }

    function shell(content) {
      document.querySelector("header").hidden = location.pathname === "/sign-in";
      document.getElementById("app").innerHTML = content;
    }

    function requireSignIn() {
      if (!state().signedIn && location.pathname !== "/sign-in") {
        navigate("/sign-in");
        return false;
      }
      return true;
    }

    function renderSignIn() {
      shell('<section><h1>Sign in to Market IQ</h1><p class="muted">Deterministic development authentication.</p><button data-testid="sign-in">Sign in</button></section>');
      document.querySelector('[data-testid="sign-in"]').onclick = () => {
        save({ ...state(), signedIn: true });
        navigate("/market-iq");
      };
    }

    function renderHome() {
      const current = markets[state().market];
      shell('<h1>Market IQ Home</h1><section><h2>Your markets</h2><p data-testid="home-current-market">' + current.name + '</p><p>' + current.signal + '</p></section>');
    }

    function renderMarket() {
      const id = queryMarket();
      const current = markets[id];
      save({ ...state(), market: id });
      shell('<h1>Market Intelligence</h1>' +
        '<div class="market-picker"><button data-market="cleveland-oh" aria-current="' + (id === "cleveland-oh") + '">Cleveland</button><button data-market="columbus-oh" aria-current="' + (id === "columbus-oh") + '">Columbus</button></div>' +
        '<section data-testid="market-panel"><h2>' + current.name + '</h2><p data-testid="market-brand">' + current.brand + '</p><strong data-testid="market-rent">' + current.rent + '</strong><p>' + current.signal + '</p><button data-testid="configure-market">Configure market</button></section>');
      document.querySelectorAll("[data-market]").forEach((button) => {
        button.onclick = () => navigate("/market-iq/market?market=" + button.dataset.market);
      });
      document.querySelector('[data-testid="configure-market"]').onclick = () => navigate("/market-iq/get-started?market=" + id);
    }

    function renderSetup() {
      const id = queryMarket();
      const current = markets[id];
      shell('<h1>Configure ' + current.name + '</h1><section><form data-testid="market-setup-form">' +
        '<label><input name="city" type="checkbox" value="primary" checked> Primary city</label><br>' +
        '<label><input name="segment" type="checkbox" value="apartments" checked> Apartments</label><br>' +
        '<button type="submit">Save and review edition</button></form></section>');
      document.querySelector('[data-testid="market-setup-form"]').onsubmit = (event) => {
        event.preventDefault();
        const next = state();
        next.market = id;
        next.configurations[id] = { city: "primary", segment: "apartments" };
        save(next);
        navigate("/market-iq/review?market=" + id);
      };
    }

    function renderReview() {
      const id = queryMarket();
      const current = markets[id];
      const configured = state().configurations[id];
      shell('<h1>Review ' + current.name + ' edition</h1><section data-testid="edition-review"><p class="success">Configuration saved</p><p>' + current.brand + '</p><p>' + current.signal + '</p><p>City: ' + (configured?.city || "not selected") + '</p><p>Segment: ' + (configured?.segment || "not selected") + '</p><p class="muted">Nothing has been published or emailed.</p></section>');
    }

    function parseCsv(text) {
              const lines = text.trim().split(/\r?\n/).slice(1);
      return lines.map((line) => {
        const [name, email, company = "", relationship = "Current client"] = line.split(",").map((value) => value.trim());
        return { name, email, company, relationship };
      }).filter((recipient) => recipient.name && recipient.email);
    }

    function renderRecipients() {
      const recipients = state().recipients;
      const rows = recipients.map((recipient, index) => '<li data-testid="recipient-row">' + recipient.name + ' · ' + recipient.email + ' · ' + recipient.company + ' <button data-prepare="' + index + '">Prepare delivery</button></li>').join("");
      shell('<h1>Recipients</h1><section><label>Import recipient CSV <input data-testid="recipient-import" type="file" accept=".csv"></label><p class="muted">Importing never sends email.</p></section><section><h2>Recipient directory</h2><ul data-testid="recipient-list">' + rows + '</ul></section>');
      document.querySelector('[data-testid="recipient-import"]').onchange = async (event) => {
        const file = event.target.files[0];
        const next = state();
        const text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(reader.error);
          reader.readAsText(file);
        });
        next.recipients = parseCsv(text);
        save(next);
        renderRecipients();
      };
      document.querySelectorAll("[data-prepare]").forEach((button) => {
        button.onclick = () => navigate("/market-iq/client-reporting?tab=delivery&recipient=" + button.dataset.prepare);
      });
    }

    function renderDelivery() {
      const recipientIndex = Number(new URL(location.href).searchParams.get("recipient") || 0);
      const recipient = state().recipients[recipientIndex];
      shell('<h1>Prepare delivery</h1><section><p data-testid="delivery-recipient">' + (recipient?.name || "No recipient") + '</p><button data-testid="prepare-delivery">Prepare delivery</button><p class="muted">Preparing does not send email.</p><div data-testid="delivery-status"></div></section>');
      document.querySelector('[data-testid="prepare-delivery"]').onclick = () => {
        const next = state();
        next.preparedDeliveries.push({ recipient: recipient?.email, status: "prepared" });
        save(next);
        document.querySelector('[data-testid="delivery-status"]').innerHTML = '<p class="success">Delivery prepared, not sent</p><p data-testid="email-send-count">Emails sent: ' + next.emailSendCount + '</p>';
      };
    }

    function render() {
      if (!requireSignIn()) return;
      if (location.pathname === "/sign-in") return renderSignIn();
      if (location.pathname === "/market-iq") return renderHome();
      if (location.pathname === "/market-iq/market") return renderMarket();
      if (location.pathname === "/market-iq/get-started") return renderSetup();
      if (location.pathname === "/market-iq/review") return renderReview();
      if (location.pathname === "/market-iq/distribution") return renderRecipients();
      if (location.pathname === "/market-iq/client-reporting") return renderDelivery();
      shell("<h1>Not found</h1>");
    }

    document.addEventListener("click", (event) => {
      const link = event.target.closest("[data-nav]");
      if (!link) return;
      event.preventDefault();
      navigate(link.getAttribute("href"));
    });
    addEventListener("popstate", render);
    render();
  </script>
</body>
</html>`;

createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
    return;
  }

  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`Market IQ browser fixture listening on ${port}\n`);
});
