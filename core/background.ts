import { validJnuAssignment, jnuPageUrl } from "../adaptor/jnu-urls.js";
import { DEFAULTS, mergeAssignments, dueNotifications } from "./model.js";
let syncPromise: Promise<void> | null = null;
function broadcastSync(busy: boolean) {
  chrome.runtime.sendMessage({ type: "SYNC_STATUS", busy }).catch(() => {});
}
let adapterCreation;
async function ensureAdapter() {
  const url = chrome.runtime.getURL("adaptor/offscreen.html");
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [url],
  });
  if (existing.length) return;
  if (!adapterCreation)
    adapterCreation = chrome.offscreen
      .createDocument({
        url: "adaptor/offscreen.html",
        reasons: ["DOM_PARSER"],
        justification: "LMS 과제 페이지를 읽고 제출 상태를 해석합니다.",
      })
      .finally(() => {
        adapterCreation = null;
      });
  await adapterCreation;
}
async function read() {
  const state = {
    ...DEFAULTS,
    ...(await chrome.storage.local.get(Object.keys(DEFAULTS))),
  };
  state.assignments = Array.isArray(state.assignments)
    ? state.assignments.filter(validJnuAssignment)
    : [];
  return state;
}
async function notify() {
  const state = await read();
  for (const a of dueNotifications(
    state.assignments,
    state.settings,
    state.notified,
  )) {
    await chrome.notifications.create(`assignment:${a.id}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "과제 마감이 다가옵니다",
      message: `${a.title} · ${new Date(a.dueAt!).toLocaleString("ko-KR")}`,
    });
    state.notified[a.id] = a.dueAt!;
  }
  await chrome.storage.local.set({ notified: state.notified });
}
function sync(): Promise<void> {
  if (syncPromise) return syncPromise;
  syncPromise = performSync().finally(() => {
    syncPromise = null;
    broadcastSync(false);
  });
  broadcastSync(true);
  return syncPromise;
}
async function performSync(): Promise<void> {
  try {
    const permitted = await chrome.permissions.contains({
      origins: ["https://sel.jnu.ac.kr/*"],
    });
    if (!permitted)
      throw new Error(
        "LMS 사이트 접근 권한이 없습니다. Chrome 확장 프로그램 설정에서 사이트 액세스를 확인해 주세요.",
      );
    await ensureAdapter();
    const result = await chrome.runtime.sendMessage({
      target: "jnu-adapter",
      type: "JNU_SYNC",
    });
    if (!result) throw new Error("LMS 동기화 모듈을 시작하지 못했습니다");
    if (result.error) throw new Error(result.error);
    const state = await read();
    await chrome.storage.local.set({
      assignments: mergeAssignments(
        state.assignments,
        Array.isArray(result.assignments)
          ? result.assignments.filter(validJnuAssignment)
          : [],
      ),
      lastSync: Date.now(),
      syncError: result.warning || null,
    });
  } catch (error) {
    await chrome.storage.local.set({
      syncError: error instanceof Error ? error.message : String(error),
    });
  }
}
chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create("check", { periodInMinutes: 15 });
  await sync();
  await notify();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("check", { periodInMinutes: 15 });
  sync().then(notify);
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "check") {
    sync().then(notify);
  }
});
let lastTabSync = 0;
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (
    change.status === "complete" &&
    tab.url?.startsWith("https://sel.jnu.ac.kr/") &&
    Date.now() - lastTabSync >= 60_000
  ) {
    lastTabSync = Date.now();
    sync();
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.type === "GET_SYNC_STATUS") {
    sendResponse({ busy: syncPromise !== null });
    return;
  }
  if (message.type === "SYNC") {
    sync()
      .then(notify)
      .then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "CHECK") {
    notify().then(() => sendResponse({ ok: true }));
    return true;
  }
});
chrome.notifications.onClicked.addListener(async (id) => {
  if (id.startsWith("assignment:")) {
    const state = await read();
    const a = state.assignments.find((x) => `assignment:${x.id}` === id);
    const url = a && jnuPageUrl(a.url, "assignment");
    if (url) chrome.tabs.create({ url });
  }
});
