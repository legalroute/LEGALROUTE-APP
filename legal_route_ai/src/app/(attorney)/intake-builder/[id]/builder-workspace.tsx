"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import type { IntakeConfig, IntakeQuestion } from "@/db/schema";
import { fieldTypes } from "@/lib/intake-config";
import { MayaChat } from "@/components/maya-chat";
import { Pill, buttonClass, inputClass } from "@/components/ui";
import type { ChatMessageDto } from "@/lib/maya/history";
import { deleteTemplate, publishTemplate, renameTemplate, saveTemplateConfig, sendBuilderMessage } from "../actions";

type TemplateDto = {
  id: string;
  name: string;
  practiceArea: string | null;
  config: IntakeConfig;
  publishedConfig: IntakeConfig | null;
  publishedAt: string | null;
};

const SUGGESTIONS = [
  "Add questions about lost wages",
  "Make the questions shorter and friendlier",
  "Add a section about the other driver",
];

export function BuilderWorkspace({
  template,
  isDefault,
  intakeUrl,
  messages,
  userInitials,
}: {
  template: TemplateDto;
  isDefault: boolean;
  intakeUrl: string;
  messages: ChatMessageDto[];
  userInitials: string;
}) {
  const [config, setConfig] = useState(template.config);
  const [published, setPublished] = useState(template.publishedConfig);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(() => new Set(template.config.sections.slice(0, 1).map((s) => s.id)));
  const [editingName, setEditingName] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [pending, startTransition] = useTransition();

  const dirty = !published || JSON.stringify(published) !== JSON.stringify(config);
  const totalQuestions = config.sections.reduce((n, s) => n + s.questions.length, 0);

  // Highlight what Maya just added and open the sections she touched.
  function applyConfig(next: IntakeConfig) {
    const before = new Set(config.sections.flatMap((s) => s.questions.map((q) => q.id)));
    const added = new Set(next.sections.flatMap((s) => s.questions.filter((q) => !before.has(q.id)).map((q) => q.id)));
    const touched = next.sections.filter((s) => s.questions.some((q) => added.has(q.id)) || !config.sections.some((o) => o.id === s.id));
    setNewIds(added);
    if (touched.length) setOpen((o) => new Set([...o, ...touched.map((s) => s.id)]));
    setConfig(next);
  }

  async function sendToMaya(text: string) {
    const result = await sendBuilderMessage(template.id, text);
    if (result.changed && result.config) applyConfig(result.config);
    return result;
  }

  function saveDirect(next: IntakeConfig) {
    setError(undefined);
    const previous = config;
    setConfig(next);
    startTransition(async () => {
      const result = await saveTemplateConfig(template.id, next);
      if (result.error) { setError(result.error); setConfig(previous); }
      else if (result.config) setConfig(result.config);
    });
  }

  function updateQuestion(si: number, qi: number, patch: Partial<IntakeQuestion>) {
    saveDirect({ sections: config.sections.map((s, i) => i === si ? { ...s, questions: s.questions.map((q, j) => j === qi ? { ...q, ...patch } : q) } : s) });
  }

  function publish() {
    setError(undefined);
    setNotice(undefined);
    startTransition(async () => {
      const result = await publishTemplate(template.id);
      if (result.error) return setError(result.error);
      setPublished(config);
      setNewIds(new Set());
      setNotice(isDefault ? "Published. Clients using your intake link now get this version." : "Published.");
    });
  }

  const toggle = (id: string) =>
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {editingName ? (
          <form
            action={async (fd) => {
              await renameTemplate(template.id, fd);
              setEditingName(false);
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input name="name" defaultValue={template.name} required aria-label="Intake name" className={`${inputClass} w-64`} />
            <input name="practiceArea" defaultValue={template.practiceArea ?? ""} placeholder="Practice area" aria-label="Practice area" className={`${inputClass} w-48`} />
            <button type="submit" className={buttonClass.secondary}>
              Save
            </button>
            <button type="button" onClick={() => setEditingName(false)} className="text-sm text-slate-500">
              Cancel
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-3xl font-semibold tracking-tight">{template.name}</h1>
            <button type="button" onClick={() => setEditingName(true)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Rename">
              <Pencil className="size-4" aria-hidden />
              <span className="sr-only">Rename intake</span>
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {isDefault && published && (
            <a href={intakeUrl} target="_blank" rel="noreferrer" className={buttonClass.secondary}>
              <ExternalLink className="size-4" aria-hidden /> Open intake link
            </a>
          )}
          {dirty ? <Pill tone="orange">{published ? "Unpublished changes" : "Draft"}</Pill> : <Pill tone="green">Published</Pill>}
          <button type="button" onClick={publish} disabled={pending || !dirty || totalQuestions === 0} className={buttonClass.dark}>
            Publish
          </button>
        </div>
      </div>

      {(error || notice) && (
        <p className={`rounded-lg px-3 py-2 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`} role="status">
          {error ?? notice}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex h-[38rem] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3.5">
            <h2 className="font-semibold">Chat with Maya</h2>
            <p className="text-xs text-slate-500">Describe the questions you need in plain language.</p>
          </div>
          <MayaChat
            className="flex-1"
            initialMessages={messages}
            send={sendToMaya}
            placeholder="Tell Maya to update your intake…"
            suggestions={messages.length === 0 ? SUGGESTIONS : []}
            emptyText="Tell Maya what to add, remove or reword. For example: “Add questions about lost wages to my personal injury intake.”"
            userInitials={userInitials}
          />
        </section>

        <section className="flex h-[38rem] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <div>
              <h2 className="font-semibold">Preview</h2>
              <p className="text-xs text-slate-500">
                {config.sections.length} sections · {totalQuestions} questions
              </p>
            </div>
            <button
              type="button"
              className={buttonClass.ghost}
              onClick={() => {
                const title = "New section";
                const id = `section_${Date.now()}`;
                saveDirect({ sections: [...config.sections, { id, title, questions: [] }] });
                setOpen((o) => new Set([...o, id]));
              }}
            >
              <Plus className="size-4" aria-hidden /> Section
            </button>
          </div>
          <fieldset disabled={pending} className="flex-1 overflow-y-auto p-3">
            {config.sections.map((section, si) => {
              const isOpen = open.has(section.id);
              const hasNew = section.questions.some((q) => newIds.has(q.id));
              return (
                <div key={section.id} className={`mb-2 rounded-xl border ${hasNew ? "border-orange-200 bg-orange-50/30" : "border-slate-100"}`}>
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <button type="button" onClick={() => toggle(section.id)} className="flex flex-1 items-center gap-2 text-left" aria-expanded={isOpen}>
                      {isOpen ? <ChevronDown className="size-4 text-slate-400" aria-hidden /> : <ChevronRight className="size-4 text-slate-400" aria-hidden />}
                      <EditableText
                        value={section.title}
                        label="Section title"
                        className="font-medium"
                        onSave={(title) =>
                          saveDirect({ sections: config.sections.map((s, i) => (i === si ? { ...s, title } : s)) })
                        }
                      />
                      <span className="text-sm text-slate-400">({section.questions.length})</span>
                    </button>
                    <button
                      type="button"
                      title="Remove section"
                      onClick={() => saveDirect({ sections: config.sections.filter((_, i) => i !== si) })}
                      className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-4" aria-hidden />
                      <span className="sr-only">Remove section {section.title}</span>
                    </button>
                  </div>
                  {isOpen && (
                    <ol className="flex flex-col gap-1 px-3 pb-3">
                      {section.questions.map((q, qi) => (
                        <li key={q.id} className="group rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"><div className="flex items-start gap-2">
                          <span className="w-5 shrink-0 text-right text-slate-400">{qi + 1}.</span>
                          <EditableText
                            value={q.text}
                            label="Question"
                            className="flex-1"
                            onSave={(text) =>
                              saveDirect({
                                sections: config.sections.map((s, i) =>
                                  i === si ? { ...s, questions: s.questions.map((x, j) => (j === qi ? { ...x, text } : x)) } : s,
                                ),
                              })
                            }
                          />
                          {newIds.has(q.id) && <span className="rounded bg-orange-100 px-1.5 text-xs font-medium text-orange-700">New</span>}
                          <button
                            type="button"
                            title="Remove question"
                            onClick={() =>
                              saveDirect({
                                sections: config.sections.map((s, i) => (i === si ? { ...s, questions: s.questions.filter((_, j) => j !== qi) } : s)),
                              })
                            }
                            className="rounded p-0.5 text-slate-300 opacity-0 group-hover:opacity-100 hover:text-red-600 focus:opacity-100"
                          >
                            <X className="size-4" aria-hidden />
                            <span className="sr-only">Remove question</span>
                          </button>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
                            <label className="text-xs">Type <select disabled={pending} aria-label={`Type for ${q.text}`} value={q.type ?? "text"} className="rounded border p-1" onChange={(e) => updateQuestion(si, qi, { type: e.target.value as IntakeQuestion["type"], choices: ["select", "multiselect"].includes(e.target.value) ? q.choices?.length ? q.choices : ["Option 1", "Option 2"] : [] })}>{fieldTypes.map((t) => <option key={t}>{t}</option>)}</select></label>
                            <label className="flex items-center gap-1 text-xs"><input type="checkbox" disabled={pending} checked={q.required ?? true} onChange={(e) => updateQuestion(si, qi, { required: e.target.checked })} />Required</label>
                            <button disabled={pending || qi === 0} type="button" className="text-xs text-orange-700 disabled:text-slate-300" onClick={() => { const sections = config.sections.map((s, i) => { if (i !== si) return s; const questions = [...s.questions]; [questions[qi - 1], questions[qi]] = [questions[qi], questions[qi - 1]]; return { ...s, questions }; }); saveDirect({ sections }); }}>Move up</button>
                            <button disabled={pending || qi === section.questions.length - 1} type="button" className="text-xs text-orange-700 disabled:text-slate-300" onClick={() => { const sections = config.sections.map((s, i) => { if (i !== si) return s; const questions = [...s.questions]; [questions[qi + 1], questions[qi]] = [questions[qi], questions[qi + 1]]; return { ...s, questions }; }); saveDirect({ sections }); }}>Move down</button>
                          </div>
                          {(q.type === "select" || q.type === "multiselect") && <ChoiceEditor key={JSON.stringify(q.choices)} choices={q.choices ?? []} disabled={pending} onSave={(choices) => updateQuestion(si, qi, { choices })} />}
                        </li>
                      ))}
                      <li>
                        <AddQuestion
                          onAdd={(text) =>
                            saveDirect({
                              sections: config.sections.map((s, i) =>
                                i === si ? { ...s, questions: [...s.questions, { id: `q_${Date.now()}`, text }] } : s,
                              ),
                            })
                          }
                        />
                      </li>
                    </ol>
                  )}
                </div>
              );
            })}
            {config.sections.length === 0 && <p className="p-8 text-center text-sm text-slate-400">No sections yet. Ask Maya to build one.</p>}
          </fieldset>
        </section>
      </div>

      <form action={deleteTemplate.bind(null, template.id)} className="flex justify-end">
        <button type="submit" className="text-sm text-slate-400 hover:text-red-600">
          Delete this intake
        </button>
      </form>
    </div>
  );
}

function EditableText({ value, label, className = "", onSave }: { value: string; label: string; className?: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            setEditing(true);
          }
        }}
        title="Click to edit"
        className={`cursor-text rounded px-1 hover:bg-slate-100 ${className}`}
      >
        {value}
      </span>
    );
  }
  return (
    <input
      autoFocus
      defaultValue={value}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEditing(false);
      }}
      onBlur={(e) => {
        setEditing(false);
        const v = e.target.value.trim();
        if (v && v !== value) onSave(v);
      }}
      className={`rounded border border-orange-300 px-1 text-sm outline-none ${className}`}
    />
  );
}

function AddQuestion({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onAdd(text.trim());
        setText("");
      }}
      className="mt-1 flex gap-2 pl-7"
    >
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a question…" aria-label="New question" className={`${inputClass} py-1.5`} />
      <button type="submit" disabled={!text.trim()} className={`${buttonClass.secondary} py-1.5`}>
        Add
      </button>
    </form>
  );
}

function ChoiceEditor({ choices, disabled, onSave }: { choices: string[]; disabled: boolean; onSave: (values: string[]) => void }) {
  const [value, setValue] = useState(choices.join(" | "));
  return <label className="mt-2 block pl-7 text-xs">Options (separate with |)<input disabled={disabled} value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => { const next = value.split("|").map((v) => v.trim()).filter(Boolean); if (JSON.stringify(next) !== JSON.stringify(choices)) onSave(next); }} className={`${inputClass} mt-1`} /></label>;
}
