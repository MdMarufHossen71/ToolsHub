/** Minimal WYSIWYG: contentEditable plus a tiny toolbar, HTML out. */
import { useRef, useState } from "react";
import { Check, Clipboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/AppSettingsContext";

export function Wysiwyg() {
  const { t } = useTranslation();
  const editorRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(() => `<p><strong>${t("tool.live.editor.sample")}</strong> — ${t("tool.live.editor.hint")}</p>`);
  const [copied, setCopied] = useState(false);

  const command = (name: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(name, false, value);
    setHtml(editorRef.current?.innerHTML ?? "");
  };

  const copyHtml = async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="live-stage live-stage-stretch">
      <div className="bench-actions" role="toolbar" aria-label={t("tool.live.format")}>
        <Button variant="outline" size="sm" onClick={() => command("bold")} aria-label={t("tool.live.bold")}>
          <strong aria-hidden="true">B</strong>
        </Button>
        <Button variant="outline" size="sm" onClick={() => command("italic")} aria-label={t("tool.live.italic")}>
          <em aria-hidden="true">I</em>
        </Button>
        <Button variant="outline" size="sm" onClick={() => command("insertUnorderedList")} aria-label={t("tool.live.list")}>
          <span aria-hidden="true">•≡</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const url = window.prompt(t("tool.live.linkUrl"));
            if (!url) return;
            // Allowlist: block `javascript:` / `data:` / other active schemes from a
            // pasted prompt value. Local-only self-XSS, but reject loudly by inserting
            // disallowed input as plain text instead of a link.
            const trimmed = url.trim();
            if (/^(https?:\/\/|mailto:)/i.test(trimmed)) command("createLink", trimmed);
            else document.execCommand("insertText", false, trimmed);
          }}
          aria-label={t("tool.live.link")}
        >
          <span aria-hidden="true">🔗</span>
        </Button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={() => setHtml(editorRef.current?.innerHTML ?? "")}
        dangerouslySetInnerHTML={{ __html: html }}
        className="wysiwyg-editor"
      />
      <div className="bench-actions">
        <Button variant="outline" size="sm" onClick={() => void copyHtml()}>
          {copied ? <Check className="mr-2 size-3.5" aria-hidden="true" /> : <Clipboard className="mr-2 size-3.5" aria-hidden="true" />}
          {t("common.copy")}
        </Button>
      </div>
      <pre className="tool-output wysiwyg-output" aria-label={t("tool.output")}>
        {html}
      </pre>
    </div>
  );
}
