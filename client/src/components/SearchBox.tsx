/** Cobalt Workshop design reminder: search behaves like an instrument index — type, see the exact drawer, open it without leaving the page. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Gamepad2, Search } from "lucide-react";
import { useLocation } from "wouter";
import { Kbd } from "@/components/ui/kbd";
import { useTranslation } from "@/contexts/AppSettingsContext";
import { getToolIcon } from "@/data/toolIcons";
import { gameRegistry } from "@/data/games";
import { resolveSearchEnter } from "@/lib/searchNav";
import type { TranslationKey } from "@/i18n/translations";
import type { Tool } from "@/data/tools";
import type { ToolGroup } from "@/data/tools";

type SearchEngine = (query: string, limit?: number) => Tool[];

/** One suggestion row: a tool drawer or a game cartridge. Games ride along
 * synchronously (32 tiny records) while tools keep their lazy ranked engine. */
type Suggestion =
  | { kind: "tool"; slug: string; name: string; href: string; tag: string; tagBn: string; group: ToolGroup }
  | { kind: "game"; slug: string; name: string; href: string; tag: string; tagBn: string };

function gameSuggestions(query: string, limit = 3): Suggestion[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return gameRegistry
    .filter((game) =>
      `${game.name} ${game.genre} ${game.genreBn} ${game.description.en} ${game.description.bn}`.toLowerCase().includes(needle),
    )
    .slice(0, limit)
    .map((game) => ({ kind: "game", slug: game.slug, name: game.name, href: `/games/${game.slug}`, tag: game.genre, tagBn: game.genreBn }));
}

/**
 * The ranking engine reaches the full tool registry — including the 283-tool bilingual
 * description table — so it is loaded on first keystroke instead of being dragged into
 * every route's first paint by the header. The promise is module-level so the header,
 * the drawer and the hero share one load.
 */
let enginePromise: Promise<SearchEngine> | null = null;
function loadEngine(): Promise<SearchEngine> {
  if (!enginePromise) enginePromise = import("@/lib/toolSearch").then((module) => module.searchTools);
  return enginePromise;
}

type SearchBoxProps = {
  /** Unique per instance: the same field is mounted in the header, the drawer and the hero. */
  id: string;
  /**
   * Optional controlled value. When omitted the field holds its own state, which keeps a
   * keystroke inside the field instead of re-rendering the whole route below `SiteShell`.
   */
  value?: string;
  onValueChange?: (value: string) => void;
  /** Called for Enter with no highlighted row, i.e. the existing "go to the filtered list" action. */
  onSubmit: (value: string) => void;
  variant?: "hero" | "header" | "drawer";
  labelKey?: TranslationKey;
  placeholderKey?: TranslationKey;
  /** Renders the `/ Ctrl+K` keycap. Only the visible fields need it. */
  showShortcut?: boolean;
  /** Lets the shell keep a ref to the field it has to focus for the global shortcut. */
  onInputRef?: (input: HTMLInputElement | null) => void;
};

/**
 * A hand-rolled accessible combobox. `cmdk` is in the tree but unused; this is a
 * focused 60-line version that keeps the input as the focus holder (options are never
 * tab stops) and moves the highlight with `aria-activedescendant`, which is the
 * ARIA 1.2 combobox-with-listbox pattern.
 */
export function SearchBox({
  id,
  value: valueProp,
  onValueChange,
  onSubmit,
  variant = "header",
  labelKey = "search.aria",
  placeholderKey = "search.placeholder",
  showShortcut = false,
  onInputRef,
}: SearchBoxProps) {
  const { t, language } = useTranslation();
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLFormElement>(null);
  const [uncontrolledValue, setUncontrolledValue] = useState("");
  const value = valueProp ?? uncontrolledValue;
  const setValue = (next: string) => {
    if (valueProp === undefined) setUncontrolledValue(next);
    onValueChange?.(next);
  };
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [engine, setEngine] = useState<SearchEngine | null>(null);

  // Load the ranking engine the first time there is something to match. The effect
  // re-runs on every value change until it resolves, so a query typed while the chunk
  // is in flight is still ranked the moment it arrives.
  useEffect(() => {
    if (engine || !value.trim()) return;
    let active = true;
    loadEngine().then((search) => { if (active) setEngine(() => search); });
    return () => { active = false; };
  }, [value, engine]);

  const suggestions: Suggestion[] = useMemo(
    () => [
      ...(engine ? engine(value).map((tool): Suggestion => ({ kind: "tool", slug: tool.slug, name: tool.name, href: `/tools/${tool.slug}`, tag: tool.category, tagBn: tool.categoryBn, group: tool.group })) : []),
      ...gameSuggestions(value),
    ],
    [engine, value],
  );
  const listId = `${id}-suggestions`;
  const optionId = (index: number) => `${id}-option-${index}`;
  const panelOpen = open && suggestions.length > 0;
  // Kept out of the JSX so the class audit, which reads names out of `className`
  // expressions, does not mistake the variant string "hero" for a class name.
  const rootClass = variant === "hero" ? "search-combobox" : "header-search search-combobox";

  // The registration callback is read through a ref so a parent-defined arrow does not
  // make this effect re-run on every render, which would detach and reattach the same
  // input while the user is typing.
  const registerRef = useRef(onInputRef);
  registerRef.current = onInputRef;
  useEffect(() => {
    registerRef.current?.(inputRef.current);
    return () => registerRef.current?.(null);
  }, []);

  // A new query always starts with nothing highlighted, and the panel follows whether
  // there is something to say.
  useEffect(() => {
    setHighlight(-1);
    setOpen(value.trim().length > 0);
  }, [value]);

  useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [panelOpen]);

  // The panel is absolutely positioned, so opening it never moves the page; blurring
  // the field before navigating avoids leaving focus inside a menu that is unmounting.
  const openHref = (href: string) => {
    setOpen(false);
    setHighlight(-1);
    inputRef.current?.blur();
    navigate(href);
  };

  /**
   * The one "go to the filtered directory" action, shared by the form's submit and by
   * the explicit Enter handler below, so the two can never describe different behaviour.
   * The parent owns the destination; this only guards the empty case and closes the panel.
   */
  const submitSearch = () => {
    const query = value.trim();
    if (!query) return;
    onSubmit(query);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setHighlight((current) =>
        event.key === "ArrowDown"
          ? (current + 1) % suggestions.length
          : current <= 0
            ? suggestions.length - 1
            : current - 1,
      );
      return;
    }
    if (event.key === "Enter") {
      // A stale highlight past a shrunk suggestion list falls back to submit
      // instead of throwing on the missing row.
      const highlighted = panelOpen && highlight >= 0 ? (suggestions[highlight] ?? null) : null;
      if (highlighted?.kind === "game") {
        // Games have no filtered directory of their own: open the cartridge.
        event.preventDefault();
        openHref(highlighted.href);
        return;
      }
      const action = resolveSearchEnter(value, highlighted?.slug ?? null);
      if (action.type === "open-tool") {
        // Stop the key from also submitting the form: two navigations would race.
        event.preventDefault();
        openHref(`/tools/${action.slug}`);
      } else if (action.type === "submit") {
        // The field has no submit button, so Enter is not reliably turned into a form
        // submission by the browser (and that implicit path is what let the hero drift
        // from the header). Submit explicitly, in this one shared place, for every
        // variant: hero, header and drawer.
        event.preventDefault();
        submitSearch();
      }
      return;
    }
    if (event.key === "Escape") {
      if (panelOpen) {
        event.preventDefault();
        // Keep Escape inside the field: otherwise the drawer's own Escape handler would
        // close the whole menu when the user only meant to dismiss the suggestions.
        event.stopPropagation();
        setOpen(false);
        setHighlight(-1);
        inputRef.current?.focus();
      }
      return;
    }
    // Tab is left alone; closing here just stops the panel hanging over the next field.
    if (event.key === "Tab") setOpen(false);
  };

  return (
    <form
      ref={rootRef}
      role="search"
      aria-label={variant === "hero" ? t("search.heroLabel") : t("search.aria")}
      className={rootClass}
      data-variant={variant}
      onSubmit={(event) => {
        event.preventDefault();
        submitSearch();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <Search className="size-4" aria-hidden="true" />
      <label className="sr-only" htmlFor={id}>
        {t(labelKey)}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (value.trim()) setOpen(true);
        }}
        placeholder={t(placeholderKey)}
        autoComplete="off"
        spellCheck={false}
        aria-expanded={panelOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={panelOpen && highlight >= 0 ? optionId(highlight) : undefined}
      />
      {showShortcut && (
        <span className="search-hint" aria-hidden="true" title={t("search.shortcut")}>
          <Kbd className="search-kbd">/</Kbd>
        </span>
      )}
      {panelOpen && (
        <ul id={listId} role="listbox" aria-label={t("search.suggestionsLabel")} className="search-suggestions">
          {suggestions.map((item, index) => {
            const SuggestionIcon = item.kind === "game" ? Gamepad2 : getToolIcon(item.group);
            return (
              <li
                key={`${item.kind}-${item.slug}`}
                id={optionId(index)}
                role="option"
                aria-selected={index === highlight}
                className="search-suggestion"
                data-active={index === highlight}
                // Pointer-down is prevented so the field never blurs before the click
                // lands; the click then navigates normally.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => openHref(item.href)}
              >
                <span className="search-suggestion-icon" aria-hidden="true">
                  <SuggestionIcon className="size-4" />
                </span>
                <span className="search-suggestion-name">{item.name}</span>
                <span className="search-suggestion-tag">{language === "bn" ? item.tagBn : item.tag}</span>
              </li>
            );
          })}
        </ul>
      )}
      {/* Polite live region: the count is available without moving focus or opening the
          panel. While the engine chunk is still loading the region stays silent rather
          than announcing a false "no matches". */}
      <p className="sr-only" role="status" aria-live="polite">
        {value.trim() ? (suggestions.length ? t("search.suggestions", { count: suggestions.length }) : engine ? t("search.noSuggestions") : "") : ""}
      </p>
    </form>
  );
}
