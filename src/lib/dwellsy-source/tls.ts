import { readFileSync } from "node:fs";

const CONNECTION_STRING_TLS_PARAMETERS = new Set([
  "ssl",
  "sslcert",
  "sslkey",
  "sslmode",
  "sslnegotiation",
  "sslpassword",
  "sslrootcert",
  "uselibpqcompat",
]);

// Official public AWS RDS trust bundle:
// https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
// Its SHA-256 is pinned by dwellsy-source-tls.test.ts so a future rotation is
// deliberate and reviewable.
const AWS_RDS_GLOBAL_BUNDLE = new URL(
  "./certs/aws-rds-global-bundle.pem",
  import.meta.url
);

export function connectionStringWithoutTlsOverrides(value: string) {
  const url = new URL(value);

  for (const key of [...url.searchParams.keys()]) {
    if (CONNECTION_STRING_TLS_PARAMETERS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }

  return url.toString();
}

export function verifiedAwsRdsTls(ca = readFileSync(AWS_RDS_GLOBAL_BUNDLE, "utf8")) {
  return {
    ca,
    rejectUnauthorized: true as const,
  };
}
