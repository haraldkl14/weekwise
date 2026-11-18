import { DAY_SHORT, FixedCommitments, LockedInterval } from "../types";
import { formatHHMM, dayOf } from "./clock";
import { lockedIntervals } from "./commitments";

export interface OverlapWarning {
  a: { sourceId: string; label: string; kind: LockedInterval["kind"] };
  b: { sourceId: string; label: string; kind: LockedInterval["kind"] };
  message: string;
}

/**
 * Pairwise overlaps between distinct commitments (no buffers). One warning per
 * pair of sources, mentioning the first clash.
 */
export function findOverlaps(fixed: FixedCommitments): OverlapWarning[] {
  const intervals = lockedIntervals(fixed).sort((x, y) => x.start - y.start);
  const seen = new Set<string>();
  const out: OverlapWarning[] = [];
  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length && intervals[j].start < intervals[i].end; j++) {
      const a = intervals[i];
      const b = intervals[j];
      if (a.sourceId === b.sourceId) continue;
      const key = [a.sourceId, b.sourceId].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const start = Math.max(a.start, b.start);
      const end = Math.min(a.end, b.end);
      const day = dayOf(start);
      const sod = start - day * 1440;
      const eod = end - day * 1440;
      out.push({
        a: { sourceId: a.sourceId, label: a.label, kind: a.kind },
        b: { sourceId: b.sourceId, label: b.label, kind: b.kind },
        message: `"${a.label}" overlaps "${b.label}" on ${DAY_SHORT[day]} ${formatHHMM(sod)}–${formatHHMM(Math.min(eod, 1440))}`,
      });
    }
  }
  return out;
}
