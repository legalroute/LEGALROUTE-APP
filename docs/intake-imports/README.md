# Generate customizable intake forms

Attorneys and firm administrators can open **Connections → Upload file / Generate intake**, or **Intake Builder → Generate from Google Sheets / Excel / CSV**.

## Choose a source

- **Google Sheets:** complete the [business-account setup](../google-sheets-business-setup/README.md), connect an account and save a spreadsheet tab as a firm table. The generator uses the latest cached snapshot; refresh the table before importing recent changes. Only connected tables belonging to the signed-in firm are available.
- **Upload:** choose a UTF-8 comma-separated `.csv` or an unencrypted `.xlsx` workbook, up to 512 KB. Google credentials are not needed for uploads. Save older `.xls` files as `.xlsx` or CSV first. For a workbook, preview once to see its worksheet selector, select the desired sheet, then preview again.

The first row must contain headings. Files support at most 10,000 data rows and 100 columns; workbooks support 20 worksheets and 10 MB of declared expanded ZIP content. Formula cells are ignored, including cached results. Formulas are never evaluated. Uploaded files are parsed in memory for the request and are not persisted.

## Choose the interpretation

### Each row defines a question

Use a `question` column and optional `section`, `type`, `required` and `choices` columns (headings are case insensitive). See [questions.csv](questions.csv).

```csv
question,section,type,required,choices
What is your full name?,Contact,text,true,
What is your email address?,Contact,email,false,
How should we contact you?,Contact,select,true,Email|Phone|Text
When did the incident happen?,Incident,date,false,
```

Supported types: `text`, `textarea`, `email`, `phone`, `number`, `date`, `boolean`, `select`, `multiselect`. Missing type defaults to text; missing required defaults to false. Required accepts true/false, yes/no, or 1/0. Choice types require distinct nonempty options separated by `|`. Unknown types and invalid flags produce an error rather than silently changing meaning. Limit: 200 questions per form, 100 per section and 40 sections.

### Each column describes client data

Only headings become question labels. Email, phone and date headings get suggested types; other headings default to text. All imported fields start optional. Duplicate headings get distinct IDs. No client records or example answers are included in the form, choice options or AI prompts. For connected tables, this mode does not query data rows. Review wording and suggested types before publishing.

## Preview, customize, publish

1. Click **Preview questions** and review sections, questions, types, required flags and options.
2. Name the intake and click **Create editable draft**.
3. In Intake Builder, edit wording and section names, add/remove questions and sections, move questions up/down, choose types, toggle required, and edit options separated by `|`. Maya can also help edit the draft.
4. Click **Publish** only after review. Until then, the existing public intake continues using its published version.

Generated drafts are independent copies. Refreshing or disconnecting Google Sheets does not alter a draft or an already published intake. Generating again creates a separate draft; it does not overwrite an existing form or import client records. Existing intake sessions retain their frozen configuration.

## Model and runtime behavior

`IntakeConfig` remains JSON in the existing template draft/published configuration and session snapshot columns. Questions retain stable `id` and `text` fields and can also have `type`, `required`, and `choices`. These metadata fields are optional for compatibility with existing forms; no SQL migration is needed.

The public intake remains a **voice conversation**. Maya receives field types, options and required flags as guidance and can clarify answers or allow optional questions to be skipped. This feature does not add a conventional HTML form or strict server-side typed answer validation. Clients can still decline questions or end the conversation, including when a field is marked required; answers remain conversational text for attorney review.

Generation is deterministic and makes no AI request. Imported question text is treated as content to review. Normal builder chat and published voice intake use the firm's configured AI provider as before. Raw upload content is not added to chat history.

Backend parsing/generation lives in `backend/src/services/intake-import.ts`; firm-scoped source reads and draft creation live in `intake-import-service.ts`. Next.js Server Actions authenticate each request and delegate to these services. Preview returns only the generated configuration and worksheet names. Creating a draft validates the entire configuration again; browser-provided form data is never trusted.
