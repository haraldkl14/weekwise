import { describe, expect, it } from "vitest";
import {
  buildWeek,
  deleteBlock,
  gapAt,
  layoutDay,
  moveBlock,
  newBlockRange,
  overlapping,
  paletteItems,
  placeItem,
  placementStart,
  typicalLength,
  renameMatching,
  resizeBlock,
  sameTitleBlocks,
  summarizeBlocks,
  timeError,
  upsertBlock,
  WeekBlock,
} from "@/lib/schedule/week";
import { Placement } from "@/lib/types";
import { activity, block, fixed } from "./fixtures";

const gym = activity({ id: "gym", name: "Gym", hoursPerWeek: 3, color: "#2563eb" });
const placements: Placement[] = [
  { id: "p1", activityId: "gym", day: 0, start: 17 * 60, end: 18 * 60 },
  { id: "p2", activityId: "gym", day: 2, start: 17 * 60, end: 18 * 60 },
];
const school = block({ id: "school", name: "School", days: [0, 1, 2, 3, 4], start: "08:00", end: "15:00" });
const week = buildWeek(fixed({ events: [school] }), [gym], placements);
const find = (blocks: WeekBlock[], pred: (b: WeekBlock) => boolean) => blocks.find(pred)!;
const mondaySchool = find(week, (b) => b.title === "School" && b.day === 0);
const mondayGym = find(week, (b) => b.activityId === "gym" && b.day === 0);

describe("buildWeek", () => {
  it("turns commitments and placements into per-day blocks", () => {
    expect(week.filter((b) => b.kind === "event")).toHaveLength(5);
    expect(mondaySchool).toMatchObject({ kind: "event", start: 480, end: 900, color: null });
    expect(mondayGym).toMatchObject({ kind: "activity", title: "Gym", color: "#2563eb", start: 1020, end: 1080 });
    // Sleep 23:00–07:00 is split at midnight: two pieces per day.
    expect(week.filter((b) => b.kind === "sleep" && b.day === 2).map((b) => [b.start, b.end])).toEqual([
      [0, 420],
      [1380, 1440],
    ]);
  });
});

describe("free editing", () => {
  it("lets an activity be dropped right on top of a fixed event", () => {
    const moved = moveBlock(week, mondayGym.id, 0, 9 * 60);
    expect(find(moved, (b) => b.id === mondayGym.id)).toMatchObject({ day: 0, start: 540, end: 600 });
    expect(overlapping(moved, find(moved, (b) => b.id === mondayGym.id)).map((b) => b.title)).toEqual(["School"]);
  });

  it("moves across days, snaps to 15 min and stays inside the day", () => {
    expect(find(moveBlock(week, mondayGym.id, 4, 10 * 60 + 8), (b) => b.id === mondayGym.id)).toMatchObject({ day: 4, start: 615 });
    expect(find(moveBlock(week, mondayGym.id, 4, 1430), (b) => b.id === mondayGym.id)).toMatchObject({ start: 1380, end: 1440 });
    expect(find(moveBlock(week, mondayGym.id, 4, -50), (b) => b.id === mondayGym.id)).toMatchObject({ start: 0, end: 60 });
  });

  it("shortens a fixed event by dragging its end (this day only)", () => {
    const shorter = resizeBlock(week, mondaySchool.id, "end", 13 * 60 + 2);
    expect(find(shorter, (b) => b.id === mondaySchool.id)).toMatchObject({ start: 480, end: 780 });
    expect(find(shorter, (b) => b.title === "School" && b.day === 1).end).toBe(900);
  });

  it("resizes from either edge but never below 15 minutes", () => {
    expect(find(resizeBlock(week, mondayGym.id, "end", 900), (b) => b.id === mondayGym.id)).toMatchObject({ start: 1020, end: 1035 });
    expect(find(resizeBlock(week, mondayGym.id, "start", 16 * 60), (b) => b.id === mondayGym.id)).toMatchObject({ start: 960, end: 1080 });
    expect(find(resizeBlock(week, mondayGym.id, "start", 1200), (b) => b.id === mondayGym.id)).toMatchObject({ start: 1065 });
  });

  it("validates times typed into the edit form", () => {
    expect(timeError(600, 660)).toBeNull();
    expect(timeError(600, 600)).toContain("after the start");
    expect(timeError(600, 610)).toContain("15 minutes");
    expect(timeError(1380, 1440)).toBeNull();
  });

  it("adds, edits and deletes blocks", () => {
    const added = upsertBlock(week, { id: "new", kind: "activity", title: "Piano", color: "#000000", day: 5, start: 600, end: 660 });
    expect(added).toHaveLength(week.length + 1);
    const edited = upsertBlock(added, { ...find(added, (b) => b.id === "new"), title: "Guitar", end: 690 });
    expect(find(edited, (b) => b.id === "new")).toMatchObject({ title: "Guitar", end: 690 });
    expect(deleteBlock(edited, "new")).toHaveLength(week.length);
  });

  it("renames one block or every block with the same title", () => {
    expect(sameTitleBlocks(week, mondaySchool.id)).toHaveLength(5);
    const all = renameMatching(week, mondaySchool.id, "University");
    expect(all.filter((b) => b.title === "University")).toHaveLength(5);
    expect(all.filter((b) => b.title === "School")).toHaveLength(0);
  });
});

describe("adding in free time", () => {
  it("finds the empty gap around a minute", () => {
    expect(gapAt(week, 0, 16 * 60)).toEqual({ start: 900, end: 1020 }); // between school and gym
    expect(gapAt(week, 0, 9 * 60)).toBeNull(); // school
    expect(gapAt(week, 5, 12 * 60)).toEqual({ start: 420, end: 1380 }); // Saturday: only sleep
  });

  it("proposes a 1h block on the half hour, shortened by the next block", () => {
    expect(newBlockRange(week, 0, 15 * 60 + 40)).toEqual({ start: 930, end: 990 });
    expect(newBlockRange(week, 0, 16 * 60 + 40)).toEqual({ start: 990, end: 1020 }); // gym at 17:00
  });
});

describe("layoutDay", () => {
  it("puts overlapping blocks side by side and leaves others full width", () => {
    const blocks = moveBlock(week, mondayGym.id, 0, 9 * 60).filter((b) => b.day === 0);
    const layout = layoutDay(blocks);
    expect(layout.get(mondaySchool.id)).toEqual({ col: 0, cols: 2 });
    expect(layout.get(mondayGym.id)).toEqual({ col: 1, cols: 2 });
    const sleep = find(blocks, (b) => b.kind === "sleep" && b.start === 0);
    expect(layout.get(sleep.id)).toEqual({ col: 0, cols: 1 });
  });

  it("reuses a column once a block ends", () => {
    const b = (id: string, start: number, end: number): WeekBlock => ({ id, kind: "activity", title: id, color: null, day: 0, start, end });
    const layout = layoutDay([b("a", 0, 120), b("b", 30, 60), b("c", 60, 90)]);
    expect(layout.get("b")).toEqual({ col: 1, cols: 2 });
    expect(layout.get("c")).toEqual({ col: 1, cols: 2 });
  });
});

describe("summarizeBlocks", () => {
  it("tracks targets for linked blocks and lists manual extras", () => {
    const withExtra = upsertBlock(week, { id: "x", kind: "activity", title: "Piano", color: "#000000", day: 5, start: 600, end: 690 });
    const s = summarizeBlocks(withExtra, [gym]);
    expect(s.targets[0]).toMatchObject({ name: "Gym", scheduledMinutes: 120, targetMinutes: 180, sessions: 2 });
    expect(s.extras).toEqual([{ title: "Piano", color: "#000000", minutes: 90, sessions: 1 }]);
  });

  it("treats blocks of a deleted activity as extras", () => {
    expect(summarizeBlocks(week, []).extras[0]).toMatchObject({ title: "Gym", minutes: 120, sessions: 2 });
  });
});


describe("palette (re-adding activities from the side list)", () => {
  const piano = (id: string, day: number, start: number, end: number): WeekBlock => ({
    id,
    kind: "activity",
    title: "Piano",
    color: "#ff0000",
    day: day as WeekBlock["day"],
    start,
    end,
  });

  it("lists Step 2 activities and manually added ones, with their typical length", () => {
    const blocks = [...week, piano("x1", 5, 600, 690)];
    const items = paletteItems(blocks, [gym]);
    expect(items).toEqual([
      { key: "a:gym", title: "Gym", color: "#2563eb", minutes: 60, activityId: "gym" },
      { key: "t:Piano", title: "Piano", color: "#ff0000", minutes: 90 },
    ]);
  });

  it("uses the most common length, preferring the longer on ties", () => {
    expect(typicalLength([{ start: 0, end: 60 }, { start: 0, end: 30 }, { start: 0, end: 30 }])).toBe(30);
    expect(typicalLength([{ start: 0, end: 60 }, { start: 0, end: 90 }])).toBe(90);
    expect(typicalLength([])).toBeNull();
  });

  it("falls back to the minimum session length for an activity with no blocks", () => {
    expect(paletteItems([], [activity({ id: "yoga", name: "Yoga", minSessionHours: 0.75 })])[0].minutes).toBe(45);
  });

  it("places a copy with the same name, color, length and link", () => {
    const items = paletteItems([...week, piano("x1", 5, 600, 690)], [gym]);
    const placed = placeItem(week, items[1], 3, 14 * 60 + 7, "new");
    expect(find(placed, (b) => b.id === "new")).toMatchObject({ title: "Piano", color: "#ff0000", day: 3, start: 840, end: 930 });
    expect(find(placed, (b) => b.id === "new").activityId).toBeUndefined();
    const linked = placeItem(week, items[0], 6, 600, "g");
    expect(find(linked, (b) => b.id === "g")).toMatchObject({ activityId: "gym", end: 660 });
    expect(summarizeBlocks(linked, [gym]).targets[0].sessions).toBe(3);
  });

  it("keeps placed blocks inside the day", () => {
    expect(placementStart(1430, 90)).toBe(1350);
    expect(placementStart(-10, 60)).toBe(0);
  });
});
