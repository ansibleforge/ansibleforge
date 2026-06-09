import { describe, expect, it } from "vitest";
import { parseControl, parseInit } from "../src/ws/protocol.js";

const REGIONS = ["us-east-2", "us-west-2"];

describe("parseInit", () => {
  const valid = {
    type: "init",
    token: "abc.def",
    instanceId: "i-0abc123def456789",
    region: "us-east-2",
    cols: 120,
    rows: 30,
  };

  it("accepts a well-formed init frame", () => {
    const r = parseInit(JSON.stringify(valid), REGIONS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.instanceId).toBe("i-0abc123def456789");
      expect(r.value.cols).toBe(120);
      expect(r.value.user).toBeUndefined();
    }
  });

  it("rejects non-JSON", () => {
    expect(parseInit("not json", REGIONS).ok).toBe(false);
  });

  it("rejects a non-init type", () => {
    expect(parseInit(JSON.stringify({ ...valid, type: "resize" }), REGIONS).ok).toBe(false);
  });

  it("requires a token", () => {
    expect(parseInit(JSON.stringify({ ...valid, token: "" }), REGIONS).ok).toBe(false);
  });

  it("validates the instance-id shape", () => {
    expect(parseInit(JSON.stringify({ ...valid, instanceId: "i-XYZ" }), REGIONS).ok).toBe(false);
    expect(parseInit(JSON.stringify({ ...valid, instanceId: "bogus" }), REGIONS).ok).toBe(false);
  });

  it("enforces the region allowlist", () => {
    expect(parseInit(JSON.stringify({ ...valid, region: "eu-west-1" }), REGIONS).ok).toBe(false);
  });

  it("rejects a malformed ssh user but accepts a valid one", () => {
    expect(parseInit(JSON.stringify({ ...valid, user: "Bad User" }), REGIONS).ok).toBe(false);
    const r = parseInit(JSON.stringify({ ...valid, user: "ec2-user" }), REGIONS);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.user).toBe("ec2-user");
  });

  it("clamps missing/extreme dimensions", () => {
    const r = parseInit(JSON.stringify({ ...valid, cols: undefined, rows: 999999 }), REGIONS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.cols).toBe(80);
      expect(r.value.rows).toBe(1000);
    }
  });
});

describe("parseControl", () => {
  it("parses a resize message", () => {
    expect(parseControl(JSON.stringify({ type: "resize", cols: 100, rows: 40 }))).toEqual({
      type: "resize",
      cols: 100,
      rows: 40,
    });
  });

  it("returns null for unknown/invalid control frames", () => {
    expect(parseControl("nope")).toBeNull();
    expect(parseControl(JSON.stringify({ type: "wat" }))).toBeNull();
  });
});
