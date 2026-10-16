// Merge once per review snapshot; source mappings need not be monotonic.
export function commentRanges(comments) {
  const ranges = comments.filter((item) => item.status === "open" && ["attached", "modified"].includes(item.anchor.status) && item.anchor.end > item.anchor.start)
    .map((item) => [item.anchor.start, item.anchor.end]).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push(range);
  }
  return merged;
}
export function intersects(ranges, start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  let low = 0;
  let high = ranges.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (ranges[mid][1] <= start) low = mid + 1;
    else high = mid;
  }
  return low < ranges.length && ranges[low][0] < end;
}
