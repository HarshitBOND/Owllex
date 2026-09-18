// Regression test for PRODUCTION_TODO.md T12: sources/sci-judgments/inspect.ts has
// always imported `waitForEnter` from `../../core/prompt.js`, but that module never
// existed in this tree -- `npm run scrape:sci:inspect` (added by this same task) threw
// MODULE_NOT_FOUND before ever reaching the browser. This test exercises the real
// module rather than a mock of it, since a mock would happily pass against the same
// missing file.

import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { waitForEnter } from "../../backend/rag/scrapping/core/prompt.js";

describe("waitForEnter", () => {
  it("resolves once a line arrives on the given input stream", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume(); // drain the prompt text so the stream never backs up

    const pending = waitForEnter("press enter: ", input, output);
    input.write("\n");

    await expect(pending).resolves.toBeUndefined();
  });

  it("closes the readline interface so the input stream can be reused", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();

    input.write("\n");
    await waitForEnter("first: ", input, output);

    input.write("\n");
    await expect(waitForEnter("second: ", input, output)).resolves.toBeUndefined();
  });
});
