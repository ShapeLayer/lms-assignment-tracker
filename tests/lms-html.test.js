import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  parseLmsHtml,
  elements,
  attribute,
  content,
  findLinks,
} from "../dist/adaptor/html.js";

test("reads assignment data without executing or exposing active LMS markup", () => {
  const doc = parseLmsHtml(
    `<main id="region-main"><svg onload="alert(1)"><title>not a title</title></svg><script>bad()</script><h2>보고서 과제 #1</h2><a href="/mod/assign/view.php?id=3" onclick="bad()">과제</a><table><tr><td>Due date</td><td>2026-11-05 00:00</td></tr></table></main>`,
  );
  const nodes = elements(doc);
  assert.equal(
    content(nodes.find((node) => node.tagName === "h2")),
    "보고서 과제 #1",
  );
  assert.deepEqual(findLinks(doc), ["/mod/assign/view.php?id=3"]);
  assert.equal(
    attribute(
      nodes.find((node) => node.tagName === "main"),
      "id",
    ),
    "region-main",
  );
  assert.equal(
    content(nodes.find((node) => node.tagName === "tr")),
    "Due date2026-11-05 00:00",
  );
  assert.ok(
    !nodes.some((node) => node.tagName === "svg" || node.tagName === "script"),
  );
});
