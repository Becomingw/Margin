import assert from "node:assert/strict";
import { it } from "node:test";
import { commentRanges, intersects } from "../public/review-ranges.js";

it("merged highlights preserve overlapping, nested and non-monotonic mapped ranges", () => {
  const comments = [[3, 8], [5, 6], [8, 10], [30, 40], [0, 0], [50, 51]].map(([start, end]) => ({ status: "open", anchor: { status: "attached", start, end } }));
  comments.push({ status: "resolved", anchor: { status: "attached", start: 0, end: 100 } });
  comments.push({ status: "open", anchor: { status: "unlocated", start: 0, end: 100 } });
  const ranges = commentRanges(comments);
  assert.deepEqual(ranges, [[3, 10], [30, 40], [50, 51]]);
  for (const [start, end] of [[31, 35], [0, 3], [9, 10], [10, 30], [39, 52], [3, 3], [0, 100]]) {
    assert.equal(intersects(ranges, start, end), end > start && comments.some((item) => item.status === "open" && item.anchor.status === "attached" && item.anchor.end > item.anchor.start && item.anchor.start < end && item.anchor.end > start));
  }
});
