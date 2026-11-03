import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  jnuPageUrl,
  jnuAttachmentUrl,
  validJnuAssignment,
} from "../dist/adaptor/jnu-urls.js";

test("only exact JNU paths with one positive numeric ID are trusted", () => {
  const good = "https://sel.jnu.ac.kr/mod/assign/view.php?id=123";
  assert.equal(
    jnuPageUrl("/mod/assign/view.php?x=1&id=123#x", "assignment"),
    good,
  );
  for (const bad of [
    "https://attacker.example/mod/assign/view.php?id=123",
    "//attacker.example/mod/assign/view.php?id=123",
    "http://sel.jnu.ac.kr/mod/assign/view.php?id=123",
    "https://sel.jnu.ac.kr.attacker.example/mod/assign/view.php?id=123",
    "https://sel.jnu.ac.kr@attacker.example/mod/assign/view.php?id=123",
    "data:text/html,/mod/assign/view.php?id=123",
    "/redirect?next=/mod/assign/view.php?id=123",
    "/mod/assign/view.php?id=123&id=456",
    "/mod/assign/view.php?id=abc",
  ])
    assert.equal(jnuPageUrl(bad, "assignment"), null, bad);
  assert.equal(validJnuAssignment({ id: "jnu:123", url: good }), true);
  assert.equal(validJnuAssignment({ id: "jnu:456", url: good }), false);
  assert.equal(
    validJnuAssignment({
      id: "jnu:123",
      url: "https://attacker.example/mod/assign/view.php?id=123",
    }),
    false,
  );
  assert.equal(
    jnuAttachmentUrl(
      "https://attacker.example/pluginfile.php?file=/1/mod_assign/intro/0/x",
    ),
    null,
  );
});

test("crawler rejects forged links, denies foreign senders, and limits requests", async () => {
  let listener;
  globalThis.chrome = {
    runtime: {
      id: "own-extension",
      onMessage: {
        addListener(fn) {
          listener = fn;
        },
      },
    },
  };
  const requested = [];
  const courseLinks = Array.from(
    { length: 120 },
    (_, i) => `<a href="/mod/assign/view.php?id=${i + 1}">과제</a>`,
  ).join("");
  globalThis.fetch = async (url, options) => {
    requested.push({ url, options });
    const body = url.endsWith("/")
      ? '<a href="/course/view.php?id=4">강의</a>'
      : url.includes("/course/view.php")
        ? `${courseLinks}<a href="https://attacker.example/mod/assign/view.php?id=999">위조</a>`
        : '<div id="region-main"><h2>과제</h2><table><tr><td>Submission status</td><td>Not submitted</td></tr><tr><td>Due date</td><td>2026-11-05 00:00</td></tr></table></div>';
    return { ok: true, url, text: async () => body };
  };
  await import("../dist/adaptor/jnu.js");
  assert.equal(
    listener(
      { target: "jnu-adapter", type: "JNU_SYNC" },
      { id: "foreign" },
      () => {},
    ),
    undefined,
  );
  assert.equal(requested.length, 0);
  const result = await new Promise((resolve) =>
    listener(
      { target: "jnu-adapter", type: "JNU_SYNC" },
      { id: "own-extension" },
      resolve,
    ),
  );
  assert.equal(requested.length, 100);
  assert.ok(
    requested.every(
      (request) =>
        request.url.startsWith("https://sel.jnu.ac.kr/") &&
        request.options.redirect === "error",
    ),
  );
  assert.equal(result.assignments.length, 98);
  assert.ok(result.warning);
});
