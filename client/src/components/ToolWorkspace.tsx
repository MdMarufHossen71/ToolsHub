/** Cobalt Workshop design reminder: the workbench presents input, output and actions as a fast visual loop; every result is local and inspectable. */
import { useEffect, useRef, useState } from "react";
import { Check, Clipboard, Download, FileUp, History, Play, RotateCcw, ShieldCheck, Trash2, TriangleAlert, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/FavoriteButton";
import { type Tool } from "@/data/tools";
import { useToolInputMemory } from "@/hooks/useToolInputMemory";
import { isToolImplemented, runHashFile, runTool, toolPlaceholder, type ToolResult } from "@/lib/toolOperations";
import { defaultFieldValues, getToolSchema, type Field } from "@/lib/toolSchemas";
import { resolveInputMode } from "@/lib/toolInputMode";
import { MODE_TOOL_SLUGS } from "@/lib/toolGuide";
import { getLiveTool } from "@/components/tools/live";
import { isSensitiveTool } from "@/lib/sensitiveTools";
import { useTranslation } from "@/contexts/AppSettingsContext";
import type { TranslationKey } from "@/i18n/translations";
import { Input } from "@/components/ui/input";

/** Only the modes that make sense for each tool — never the full generic list. */
const MODES_FOR_SLUG: Record<string, string[]> = {
  "reverse-text": ["default", "words", "lines"],
  "sort-list": ["default", "desc"],
  "base64-text": ["default", "decode"],
  "url-encode-decode": ["default", "decode"],
  "html-entities": ["default", "unescape"],
  "yaml-json-toml-xml-converter": ["default", "yaml", "xml"],
  "random-number-generator": ["default", "bulk"],
  "uuid-generator": ["default", "bulk"],
};

/** Mode values are stable identifiers; their labels come from the dictionary. */
const MODE_OPTIONS: Array<{ value: string; key: TranslationKey }> = [
  { value: "default", key: "tool.mode.default" },
  { value: "decode", key: "tool.mode.decode" },
  { value: "words", key: "tool.mode.words" },
  { value: "lines", key: "tool.mode.lines" },
  { value: "desc", key: "tool.mode.desc" },
  { value: "bulk", key: "tool.mode.bulk" },
  { value: "yaml", key: "tool.mode.yaml" },
  { value: "xml", key: "tool.mode.xml" },
  { value: "unescape", key: "tool.mode.unescape" },
];

/** One named form control. Labels are bilingual pairs from the schema. */
function FieldInput({
  field,
  value,
  language,
  dateHint,
  onChange,
}: {
  field: Field;
  value: string;
  language: "en" | "bn";
  dateHint: string;
  onChange: (value: string) => void;
}) {
  const label = field.label[language] || field.label.en;
  if (field.type === "select") {
    return (
      <label className="tool-field">
        <span>{label}</span>
        <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
          {(field.options ?? []).map((item) => (
            <option key={item.value} value={item.value}>
              {item.label[language] || item.label.en}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.type === "checkbox") {
    return (
      <label className="tool-field tool-field-check">
        <input type="checkbox" checked={value === "on" || value === "true"} onChange={(event) => onChange(event.target.checked ? "on" : "")} />
        <span>{label}</span>
      </label>
    );
  }
  if (field.type === "textarea") {
    return (
      <label className="tool-field tool-field-wide">
        <span>{label}</span>
        <textarea value={value} onChange={(event) => onChange(event.target.value)} className="tool-textarea" spellCheck={false} placeholder={field.placeholder} aria-label={label} />
      </label>
    );
  }
  if (field.type === "color") {
    const resolved = /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : "#3264FF";
    return (
      <label className="tool-field">
        <span>{label}</span>
        <input type="color" value={resolved} onChange={(event) => onChange(event.target.value)} aria-label={label} />
        {/* Language-neutral hex readout: screen-reader and keyboard users get the
            exact value the swatch resolves to, including the fallback. */}
        <span className="form-hint" aria-hidden="true">{resolved}</span>
      </label>
    );
  }
  if (field.type === "date") {
    return (
      <label className="tool-field">
        <span>{label}</span>
        <Input
          type="date"
          value={value}
          min={field.min}
          max={field.max}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
        />
        <span className="form-hint" aria-hidden="true">{dateHint}</span>
      </label>
    );
  }
  if (field.type === "number" && (field.min !== undefined || field.max !== undefined)) {
    return (
      <label className="tool-field">
        <span>{label}</span>
        <Input
          type="number"
          value={value}
          min={field.min}
          max={field.max}
          step={field.step}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
        />
        <span className="form-hint" aria-hidden="true">{`${field.min ?? "…"} – ${field.max ?? "…"}`}</span>
      </label>
    );
  }
  return (
    <label className="tool-field">
      <span>{label}</span>
      <Input
        type={field.type}
        value={value}
        min={field.min}
        max={field.max}
        step={field.step}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      />
    </label>
  );
}

export function ToolWorkspace({ tool }: { tool: Tool }) {
  const { t, language } = useTranslation();
  const placeholder = toolPlaceholder(tool.slug);
  const memory = useToolInputMemory(tool.slug, placeholder);
  const [option, setOption] = useState("default");
  const schema = getToolSchema(tool.slug);
  // One predicate decides the input UI; the "How to use" guide reads the same one.
  const inputMode = resolveInputMode(tool.slug, schema);
  const isFileHash = inputMode === "file-hash";
  const formMode = inputMode === "form";
  // Keyed by slug at the call site, so defaults are fresh per tool.
  const [fields, setFields] = useState<Record<string, string>>(() => defaultFieldValues(tool.slug));
  const [output, setOutput] = useState<ToolResult>(() => ({ text: t("tool.result.needsInput") }));
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // `busy` flips for a microtask on instant tools; showing a spinner for that long is
  // a flash, not feedback. The overlay is only mounted once the work has actually
  // taken a moment, and it is announced then too so a screen reader is not told
  // "loading" on every keystroke.
  const [slowBusy, setSlowBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Generic multi-file picker for schema tools (ZIP, PDF, batch…).
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);
  const pickerRef = useRef<HTMLInputElement>(null);
  // Monotonic run id: an older async result must never overwrite a newer one when
  // the user types A → AB → ABC while a heavy parser chunk is still downloading,
  // or when a manual Run overlaps the auto-run effect.
  const runIdRef = useRef(0);

  const sensitive = isSensitiveTool(tool.slug);
  const built = isToolImplemented(tool.slug);
  const description = tool.description[language] || tool.description.en;

  // One async path for every tool. `runTool` resolves immediately for light
  // tools and downloads a parser chunk first for the heavy ones (SQL, YAML,
  // Markdown…); the version guard keeps fast typing (and manual Run clicks)
  // from showing stale results either way. Form tools pass their named fields along.
  const runNow = () => {
    const id = runIdRef.current + 1;
    runIdRef.current = id;
    setBusy(true);
    runTool(tool.slug, formMode ? "" : memory.input, formMode ? "default" : option, t, { fields, files: pickedFiles }).then((result) => {
      if (runIdRef.current !== id) return;
      setOutput(result);
      setBusy(false);
    });
  };

  useEffect(() => {
    if (isFileHash) return;
    let cancelled = false;
    const id = runIdRef.current + 1;
    runIdRef.current = id;
    setBusy(true);
    runTool(tool.slug, formMode ? "" : memory.input, formMode ? "default" : option, t, { fields: { ...fields }, files: pickedFiles }).then((result) => {
      if (cancelled || runIdRef.current !== id) return;
      setOutput(result);
      setBusy(false);
    });
    return () => {
      cancelled = true;
    };
    // `fields` is compared by identity; every keystroke replaces it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memory.input, option, tool.slug, t, isFileHash, formMode, fields, pickedFiles]);

  // Real file hashing: the file is read only on this device via `arrayBuffer`,
  // never uploaded. Rejects oversize picks before reading where possible.
  useEffect(() => {
    if (!isFileHash) return;
    if (!file) {
      setOutput({ text: t("tool.file.noFile"), label: t("tool.file.hashNote") });
      return;
    }
    let cancelled = false;
    const id = runIdRef.current + 1;
    runIdRef.current = id;
    setBusy(true);
    runHashFile(file, t).then((result) => {
      if (cancelled || runIdRef.current !== id) return;
      setOutput(result);
      setBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [file, isFileHash, t]);

  const pickFile = (next: File | undefined) => {
    if (!next) return;
    setFile(next);
    setNotice("");
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Clear a transient confirmation without leaving a timer behind on unmount.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  // Delay the busy overlay so instant results never flash it.
  useEffect(() => {
    if (!busy) {
      setSlowBusy(false);
      return;
    }
    const timer = setTimeout(() => setSlowBusy(true), 180);
    return () => clearTimeout(timer);
  }, [busy]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(output.text);
      setCopied(true);
      setNotice(t("tool.copied"));
    } catch {
      // Blocked clipboard permission or a non-secure context: say so instead of failing silently.
      setNotice(t("tool.copyFailed"));
    }
  };

  const download = () => {
    const extension = output.html ? "html" : "txt";
    const file = new Blob([output.text], { type: output.html ? "text/html" : "text/plain" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${tool.slug}-result.${extension}`;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Revoked on the next task: revoking synchronously can cancel the download.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice(t("tool.downloaded"));
  };

  const header = (
    <div className="workbench-header">
      <div>
        <p className="eyebrow">{language === "bn" ? tool.categoryBn : tool.category}</p>
        <h1 id="workbench-title">{tool.name}</h1>
        <p>{description}</p>
      </div>
      <div className="workbench-badges">
        {built ? (
          <div className="privacy-chip">
            <ShieldCheck className="size-4" aria-hidden="true" />
            {t("tool.browserOnly")}
          </div>
        ) : (
          <div className="privacy-chip privacy-chip-muted">
            <Wrench className="size-4" aria-hidden="true" />
            {t("tool.unavailable.badge")}
          </div>
        )}
        <FavoriteButton slug={tool.slug} name={tool.name} className="workbench-favorite" />
      </div>
    </div>
  );

  // A listed-but-unbuilt tool used to echo the input back, which looked like a real
  // result. Say plainly that it does not exist yet.
  if (!built) {
    return (
      <section className="workbench" aria-labelledby="workbench-title">
        {header}
        <div className="bench-panel bench-unavailable" role="note">
          <h2>{t("tool.unavailable.title")}</h2>
          <p>{t("tool.unavailable.copy")}</p>
        </div>
      </section>
    );
  }

  // Live tools own their UI (timers, canvas, recorders) instead of the
  // input/output bench. They still sit under the same header and privacy chip.
  const LiveTool = getLiveTool(tool.slug);
  if (LiveTool) {
    return (
      <section className="workbench" aria-labelledby="workbench-title">
        {header}
        <div className="bench-grid bench-grid-single">
          <div className="bench-panel">
            <LiveTool />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="workbench" aria-labelledby="workbench-title">
      {header}
      {memory.restoreAvailable && (
        <button type="button" className="restore-banner" onClick={memory.restore}>
          <History className="size-4" aria-hidden="true" />
          {t("memory.restore")}
        </button>
      )}
      <div className="bench-grid">
        <div className="bench-panel">
          <div className="bench-label">
            <span id="tool-input-label">{t("tool.input")}</span>
            {MODE_TOOL_SLUGS.has(tool.slug) && (
              <select value={option} onChange={(event) => setOption(event.target.value)} aria-label={t("tool.mode.label")}>
                {MODE_OPTIONS.filter((item) => (MODES_FOR_SLUG[tool.slug] ?? [item.value]).includes(item.value)).map((item) => (
                  <option key={item.value} value={item.value}>
                    {t(item.key)}
                  </option>
                ))}
              </select>
            )}
          </div>
          {isFileHash ? (
            <>
              <p className="tool-note">{t("tool.file.hashNote")}</p>
              <div className="bench-actions">
                <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                  <FileUp className="mr-2 size-3.5" aria-hidden="true" />
                  {t("tool.file.choose")}
                </Button>
                {file && (
                  <Button variant="ghost" size="sm" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}>
                    <X className="mr-2 size-3.5" aria-hidden="true" />
                    {t("tool.file.cancel")}
                  </Button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                className="sr-only"
                aria-label={t("tool.file.choose")}
                onChange={(event) => {
                  pickFile(event.target.files?.[0]);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              />
              {file ? (
                <p className="tool-note" role="status">
                  {t("tool.file.selected", { name: file.name, size: formatSize(file.size) })}
                  {busy ? ` — ${t("common.loading")}` : ""}
                </p>
              ) : (
                <p className="tool-note" role="status">{t("tool.file.noFile")}</p>
              )}
            </>
          ) : formMode && schema ? (
            <>
              <div className="tool-form">
                {schema.fields.map((item) => (
                  <FieldInput
                    key={item.key}
                    field={item}
                    value={fields[item.key] ?? ""}
                    language={language}
                    dateHint={t("tool.field.dateHint")}
                    onChange={(value) => setFields((current) => ({ ...current, [item.key]: value }))}
                  />
                ))}
              </div>
              {schema.accept && (
                <>
                  <div className="bench-actions">
                    <Button size="sm" variant="outline" onClick={() => pickerRef.current?.click()} disabled={busy}>
                      {t("tool.file.choose")} ({pickedFiles.length})
                    </Button>
                    {pickedFiles.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => { setPickedFiles([]); if (pickerRef.current) pickerRef.current.value = ""; }}>
                        {t("common.clear")}
                      </Button>
                    )}
                  </div>
                  <input
                    ref={pickerRef}
                    type="file"
                    accept={schema.accept}
                    multiple={schema.multiple ?? false}
                    className="sr-only"
                    aria-label={t("tool.file.choose")}
                    onChange={(event) => {
                      const list = event.target.files ? Array.from(event.target.files) : [];
                      if (pickerRef.current) pickerRef.current.value = "";
                      if (list.length > 0) {
                        setPickedFiles(schema.multiple ? [...pickedFiles, ...list] : list.slice(0, 1));
                        setNotice("");
                      }
                    }}
                  />
                  {pickedFiles.length > 0 && (
                    <ul className="tool-file-list">
                      {pickedFiles.map((item) => (
                        <li key={`${item.name}-${item.size}`}>
                          {item.name} ({formatSize(item.size)})
                          <button
                            type="button"
                            className="tool-file-remove"
                            aria-label={`${t("common.clear")}: ${item.name}`}
                            onClick={() => setPickedFiles((current) => current.filter((other) => other !== item))}
                          >
                            <X className="size-3.5" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              <div className="bench-actions">
                <Button size="sm" disabled={busy} onClick={runNow}>
                  <Play className="mr-2 size-3.5" aria-hidden="true" />
                  {busy ? t("common.loading") : t("tool.run")}
                </Button>
                {schema.example && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (schema.example?.fields) setFields((current) => ({ ...current, ...schema.example?.fields }));
                      if (schema.example?.text !== undefined) memory.setInput(schema.example.text);
                    }}
                  >
                    {t("common.example")}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setFields(defaultFieldValues(tool.slug))}>
                  <RotateCcw className="mr-2 size-3.5" aria-hidden="true" />
                  {t("common.reset")}
                </Button>
              </div>
            </>
          ) : (
            <>
              <textarea
                value={memory.input}
                onChange={(event) => memory.setInput(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                    event.preventDefault();
                    runNow();
                  }
                }}
                className="tool-textarea"
                spellCheck={false}
                placeholder={placeholder}
                aria-label={t("tool.inputLabel", { name: tool.name })}
              />
              <p className="tool-note" aria-live="off">
                {t("tool.stats", {
                  words: (memory.input.match(/[A-Za-z0-9ঀ-৿']+/g) ?? []).length,
                  chars: memory.input.length,
                })}
              </p>
              <div className="bench-actions">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={runNow}
                >
                  <Play className="mr-2 size-3.5" aria-hidden="true" />
                  {busy ? t("common.loading") : t("tool.run")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => memory.setInput("")}>
                  <RotateCcw className="mr-2 size-3.5" aria-hidden="true" />
                  {t("common.clear")}
                </Button>
                {memory.canRemember && memory.restoreAvailable && (
                  <Button variant="ghost" size="sm" onClick={memory.forget}>
                    <Trash2 className="mr-2 size-3.5" aria-hidden="true" />
                    {t("memory.forget")}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
        <div className="bench-panel bench-result">
          <div className="bench-label">
            <span>{output.label ?? t("tool.output")}</span>
          </div>
          {output.html ? (
            <div className="tool-html-preview" dangerouslySetInnerHTML={{ __html: output.html }} />
          ) : (
            // `role="status"` so a recomputed result is announced, not just repainted.
            // An untouched prompt renders muted so empty is never mistaken for output.
            <pre
              className={output.error ? "tool-output tool-output-error" : "tool-output"}
              data-empty={!formMode && !isFileHash && memory.input.trim() === ""}
              role="status"
              aria-live="polite"
            >
              {output.text}
            </pre>
          )}
          {output.image && (
            <figure className="tool-image-figure">
              <img src={output.image} alt="" className="tool-image-preview" />
              <figcaption>{output.label ?? t("tool.output")}</figcaption>
            </figure>
          )}
          {output.table && output.table.rows.length > 0 && (
            <div className="tool-table-wrap">
              <table className="tool-table">
                <caption className="sr-only">{output.label ?? t("tool.output")}</caption>
                <thead>
                  <tr>
                    {output.table.head.map((cell, j) => (
                      <th key={`${j}-${cell}`} scope="col">
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {output.table.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={`${i}-${j}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {output.artifacts && output.artifacts.length > 0 && (
            <div className="bench-actions">
              {output.artifacts.map((item) => (
                <Button
                  key={item.name}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const anchor = document.createElement("a");
                    anchor.href = item.dataUrl;
                    anchor.download = item.name;
                    anchor.rel = "noopener";
                    anchor.style.display = "none";
                    document.body.appendChild(anchor);
                    anchor.click();
                    anchor.remove();
                    setNotice(t("tool.downloaded"));
                  }}
                >
                  <Download className="mr-2 size-3.5" aria-hidden="true" />
                  {item.name}
                </Button>
              ))}
            </div>
          )}
          {slowBusy && (
            // Overlay, not a swap: the panel keeps its height while a parser chunk
            // downloads, so the layout never jumps. `role="status"` announces the wait
            // once; the moving parts are hidden from assistive tech.
            <div className="bench-busy" role="status" aria-live="polite">
              <span className="sr-only">{t("common.loading")}</span>
              <span className="bench-busy-spinner" aria-hidden="true" />
              <span className="bench-busy-line" aria-hidden="true" />
              <span className="bench-busy-line bench-busy-line-short" aria-hidden="true" />
            </div>
          )}
          <div className="bench-actions">
            <Button variant="outline" size="sm" onClick={copy}>
              {copied ? <Check className="mr-2 size-3.5" aria-hidden="true" /> : <Clipboard className="mr-2 size-3.5" aria-hidden="true" />}
              {t("common.copy")}
            </Button>
            {/* When per-file artifact buttons exist above they are the correct
                downloads (PDF/ZIP/image bytes). A generic .txt of the summary
                text would be mistaken for the file itself, so hide it there. */}
            {!output.artifacts || output.artifacts.length === 0 ? (
              <Button variant="outline" size="sm" onClick={download}>
                <Download className="mr-2 size-3.5" aria-hidden="true" />
                {t("common.download")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      {/* Copy and download confirm visibly as well as to assistive tech. */}
      {notice ? (
        <p className="tool-note" role="status" aria-live="polite">
          <Check className="size-4" aria-hidden="true" />
          {notice}
        </p>
      ) : null}
      {sensitive ? (
        <p className="tool-note">
          <ShieldCheck className="size-4" aria-hidden="true" />
          {t("memory.private")}
        </p>
      ) : memory.storageWarning ? (
        <p className="tool-note tool-note-warning">
          <TriangleAlert className="size-4" aria-hidden="true" />
          {t("memory.full")}
        </p>
      ) : memory.tooLarge ? (
        <p className="tool-note tool-note-warning">
          <TriangleAlert className="size-4" aria-hidden="true" />
          {t("memory.tooLarge")}
        </p>
      ) : (
        <p className="tool-note">
          <ShieldCheck className="size-4" aria-hidden="true" />
          {t("tool.privacy")}
        </p>
      )}
    </section>
  );
}
