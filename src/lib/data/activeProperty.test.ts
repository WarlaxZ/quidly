import { describe, expect, it } from "vitest";
import { resolveActiveProperty } from "./activeProperty";

const props = [{ id: "p1" }, { id: "p2" }];

describe("resolveActiveProperty", () => {
  it("returns the cookie's property when it exists", () => {
    expect(resolveActiveProperty(props, "p2")).toEqual({ propertyId: "p2", isAll: false });
  });
  it("treats 'all' as the consolidated view", () => {
    expect(resolveActiveProperty(props, "all")).toEqual({ propertyId: null, isAll: true });
  });
  it("falls back to the first property for a missing/stale/absent cookie", () => {
    expect(resolveActiveProperty(props, undefined)).toEqual({ propertyId: "p1", isAll: false });
    expect(resolveActiveProperty(props, "gone")).toEqual({ propertyId: "p1", isAll: false });
  });
  it("returns null id when there are no properties", () => {
    expect(resolveActiveProperty([], undefined)).toEqual({ propertyId: null, isAll: false });
  });
});
