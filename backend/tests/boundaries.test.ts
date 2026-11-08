import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

async function sources(directory: URL): Promise<string[]> {
  const result: string[] = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(item.name + (item.isDirectory() ? "/" : ""), directory);
    if (item.isDirectory()) result.push(...await sources(url));
    else if (item.name.endsWith(".ts")) result.push(await readFile(url, "utf8"));
  }
  return result;
}
test("backend is independent of Next.js and agents; agents cannot query the DB", async () => {
  for (const source of await sources(new URL("../src/", import.meta.url))) {
    assert.doesNotMatch(source, /from ["'](?:next\/|@\/|@legalroute\/agents)/);
  }
  for (const source of await sources(new URL("../../agents/src/", import.meta.url))) {
    const runtimeImports = source.split("\n").filter((line) => !line.startsWith("import type ")).join("\n");
    assert.doesNotMatch(runtimeImports, /from ["'](?:drizzle-orm|postgres|@legalroute\/backend\/db|@legalroute\/backend\/services\/(?:auth|maya))/);
  }
});
