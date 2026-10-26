import { expect, it } from "vitest";
import { isLocalOperator } from "./local-operator.js";

it("accepts only direct local socket and numeric local authority on the configured port", () => {
  expect(isLocalOperator("127.0.0.1", "127.0.0.1:7688", 7688, false)).toBe(true);
  expect(isLocalOperator("::ffff:127.0.0.1", "127.0.0.1:7688", 7688, false)).toBe(true);
  expect(isLocalOperator("127.0.0.1", "127.0.0.1:7688", 7688, true)).toBe(false);
  expect(isLocalOperator("192.0.2.10", "127.0.0.1:7688", 7688, false)).toBe(false);
  expect(isLocalOperator("127.0.0.1", "palm.example.test:7688", 7688, false)).toBe(false);
  expect(isLocalOperator("127.0.0.1", "127.0.0.1:8000", 7688, false)).toBe(false);
});
