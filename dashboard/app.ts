import {
  validJnuAssignment,
  jnuPageUrl,
  jnuAttachmentUrl,
} from "../adaptor/jnu-urls.js";
import {
  DEFAULTS,
  dateKey,
  assignmentsOnDate,
  peakAssignments,
  highlightOpacity,
  type State,
} from "../core/model.js";
const app = document.querySelector<HTMLElement>("#app")!;
const isPopup =
  document.body.classList.contains("popup") &&
  location.pathname.endsWith("popup.html");
if (!isPopup) document.body.className = "dashboard";
let calendarObserver: ResizeObserver | undefined;
let state: State = { ...DEFAULTS },
  month = new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selected = "",
  view = "calendar",
  busy = false;
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] || c,
  );
const icon = (name) =>
  ({
    calendar: "▦",
    settings: "⚙",
    open: "↗",
    prev: "‹",
    next: "›",
    refresh: "↻",
  })[name];
async function load() {
  state = {
    ...DEFAULTS,
    ...(await chrome.storage.local.get(Object.keys(DEFAULTS))),
  };
  state.assignments = Array.isArray(state.assignments)
    ? state.assignments.filter(validJnuAssignment).map((item) => ({
        ...item,
        url: jnuPageUrl(item.url, "assignment")!,
        attachments: Array.isArray(item.attachments)
          ? item.attachments.filter(
              (file) => file && jnuAttachmentUrl(file.url),
            )
          : [],
      }))
    : [];
  render();
}
function calendar() {
  const y = month.getFullYear(),
    m = month.getMonth(),
    first = new Date(y, m, 1).getDay(),
    days = new Date(y, m + 1, 0).getDate();
  const peak = peakAssignments(state.assignments);
  const getDay = (n: number) => {
    const date = new Date(y, m, n);
    const items = assignmentsOnDate(state.assignments, date);
    return {
      date,
      items,
      count: items.filter((a) => a.status !== "completed").length,
    };
  };
  let cells = Array(first).fill('<div class="blank"></div>').join("");
  for (let n = 1; n <= days; n++) {
    const { date, items, count } = getDay(n),
      key = dateKey(date);
    const pending = items.filter((a) => a.status !== "completed");
    const previous = getDay(n - 1),
      next = getDay(n + 1);
    const start =
      n === 1 ||
      date.getDay() === 0 ||
      !previous.items.length ||
      previous.count !== count;
    const end =
      n === days ||
      date.getDay() === 6 ||
      !next.items.length ||
      next.count !== count;
    const showCount = start || end || key === dateKey(new Date());
    const tooltip = items.length
      ? `<span class="tooltip" role="tooltip"><strong>${items.length}개 중 ${items.length - count}개 완료</strong>${pending.map((a) => `<span>${esc(a.title)}</span>`).join("") || "<span>모두 완료</span>"}</span>`
      : "";
    cells += `<button class="day ${key === selected ? "selected" : ""} ${key === dateKey(new Date()) ? "today" : ""} ${items.length ? "has-items" : ""} ${start ? "range-start" : ""} ${end ? "range-end" : ""}" data-date="${key}" aria-label="${m + 1}월 ${n}일${items.length ? `, 남은 과제 ${count}개` : ""}"><span class="day-number">${n}</span>${items.length ? `<span class="highlight" data-opacity="${highlightOpacity(count, peak)}">${showCount ? `<span class="count">${count}</span>` : ""}</span>` : ""}${tooltip}</button>`;
  }
  return `<section class="calendar"><div class="calendar-head"><div><span class="eyebrow">CALENDAR</span><h2>${y}<span class="month-dot">.</span> ${String(m + 1).padStart(2, "0")}</h2></div><div class="month-controls"><button data-action="prev" aria-label="이전 달">‹</button><button data-action="next" aria-label="다음 달">›</button></div></div><div class="weekdays">${["일", "월", "화", "수", "목", "금", "토"].map((d) => `<span>${d}</span>`).join("")}</div><div class="grid">${cells}</div></section>`;
}
function list() {
  const items = selected
    ? assignmentsOnDate(state.assignments, new Date(`${selected}T00:00:00`))
    : state.assignments;
  const date = selected ? new Date(`${selected}T00:00:00`) : null;
  return `<section class="list"><div class="section-head"><div><span class="eyebrow">ASSIGNMENTS</span><h2>${date ? `${date.getMonth() + 1}월 ${date.getDate()}일` : "전체 과제"} <small>${items.length}</small></h2></div>${selected ? '<button class="show-all" data-action="all">전체 보기</button>' : ""}</div>${items.length ? items.map((a) => `<article class="assignment"><div class="status ${a.status}">${a.status === "completed" ? "✓" : a.status === "pending" ? "●" : "?"}</div><div class="assignment-main"><div class="course">${esc(a.course || "LMS")}</div><a class="title" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)} <span>↗</span></a><div class="meta">${a.dueAt ? new Date(a.dueAt).toLocaleString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "마감일 없음"} · ${a.status === "completed" ? "제출 완료" : a.status === "pending" ? "미제출" : "상태 확인 필요"}</div>${a.body ? `<p>${esc(a.body)}</p>` : ""}${(a.attachments || []).map((file) => `<a class="attachment" href="${esc(file.url)}" target="_blank" rel="noopener"><span aria-hidden="true">↓</span> ${esc(file.name)}</a>`).join("")}<a class="url" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.url)}</a></div></article>`).join("") : '<div class="empty"><span>◌</span><p>예정된 과제가 없습니다</p></div>'}</section>`;
}
function settings() {
  return `<section class="settings"><span class="eyebrow">PREFERENCES</span><h2>설정</h2><label class="setting-row"><span>데스크톱 알림</span><input id="enabled" type="checkbox" ${state.settings.enabled ? "checked" : ""}></label><label class="setting-row"><span>마감 전 알림</span><select id="hours"><option value="1">1시간</option><option value="6">6시간</option><option value="24">24시간</option><option value="48">48시간</option><option value="72">72시간</option></select></label><div class="setting-row"><span>마지막 동기화</span><span class="muted">${state.lastSync ? new Date(state.lastSync).toLocaleString("ko-KR") : "없음"}</span></div><button class="sync-button" data-action="sync" ${busy ? "disabled" : ""}>${busy ? "동기화 중…" : "지금 동기화"} <span>↻</span></button>${state.syncError ? `<p class="error">${esc(state.syncError)}</p>` : ""}</section>`;
}
function render() {
  const remaining = state.assignments.filter(
    (a) => a.status === "pending" && a.dueAt && new Date(a.dueAt) > new Date(),
  ).length;
  app.innerHTML = `<header class="top"><div class="brand"><div><strong>과제 달력</strong><span>ASSIGNMENT TRACKER</span></div></div><div class="top-actions"><div class="sync-control ${busy ? "is-busy" : ""}"><button data-action="sync" aria-label="동기화" aria-describedby="sync-tooltip" ${busy ? "disabled" : ""}><span class="sync-icon" aria-hidden="true">↻</span></button><span id="sync-tooltip" class="sync-tooltip" role="tooltip">동기화</span>${busy ? '<span class="sync-progress" role="status">동기화 중입니다…</span>' : ""}</div>${isPopup ? '<button data-action="open" aria-label="대시보드 열기" title="대시보드 열기">↗</button>' : ""}</div></header>${view === "settings" ? settings() : `<div class="content">${!isPopup ? `<div class="page-heading"><div><span class="eyebrow">YOUR WORKSPACE</span><h1>과제 한눈에</h1></div><div class="summary"><span>남은 과제</span><strong>${remaining}<small>개</small></strong></div></div>` : ""}<div class="layout">${calendar()}${!isPopup ? list() : ""}</div>${isPopup && state.syncError ? `<div class="inline-error">${esc(state.syncError)}</div>` : ""}</div>`}<nav class="bottom"><button data-action="calendar" class="${view === "calendar" ? "active" : ""}"><span>${icon("calendar")}</span>캘린더</button><button data-action="settings" class="${view === "settings" ? "active" : ""}"><span>${icon("settings")}</span>설정</button>${isPopup ? '<button data-action="open"><span>↗</span>대시보드</button>' : ""}</nav>`;
  app
    .querySelectorAll<HTMLElement>(".highlight[data-opacity]")
    .forEach((element) => {
      element.style.setProperty(
        "--highlight-opacity",
        element.dataset.opacity || "0.25",
      );
    });
  calendarObserver?.disconnect();
  const calendarElement = app.querySelector<HTMLElement>(".calendar");
  const layoutElement = app.querySelector<HTMLElement>(".layout");
  if (!isPopup && calendarElement && layoutElement) {
    calendarObserver = new ResizeObserver((entries) => {
      layoutElement.style.setProperty(
        "--calendar-height",
        `${entries[0].borderBoxSize?.[0]?.blockSize ?? calendarElement.offsetHeight}px`,
      );
    });
    calendarObserver.observe(calendarElement);
  }
  const select = document.querySelector<HTMLSelectElement>("#hours");
  if (select) select.value = String(state.settings.hours);
}
app.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  const date = target.closest<HTMLElement>("[data-date]")?.dataset.date;
  if (date) {
    selected = date;
    if (isPopup) {
      chrome.tabs.create({
        url: chrome.runtime.getURL(`dashboard/index.html?date=${date}`),
      });
    } else render();
    return;
  }
  const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
  if (action === "prev" || action === "next") {
    month = new Date(
      month.getFullYear(),
      month.getMonth() + (action === "prev" ? -1 : 1),
      1,
    );
    render();
  }
  if (action === "all") {
    selected = "";
    render();
  }
  if (action === "calendar" || action === "settings") {
    view = action;
    render();
  }
  if (action === "open")
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/index.html") });
  if (action === "sync") {
    busy = true;
    render();
    try {
      await chrome.runtime.sendMessage({ type: "SYNC" });
    } finally {
      busy = false;
      await load();
    }
  }
});
app.addEventListener("change", async (e) => {
  const target = e.target as HTMLInputElement;
  if (target.id === "enabled" || target.id === "hours") {
    state.settings = {
      ...state.settings,
      [target.id]:
        target.id === "enabled" ? target.checked : Number(target.value),
    };
    await chrome.storage.local.set({ settings: state.settings });
    chrome.runtime.sendMessage({ type: "CHECK" });
  }
});
chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id === chrome.runtime.id && message.type === "SYNC_STATUS") {
    busy = Boolean(message.busy);
    render();
  }
});
chrome.runtime
  .sendMessage({ type: "GET_SYNC_STATUS" })
  .then((result) => {
    busy = Boolean(result?.busy);
    render();
  })
  .catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.keys(changes).some((k) => k in DEFAULTS))
    load();
});
const queryDate = new URLSearchParams(location.search).get("date");
if (/^\d{4}-\d{2}-\d{2}$/.test(queryDate || "")) {
  selected = queryDate!;
  const d = new Date(`${queryDate}T00:00:00`);
  month = new Date(d.getFullYear(), d.getMonth(), 1);
}
load();
