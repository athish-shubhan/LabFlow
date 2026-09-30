import { describe, expect, it } from "vitest";
import { readTokenClaims, safeNextPath } from "./token";

function fakeJwt(payload: object) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.signature`;
}

describe("readTokenClaims", () => {
  const now = 1_800_000_000;
  it("reads user, org and expiry from a backend token", () => {
    expect(readTokenClaims(fakeJwt({ sub: "u1", org_id: "o1", exp: now + 60 }), now)).toEqual({
      userId: "u1",
      orgId: "o1",
      expiresAt: now + 60,
    });
  });
  it("treats expired, malformed or incomplete tokens as signed out", () => {
    expect(readTokenClaims(fakeJwt({ sub: "u1", org_id: "o1", exp: now - 1 }), now)).toBeNull();
    expect(readTokenClaims(fakeJwt({ sub: "u1", exp: now + 60 }), now)).toBeNull();
    expect(readTokenClaims("garbage", now)).toBeNull();
    expect(readTokenClaims(undefined, now)).toBeNull();
  });
});

describe("safeNextPath", () => {
  it("only allows same-origin paths after login", () => {
    expect(safeNextPath("/experiments/1?x=1")).toBe("/experiments/1?x=1");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });
});
