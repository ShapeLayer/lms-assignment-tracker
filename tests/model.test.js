import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  dateKey,
  mergeAssignments,
  dueNotifications,
  assignmentsOnDate,
  peakAssignments,
  highlightOpacity,
} from "../dist/core/model.js";
test("merges updates and retains known status when a later parse is uncertain", () => {
  const result = mergeAssignments(
    [{ id: "a", status: "completed", title: "old" }],
    [
      { id: "a", status: "unknown", title: "new" },
      { id: "b", status: "pending" },
    ],
  );
  assert.equal(result.find((x) => x.id === "a").status, "completed");
  assert.equal(result.find((x) => x.id === "a").title, "new");
  assert.equal(result.length, 2);
});
test("only alerts pending upcoming assignments once per deadline", () => {
  const now = Date.parse("2026-11-03T00:00:00Z");
  const dueAt = "2026-11-03T12:00:00Z";
  const items = [
    { id: "a", status: "pending", dueAt },
    { id: "b", status: "completed", dueAt },
    { id: "c", status: "unknown", dueAt },
    { id: "d", status: "pending", dueAt: "2026-11-02T00:00:00Z" },
  ];
  assert.deepEqual(
    dueNotifications(items, { enabled: true, hours: 24 }, {}, now).map(
      (x) => x.id,
    ),
    ["a"],
  );
  assert.equal(
    dueNotifications(items, { enabled: true, hours: 24 }, { a: dueAt }, now)
      .length,
    0,
  );
  assert.equal(
    dueNotifications(items, { enabled: false, hours: 24 }, {}, now).length,
    0,
  );
});
test("dateKey handles absent dates", () => assert.equal(dateKey(null), ""));

test("assignment ranges include start and deadline, and preserve first observation on later syncs", () => {
  const first = new Date(2026, 10, 3, 12).getTime();
  const dueAt = new Date(2026, 10, 5, 18).toISOString();
  const item = { id: "range", dueAt, updatedAt: first, status: "pending" };
  const [saved] = mergeAssignments([], [item]);
  const [updated] = mergeAssignments(
    [saved],
    [{ ...item, updatedAt: new Date(2026, 10, 4).getTime() }],
  );
  assert.equal(updated.firstSeenAt, first);
  assert.equal(assignmentsOnDate([updated], new Date(2026, 10, 2)).length, 0);
  assert.equal(assignmentsOnDate([updated], new Date(2026, 10, 3)).length, 1);
  assert.equal(assignmentsOnDate([updated], new Date(2026, 10, 5)).length, 1);
  assert.equal(assignmentsOnDate([updated], new Date(2026, 10, 6)).length, 0);
});

test("language-dependent title changes update the same ID and retain unparsed dates", () => {
  const old = {
    id: "jnu:123",
    title: "과제",
    dueAt: "2026-11-05T00:00:00Z",
    startAt: "2026-11-01T00:00:00Z",
    status: "pending",
    updatedAt: 1,
  };
  const [result] = mergeAssignments(
    [old],
    [
      {
        ...old,
        title: "Assignment",
        dueAt: null,
        startAt: null,
        status: "unknown",
        updatedAt: 2,
      },
    ],
  );
  assert.equal(result.title, "Assignment");
  assert.equal(result.dueAt, old.dueAt);
  assert.equal(result.startAt, old.startAt);
  assert.equal(result.status, "pending");
  assert.equal(result.firstSeenAt, 1);
});

test("highlight opacity uses peak overlapping assignments and retains a visible minimum", () => {
  const item = (id, start, end, status) => ({
    id,
    startAt: new Date(2026, 10, start).toISOString(),
    dueAt: new Date(2026, 10, end).toISOString(),
    status,
  });
  const items = [
    item("a", 1, 3, "completed"),
    item("b", 3, 5, "pending"),
    item("c", 3, 4, "pending"),
    item("d", 8, 9, "pending"),
  ];
  assert.equal(peakAssignments(items), 3);
  assert.equal(highlightOpacity(3, 3), 1);
  assert.equal(highlightOpacity(2, 3), 2 / 3);
  assert.equal(highlightOpacity(0, 3), 0.25);
  assert.equal(highlightOpacity(0, 0), 0.25);
  assert.equal(peakAssignments([]), 0);
});
