import { describe, expect, it } from "vitest";
import { isUnverifiedError, normalizeOtp, verifyPath } from "../src/lib/auth/verify";
import { authKeys } from "../src/lib/auth/rate-limit";

describe("email OTP helpers", () => {
  it("normalizes pasted codes and rejects anything that is not 6 digits", () => {
    expect(normalizeOtp("123456")).toBe("123456");
    expect(normalizeOtp(" 123 456 ")).toBe("123456");
    expect(normalizeOtp("123-456")).toBe("123456");
    for (const bad of ["", "12345", "1234567", "12345a", "١٢٣٤٥٦"]) expect(normalizeOtp(bad)).toBeNull();
  });
  it("detects the unverified sign-in error without matching other failures", () => {
    expect(isUnverifiedError({ code: "EMAIL_NOT_VERIFIED", status: 403 })).toBe(true);
    expect(isUnverifiedError({ status: 403, message: "Email not verified" })).toBe(true);
    expect(isUnverifiedError({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(false);
    expect(isUnverifiedError({ status: 403, message: "banned" })).toBe(false);
    expect(isUnverifiedError(null)).toBe(false);
  });
  it("builds an encoded verify URL", () => {
    expect(verifyPath("a+b@x.com", true)).toBe("/verificar?email=a%2Bb%40x.com&enviado=1");
    expect(verifyPath("a@x.com", false)).toBe("/verificar?email=a%40x.com");
  });
  it("verify/resend/login counters are independent scopes", () => {
    const a = authKeys("1.1.1.1", "a@x.com").map((k) => k.key);
    const b = authKeys("1.1.1.1", "a@x.com", "verify:").map((k) => k.key);
    expect(a.some((k) => b.includes(k))).toBe(false);
  });
});
