import { describe, expect, it } from "vitest";
import { pageItems, pageRange, parsePage } from "./pagination";

describe("pageItems", () => {
  it("shows every page when there are few", () => {
    expect(pageItems(2, 4)).toEqual([1, 2, 3, 4]);
  });
  it("collapses distant pages into gaps around the current page", () => {
    expect(pageItems(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
  });
  it("fills a single-page hole instead of showing a gap", () => {
    expect(pageItems(4, 9)).toEqual([1, 2, 3, 4, 5, "gap", 9]);
  });
  it("handles empty results", () => {
    expect(pageItems(1, 0)).toEqual([]);
  });
});

describe("pageRange", () => {
  it("computes the 1-based row range of a page", () => {
    expect(pageRange(2, 25, 214)).toEqual({ start: 26, end: 50 });
    expect(pageRange(9, 25, 214)).toEqual({ start: 201, end: 214 });
    expect(pageRange(1, 25, 0)).toEqual({ start: 0, end: 0 });
  });
});

describe("parsePage", () => {
  it.each([
    ["3", 3],
    [null, 1],
    ["0", 1],
    ["-2", 1],
    ["2.5", 1],
    ["abc", 1],
  ])("%s -> %i", (raw, expected) => {
    expect(parsePage(raw)).toBe(expected);
  });
});
