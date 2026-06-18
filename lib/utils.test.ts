import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn utility", () => {
    it("merges class names", () => {
        expect(cn("foo", "bar")).toBe("foo bar");
    });

    it("deduplicates Tailwind classes (tailwind-merge)", () => {
        // tailwind-merge resolves conflicts: last wins
        expect(cn("p-2", "p-4")).toBe("p-4");
    });

    it("ignores falsy values", () => {
        expect(cn("foo", false, undefined, null, "bar")).toBe("foo bar");
    });
});
