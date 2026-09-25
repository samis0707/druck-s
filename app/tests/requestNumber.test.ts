import { describe, expect, it } from "vitest";
import { formatRequestNumber, requestRef } from "@/lib/requestNumber";

describe("requestNumber", () => {
  it("formats DDMMYY-NNN with zero padding", () => {
    expect(formatRequestNumber("250926", 1)).toBe("250926-001");
    expect(formatRequestNumber("250926", 42)).toBe("250926-042");
  });
  it("widens beyond 999 per day", () => {
    expect(formatRequestNumber("250926", 1000)).toBe("250926-1000");
  });
  it("falls back to the short id for legacy/draft requests", () => {
    expect(requestRef({ id: "ebd6af7c-2342-41ff-bfd5-40ac253f0efd", number: null })).toBe("ebd6af7c");
    expect(requestRef({ id: "x", number: "250926-001" })).toBe("250926-001");
  });
});
