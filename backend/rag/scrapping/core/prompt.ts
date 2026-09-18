// Tiny stdin helper for the interactive scraper tools (inspect.ts). Not used by
// download.ts: that one is also launched from the admin panel with no terminal
// attached, so it watches the DOM instead of ever prompting (PRODUCTION_TODO.md T12).

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

export async function waitForEnter(
  message: string,
  input: NodeJS.ReadableStream = stdin,
  output: NodeJS.WritableStream = stdout,
): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    await rl.question(message);
  } finally {
    rl.close();
  }
}
