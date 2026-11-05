import { test } from "node:test";
import { strict as assert } from "node:assert";

async function runAdapter(fetchImpl, suffix) {
  let listener;
  globalThis.chrome = {
    runtime: {
      id: "test",
      onMessage: {
        addListener(fn) {
          listener = fn;
        },
      },
    },
  };
  globalThis.fetch = fetchImpl;
  await import(`../dist/adaptor/jnu.js?${suffix}`);
  return await new Promise((resolve) =>
    listener(
      { target: "jnu-adapter", type: "JNU_SYNC" },
      { id: "test" },
      resolve,
    ),
  );
}
const response = (url, body) => ({ ok: true, url, text: async () => body });

test("a network failure reports actionable context", async () => {
  const result = await runAdapter(async () => {
    throw new TypeError("Failed to fetch");
  }, "network");
  assert.match(result.error, /LMS에 연결하지 못했습니다/);
  assert.match(result.error, /네트워크/);
});

test("a login page on a course fetch aborts synchronization instead of saving a partial success", async () => {
  const result = await runAdapter(
    async (url) =>
      url.endsWith("/")
        ? response(url, '<a href="/course/view.php?id=42">course</a>')
        : response(url, '<form><input type="password"></form>'),
    "login",
  );
  assert.match(result.error, /로그인이 필요합니다/);
  assert.equal(result.assignments, undefined);
});

test("failure to fetch every course is not reported as a successful sync", async () => {
  const result = await runAdapter(
    async (url) =>
      url.endsWith("/")
        ? response(url, '<a href="/course/view.php?id=42">course</a>')
        : Promise.reject(new TypeError("Failed to fetch")),
    "courses",
  );
  assert.match(result.error, /강의 정보를 불러오지 못했습니다/);
});

test("partial failures report the failed stage and reason without losing successful assignments", async () => {
  const result = await runAdapter(async (url) => {
    if (url.endsWith("/"))
      return response(url, '<a href="/course/view.php?id=42">course</a>');
    if (url.includes("/course/view.php"))
      return response(
        url,
        '<a href="/mod/assign/view.php?id=1">one</a><a href="/mod/assign/view.php?id=2">two</a>',
      );
    if (url.endsWith("id=1"))
      return response(
        url,
        '<div id="region-main"><h2>과제</h2><table><tr><td>Submission status</td><td>Not submitted</td></tr></table></div>',
      );
    return response(url, '<div id="region-main"><h2>과제</h2></div>');
  }, "partial");
  assert.equal(result.assignments.length, 1);
  assert.match(result.warning, /일부 항목 1개/);
  assert.match(
    result.warning,
    /과제 상세: 과제 상세 화면을 읽을 수 없습니다 \(1건\)/,
  );
});
