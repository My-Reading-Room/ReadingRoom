import { expect, test } from "vitest";

import { plainTextDescription } from "@/lib/catalog";

test("Google Books description HTML is reduced to plain text", () => {
  expect(plainTextDescription("<p>A <b>desert</b> planet.</p>")).toBe("A desert planet.");
  expect(plainTextDescription(undefined)).toBe("");
});

test("nested or broken tags leave no angle brackets behind", () => {
  for (const input of [
    "<<script>script>alert(1)<</script>/script>",
    "<scr<b>ipt>alert(1)",
    "Unclosed <img src=x onerror=alert(1)",
  ]) {
    expect(plainTextDescription(input)).not.toMatch(/[<>]/);
  }
});
