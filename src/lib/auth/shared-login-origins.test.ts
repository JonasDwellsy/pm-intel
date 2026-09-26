import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("Clerk allows only the reviewed Portfolio, Evidence, and Concessions return origins", () => {
  const source = ts.createSourceFile(
    "layout.tsx",
    readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const origins: string[] = [];
  let providerCount = 0;
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === "ClerkProvider") {
      providerCount += 1;
      const attribute = node.attributes.properties.find(
        (item) => ts.isJsxAttribute(item) && item.name.getText(source) === "allowedRedirectOrigins",
      );
      assert.ok(attribute && ts.isJsxAttribute(attribute));
      assert.ok(attribute.initializer && ts.isJsxExpression(attribute.initializer));
      const expression = attribute.initializer.expression;
      assert.ok(expression && ts.isArrayLiteralExpression(expression));
      for (const element of expression.elements) {
        assert.ok(ts.isStringLiteral(element), "Keep the trusted origins explicit, without wildcards or request-derived values");
        origins.push(element.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(providerCount, 1);
  assert.deepEqual(origins, [
    "https://portfolio.iq.dwellsy.com",
    "https://evidence.iq.dwellsy.com",
    "https://concessions.iq.dwellsy.com",
  ]);
});
