import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { generateIntake, readIntakeFile } from "../src/services/intake-import.ts";
import { editableConfigSchema, normalizeConfig } from "../src/services/intake-config.ts";

test("client headers become unique optional fields without client records", () => {
  const config = generateIntake([["Email", "Email", "Phone", "Incident date"], ["PRIVATE_CLIENT@example.com", "secret"]], "headers");
  const qs = config.sections[0].questions;
  assert.deepEqual(qs.map((q) => q.type), ["email", "email", "phone", "date"]);
  assert.equal(new Set(qs.map((q) => q.id)).size, 4);
  assert.ok(qs.every((q) => q.required === false));
  assert.ok(!JSON.stringify(config).includes("PRIVATE_CLIENT"));
});
test("question rows preserve sections, required flags, options and stable IDs", () => {
  const result = generateIntake([["question", "section", "type", "required", "choices"], ["Contact method?", "Contact", "select", "yes", "Email|Phone"], ["Anything else?", "Details", "textarea", "no", ""]], "questions");
  assert.equal(result.sections.length, 2);
  assert.deepEqual(result.sections[0].questions[0].choices, ["Email", "Phone"]);
  assert.equal(result.sections[0].questions[0].required, true);
  assert.deepEqual(normalizeConfig(result), result);
  assert.equal(editableConfigSchema.safeParse(result).success, true);
  assert.equal(editableConfigSchema.safeParse({ sections: [{ id: "old", title: "Old", questions: [{ id: "old", text: "Legacy?" }] }] }).success, true);
  assert.throws(() => generateIntake([["question", "type"], ["Pick", "select"]], "questions"), /options/);
  assert.throws(() => generateIntake([["question", "required"], ["Pick", "maybe"]], "questions"), /required/);
  assert.throws(() => generateIntake([["question", "Question"], ["A", "B"]], "questions"), /only one/);
  assert.throws(() => generateIntake([["Name"], ["Private"]], "questions"), /question/);
});
test("CSV handles BOM, quoted commas and multiline questions", async () => {
  const source = await readIntakeFile("test.csv", Buffer.from('\ufeffquestion,section\n"What happened,\nand when?",Details\n'));
  assert.equal(generateIntake(source.grid, "questions").sections[0].questions[0].text, "What happened,\nand when?");
  await assert.rejects(() => readIntakeFile("old.xls", Buffer.from("x")), /xlsx/);
  await assert.rejects(() => readIntakeFile("big.csv", Buffer.alloc(512 * 1024 + 1)), /512/);
  await assert.rejects(() => readIntakeFile("bad.xlsx", Buffer.from("bad")), /Invalid/);
});
test("Excel selects worksheets and ignores formulas", async () => {
  const book = new ExcelJS.Workbook();
  book.addWorksheet("Clients").addRow(["Email"]);
  const tab = book.addWorksheet("Questions"); tab.addRow(["question", "section"]); tab.addRow(["Your name?", "Contact"]);
  tab.addRow([{ formula: 'HYPERLINK("https://example.com")', result: "Never import" }, "Contact"]);
  const data = Buffer.from(await book.xlsx.writeBuffer());
  const oversized = Buffer.from(data);
  const directoryEntry = oversized.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  oversized.writeUInt32LE(11 * 1024 * 1024, directoryEntry + 24);
  await assert.rejects(() => readIntakeFile("expanded.xlsx", oversized), /10 MB/);
  const source = await readIntakeFile("firm.xlsx", data, "Questions");
  assert.deepEqual(source.sheets, ["Clients", "Questions"]);
  assert.equal(generateIntake(source.grid, "questions").sections[0].questions.length, 1);
  await assert.rejects(() => readIntakeFile("firm.xlsx", data, "Missing"), /worksheet/);
});
