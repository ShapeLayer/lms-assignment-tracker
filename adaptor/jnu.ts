import { JNU_ORIGIN, jnuPageUrl, type JnuPage } from "./jnu-urls.js";
import { assignmentAttachments } from "./attachments.js";
import {
  parseLmsHtml,
  elements,
  attribute,
  content,
  findLinks,
  type LmsDocument,
} from "./html.js";
(() => {
  const origin = JNU_ORIGIN;
  const MAX_REQUESTS = 100;
  class RequestLimitError extends Error {}
  class SessionError extends Error {}
  let requestCount = 0;
  const get = async (path: string) => {
    if (requestCount >= MAX_REQUESTS)
      throw new RequestLimitError("LMS 요청 상한에 도달했습니다");
    const url =
      path === "/"
        ? `${origin}/`
        : (["course", "index", "assignment"] as JnuPage[])
            .map((page) => jnuPageUrl(path, page))
            .find(Boolean);
    if (!url) throw new Error("허용되지 않은 LMS 주소입니다");
    requestCount++;
    let response: Response;
    try {
      response = await fetch(url, {
        credentials: "include",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new Error(
          "LMS 응답 시간이 초과되었습니다. 네트워크 연결을 확인해 주세요.",
        );
      }
      throw new Error(
        "LMS에 연결하지 못했습니다. 로그인 상태, 사이트 접근 권한과 네트워크를 확인해 주세요. 로그인 페이지로 이동하는 응답도 차단됩니다.",
      );
    }
    if (new URL(response.url).origin !== origin)
      throw new Error("허용되지 않은 LMS 응답입니다");
    if (!response.ok) throw new Error(`LMS 요청 실패 (${response.status})`);
    const html = await response.text();
    const doc = parseLmsHtml(html);
    if (
      response.url.includes("/login/") ||
      elements(doc).some(
        (e) =>
          e.tagName === "input" &&
          attribute(e, "type").toLowerCase() === "password",
      )
    )
      throw new SessionError(
        "LMS 로그인이 필요합니다. 같은 Chrome 프로필에서 LMS에 로그인해 주세요.",
      );
    return doc;
  };
  const links = (doc: LmsDocument, page: JnuPage): string[] =>
    findLinks(doc)
      .map((href) => jnuPageUrl(href, page))
      .filter((url): url is string => url !== null);
  const unique = (values: string[]): string[] => [...new Set(values)];
  function parseAssignment(doc: LmsDocument, url: string) {
    const main =
      elements(doc).find((e) => attribute(e, "id") === "region-main") || doc;
    const nodes = elements(main);
    const rows = nodes.filter((e) => e.tagName === "tr");
    const field = (pattern) => {
      const row = rows.find((r) =>
        pattern.test(
          content(
            elements(r).find((e) => e.tagName === "th" || e.tagName === "td"),
          ),
        ),
      );
      return content(
        row &&
          elements(row).filter(
            (e) => e.tagName === "th" || e.tagName === "td",
          )[1],
      );
    };
    const statusText = field(/^(Submission status|제출 상태|제출상태)$/i);
    const status =
      /not submitted|no submission|draft|미제출|제출하지|초안/i.test(statusText)
        ? "pending"
        : /submitted for grading|submitted|제출 완료|제출됨|채점 완료/i.test(
              statusText,
            )
          ? "completed"
          : "unknown";
    function parseDate(value: string): string | null {
      const match = value.match(
        /(\d{4})\s*[-.년/]\s*(\d{1,2})\s*[-.월/]\s*(\d{1,2})\s*일?\s*(?:(\d{1,2}):(\d{2}))?/,
      );
      if (!match) return null;
      const d = new Date(
        +match[1],
        +match[2] - 1,
        +match[3],
        +(match[4] || 0),
        +(match[5] || 0),
      );
      return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    }
    const dueAt = parseDate(field(/^(Due date|마감일|제출 마감|종료 일시)$/i));
    const startAt = parseDate(
      field(
        /^(Allow submissions from|Available from|제출 시작|제출 시작일|시작 일시)$/i,
      ),
    );
    const heading = nodes.find((e) => e.tagName === "h2");
    const intro = nodes.find(
      (e) =>
        attribute(e, "id") === "intro" ||
        attribute(e, "id").startsWith("ygtvcontentel") ||
        /(?:^|\s)(?:activity-description|intro)(?:\s|$)/.test(
          attribute(e, "class"),
        ),
    );
    const attachments = assignmentAttachments(
      nodes
        .filter((e) => e.tagName === "a" && attribute(e, "href"))
        .map((e) => ({ href: attribute(e, "href"), name: content(e) })),
      origin,
    );
    const course = content(elements(doc).find((e) => e.tagName === "h1"));
    const title = content(heading);
    if (!title || !statusText)
      throw new Error("과제 상세 화면을 읽을 수 없습니다");
    return {
      id: `jnu:${new URL(url).searchParams.get("id")}`,
      url,
      title,
      course,
      body: content(intro),
      attachments,
      dueAt,
      startAt,
      status,
      statusText,
      updatedAt: Date.now(),
    };
  }
  async function sync() {
    requestCount = 0;
    const home = await get("/");
    const courses = unique(links(home, "course")).filter((x) =>
      new URL(x).searchParams.has("id"),
    );
    if (!courses.length)
      throw new Error(
        "강의 목록을 찾지 못했습니다. LMS 로그인을 확인해 주세요",
      );
    const assignments: ReturnType<typeof parseAssignment>[] = [];
    let failures = 0;
    const failureReasons = new Map<string, number>();
    const recordFailure = (stage: string, error: unknown) => {
      failures++;
      const detail = error instanceof Error ? error.message : "알 수 없는 오류";
      const key = `${stage}: ${detail}`;
      failureReasons.set(key, (failureReasons.get(key) || 0) + 1);
    };
    let coursesRead = 0;
    for (const courseUrl of courses) {
      try {
        const course = await get(courseUrl);
        coursesRead++;
        let urls = links(course, "assignment");
        const index = links(course, "index")[0];
        if (index) {
          try {
            urls.push(...links(await get(index), "assignment"));
          } catch (error) {
            if (
              error instanceof RequestLimitError ||
              error instanceof SessionError
            )
              throw error;
            recordFailure("과제 목록", error);
          }
        }
        for (const url of unique(urls)) {
          try {
            assignments.push(parseAssignment(await get(url), url));
          } catch (error) {
            if (
              error instanceof RequestLimitError ||
              error instanceof SessionError
            )
              throw error;
            recordFailure("과제 상세", error);
          }
        }
      } catch (error) {
        if (error instanceof SessionError) throw error;
        if (error instanceof RequestLimitError) {
          recordFailure("요청 제한", error);
          break;
        }
        recordFailure("강의", error);
      }
    }
    if (!coursesRead && failures)
      throw new Error(
        "강의 정보를 불러오지 못했습니다. LMS 로그인과 네트워크를 확인해 주세요.",
      );
    return {
      assignments,
      warning: failures
        ? `일부 항목 ${failures}개를 동기화하지 못했습니다. ${[...failureReasons.entries()].map(([reason, count]) => `${reason} (${count}건)`).join("; ")}`
        : null,
    };
  }
  let running: Promise<Awaited<ReturnType<typeof sync>>> | null = null;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.target === "jnu-adapter" && message.type === "JNU_SYNC") {
      running ??= sync().finally(() => {
        running = null;
      });
      running.then(respond).catch((error) => respond({ error: error.message }));
      return true;
    }
  });
})();
