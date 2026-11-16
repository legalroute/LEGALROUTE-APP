"use client";
import { useRef, useState, useTransition } from "react";
import type { IntakeConfig } from "@/db/schema";
import { Card, buttonClass, inputClass } from "@/components/ui";
import { createImportedIntake, previewIntakeImport } from "./actions";

export function ImportIntake({ tables }: { tables: { id: string; name: string }[] }) {
  const [source, setSource] = useState("upload"), [mode, setMode] = useState("questions"), [sheet, setSheet] = useState("");
  const [sheets, setSheets] = useState<string[]>([]), [config, setConfig] = useState<IntakeConfig>(), [error, setError] = useState<string>();
  const [name, setName] = useState("Imported intake"), [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);
  function invalidate() { setConfig(undefined); setError(undefined); }
  function preview() {
    invalidate();
    const data = new FormData(); data.set("mode", mode);
    if (source === "upload") { const chosen = file.current?.files?.[0]; if (chosen) data.set("file", chosen); data.set("sheet", sheet); }
    else data.set("dataset", source);
    start(async () => {
      const result = await previewIntakeImport(data);
      setError(result.error); setConfig(result.config);
      if (result.sheets) { setSheets(result.sheets); setSheet(result.selectedSheet ?? ""); }
    });
  }
  return <div className="space-y-5">
    <Card className="space-y-4 p-5">
      <label className="block text-sm font-medium">Source<select disabled={pending} value={source} onChange={(e) => { setSource(e.target.value); setSheets([]); setSheet(""); invalidate(); }} className={inputClass}><option value="upload">Upload Excel / CSV</option>{tables.map((t) => <option key={t.id} value={t.id}>{t.name} (Google Sheets)</option>)}</select></label>
      {source === "upload" && <label className="block text-sm font-medium">File (.xlsx or .csv, max 512 KB)<input ref={file} type="file" accept=".xlsx,.csv" disabled={pending} onChange={() => { setSheets([]); setSheet(""); invalidate(); }} className={`${inputClass} mt-1`} /></label>}
      {source === "upload" && sheets.length > 1 && <label className="block text-sm font-medium">Worksheet<select value={sheet} disabled={pending} onChange={(e) => { setSheet(e.target.value); invalidate(); }} className={inputClass}>{sheets.map((s) => <option key={s}>{s}</option>)}</select></label>}
      <label className="block text-sm font-medium">How is the source organized?<select value={mode} disabled={pending} onChange={(e) => { setMode(e.target.value); invalidate(); }} className={inputClass}><option value="questions">Each row defines a question</option><option value="headers">Each column describes client data</option></select></label>
      <p className="text-sm text-slate-600">{mode === "questions" ? 'Use a first-row "question" heading. Optional headings: section, type, required, choices. Separate choice options with |. Supported types: text, textarea, email, phone, number, date, boolean, select, multiselect.' : "Only column headings become questions. Client records are never copied into the form or sent to AI. Review suggested field types and wording in the builder."}</p>
      <p className="text-xs text-slate-500">Files are parsed for this preview and are not saved. Connected tables use their latest cached snapshot; refresh the table first if needed. The new draft is independent of its source.</p>
      <button disabled={pending} onClick={preview} className={buttonClass.primary}>{pending ? "Working…" : "Preview questions"}</button>
    </Card>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    {config && <Card className="space-y-4 p-5"><h2 className="text-xl font-semibold">Review generated questions</h2>{config.sections.map((s) => <section key={s.id}><h3 className="font-semibold">{s.title}</h3><ol className="list-inside list-decimal text-sm">{s.questions.map((q) => <li key={q.id} className="py-1">{q.text} <span className="text-slate-500">({q.type || "text"}, {q.required ? "required" : "optional"}{q.choices?.length ? `: ${q.choices.join(" / ")}` : ""})</span></li>)}</ol></section>)}
      <label className="block text-sm font-medium">Intake name<input maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></label>
      <p className="text-sm text-slate-500">Create a draft to edit wording, sections, types, required flags and options. Review it before publishing.</p>
      <button disabled={pending || !name.trim()} className={buttonClass.dark} onClick={() => start(async () => { const result = await createImportedIntake(name, config); setError(result.error); })}>Create editable draft</button>
    </Card>}
  </div>;
}
