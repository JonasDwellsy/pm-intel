import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  connectionStringWithoutTlsOverrides,
  verifiedAwsRdsTls,
} from "@/lib/dwellsy-source/tls";

const EXPECTED_AWS_RDS_GLOBAL_BUNDLE_SHA256 =
  "e5bb2084ccf45087bda1c9bffdea0eb15ee67f0b91646106e466714f9de3c7e3";

test("Dwellsy source URLs cannot override the verified TLS configuration", () => {
  const sanitized = new URL(
    connectionStringWithoutTlsOverrides(
      "postgresql://market_user:encoded%40password@source.example:5432/dwellsy_prod" +
        "?sslmode=no-verify&sslrootcert=%2Ftmp%2Fother.pem&uselibpqcompat=true" +
        "&application_name=market-iq"
    )
  );

  assert.equal(sanitized.username, "market_user");
  assert.equal(sanitized.password, "encoded%40password");
  assert.equal(sanitized.hostname, "source.example");
  assert.equal(sanitized.port, "5432");
  assert.equal(sanitized.pathname, "/dwellsy_prod");
  assert.equal(sanitized.searchParams.get("application_name"), "market-iq");
  assert.equal(sanitized.searchParams.has("sslmode"), false);
  assert.equal(sanitized.searchParams.has("sslrootcert"), false);
  assert.equal(sanitized.searchParams.has("uselibpqcompat"), false);
});

test("Dwellsy source TLS uses the pinned official AWS RDS bundle and verifies identity", () => {
  const bundle = readFileSync(
    "src/lib/dwellsy-source/certs/aws-rds-global-bundle.pem",
    "utf8"
  );
  const tls = verifiedAwsRdsTls(bundle);

  assert.equal(tls.rejectUnauthorized, true);
  assert.match(tls.ca, /-----BEGIN CERTIFICATE-----/);
  assert.equal(
    createHash("sha256").update(bundle).digest("hex"),
    EXPECTED_AWS_RDS_GLOBAL_BUNDLE_SHA256
  );
});

test("the Dwellsy pool applies explicit verified TLS", () => {
  const db = readFileSync("src/lib/dwellsy-source/db.server.ts", "utf8");

  assert.match(db, /connectionStringWithoutTlsOverrides\(connectionString\(\)\)/);
  assert.match(db, /ssl: verifiedAwsRdsTls\(\)/);
  assert.doesNotMatch(db, /rejectUnauthorized:\s*false/);
});
