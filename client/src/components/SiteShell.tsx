/** Cobalt Workshop design reminder: navigation resembles a responsive workbench rail—dense enough for utility, calm enough for everyday use. */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Gamepad2, Languages, Menu, Moon, Sun, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchBox } from "@/components/SearchBox";
import { InstallPrompt } from "@/components/InstallPrompt";
import { Wordmark } from "@/components/Logo";
import { focusHeroSearch } from "@/lib/searchFocus";
import { toolsSearchHref } from "@/lib/searchNav";
import { SITE_LAST_UPDATED, formatSiteDate } from "@/lib/siteUpdated";
import { useSettings } from "@/contexts/AppSettingsContext";

const navItems = [
  { href: "/tools", label: "nav.tools" as const, icon: Wrench },
  { href: "/games", label: "nav.games" as const, icon: Gamepad2 },
  { href: "/ai", label: "nav.ai" as const, icon: SparklesPlaceholder },
  { href: "/links", label: "nav.links" as const, icon: Languages },
];
function SparklesPlaceholder({ className }: { className?: string }) { return <span className={className}>✦</span>; }

/** Below this the CSS collapses the header search into the drawer (see workbench-overrides.css). */
const HEADER_SEARCH_QUERY = "(min-width: 901px)";

/** True while the browser is using a real keyboard layout for `/` rather than a key it types. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  const { language, setLanguage, theme, toggleTheme, t } = useSettings();
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const headerInput = useRef<HTMLInputElement | null>(null);
  const drawerInput = useRef<HTMLInputElement | null>(null);
  const locationRef = useRef(location);
  locationRef.current = location;
  const onSearch = (value: string) => { setLocation(toolsSearchHref(value)); setOpen(false); };
  const isActive = (href: string) => location.startsWith(href);

  // The drawer is a disclosure rather than a modal, so focus moves into it on open
  // and back to the trigger on close, but it is not trapped: the rest of the header
  // stays reachable, which is what a sighted user sees too.
  useEffect(() => { if (open) drawerInput.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); menuButton.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  // A route change closes the drawer, otherwise it stays open over the new page.
  useEffect(() => { setOpen(false); }, [location]);

  /**
   * Compact header after a short scroll. One passive listener, throttled to a frame,
   * and a hysteresis band — entering at 88px but only leaving below 40px — so a wobble
   * around the threshold cannot make the header flicker.
   */
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const y = window.scrollY || document.documentElement.scrollTop;
      setCompact((wasCompact) => (wasCompact ? y > 40 : y > 88));
    };
    const onScroll = () => { if (frame === 0) frame = window.requestAnimationFrame(read); };
    window.addEventListener("scroll", onScroll, { passive: true });
    read();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // `scroll-padding-top` has to track the compact height or the skip-link target and
  // any in-page anchor land under the sticky header. The class lives on `<html>` so the
  // stylesheet can express that in one place.
  useEffect(() => {
    document.documentElement.classList.toggle("header-compact", compact);
    return () => document.documentElement.classList.remove("header-compact");
  }, [compact]);

  /**
   * The single global shortcut: `/` focuses search unless the user is typing, and
   * `Ctrl`/`Cmd`+`K` focuses it from anywhere. On the home route the hero field is the
   * primary search; everywhere else the header field is, falling back to opening the
   * drawer when the header field is collapsed at ≤900px.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const commandK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      const slash = event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey;
      if (!commandK && !slash) return;
      // `/` is a character people type; never take it from a field. Ctrl/Cmd+K is a
      // deliberate command and works even while typing.
      if (slash && isTypingTarget(event.target)) return;
      event.preventDefault();
      if (locationRef.current === "/" && focusHeroSearch()) return;
      const headerSearchVisible = typeof window.matchMedia === "function" && window.matchMedia(HEADER_SEARCH_QUERY).matches;
      if (headerSearchVisible) {
        headerInput.current?.focus();
        return;
      }
      // Search is inside the drawer here: open it, and focus immediately when it is
      // already mounted (the open effect handles the freshly mounted case).
      setOpen(true);
      drawerInput.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return <div className="min-h-screen bg-background text-foreground">
    {/* First focusable element on the page, visible only once focused. */}
    <a href="#main-content" className="skip-link">{t("a11y.skip")}</a>
    <header className={compact ? "site-header site-header-compact" : "site-header"}>
      <div className="header-inner">
        <Link href="/" aria-label={t("a11y.home")}><Wordmark compact={compact} /></Link>
        <SearchBox id="header-search" variant="header" onSubmit={onSearch} showShortcut onInputRef={(input) => { headerInput.current = input; }} />
        <nav className="nav-links" aria-label={t("a11y.mainNav")}>{navItems.map(({ href, label }) => <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}>{t(label)}</Link>)}</nav>
        <div className="header-actions">
          <Button variant="ghost" size="icon" className="header-icon" onClick={toggleTheme} aria-label={t("theme.toggle")}>{theme === "dark" ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}</Button>
          <Button variant="ghost" size="sm" className="header-icon language-toggle" onClick={() => setLanguage(language === "bn" ? "en" : "bn")} aria-label={t("a11y.switchLanguage")} lang={language === "bn" ? "en" : "bn"}>{t("language.switch")}</Button>
          <Button ref={menuButton} variant="ghost" size="icon" className="header-icon mobile-menu-button" onClick={() => setOpen(!open)} aria-label={open ? t("a11y.closeMenu") : t("a11y.openMenu")} aria-expanded={open} aria-controls="site-drawer">{open ? <X className="size-4" aria-hidden="true" /> : <Menu className="size-4" aria-hidden="true" />}</Button>
        </div>
      </div>
      {open && <div className="mobile-drawer" id="site-drawer">
        <SearchBox id="drawer-search" variant="drawer" onSubmit={onSearch} labelKey="a11y.searchDrawer" showShortcut onInputRef={(input) => { drawerInput.current = input; }} />
        <nav aria-label={t("a11y.drawerNav")}>{navItems.map(({ href, label }) => <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}>{t(label)}</Link>)}<Link href="/settings">{t("footer.settings")}</Link></nav>
      </div>}
    </header>
    {/* A fixed overlay (see InstallPrompt and its stylesheet rule): it stays in this
        DOM position for Tab order, but it contributes no layout height, so mounting it
        cannot shift the page. Escape or the dismiss button removes it. */}
    <InstallPrompt />
    <main id="main-content">{children}</main>
    <footer className="site-footer">
      <div className="site-frame footer-grid">
        <div className="footer-brand"><Wordmark compact /><p>{t("footer.privacy")}</p><p>{t("footer.open")}</p></div>
        {/* The footer columns are top-level sections of the footer landmark, so their
            headings are h2. They were h3, which skipped a level on every page whose
            main content has no h2 of its own — an info page or a tool page goes
            straight from its h1 to the footer heading in document order. */}
        <nav className="footer-column" aria-labelledby="footer-browse"><h2 id="footer-browse">{t("footer.browse")}</h2><Link href="/tools">{t("footer.allTools")}</Link><Link href="/games">{t("footer.games")}</Link><Link href="/links">{t("footer.links")}</Link></nav>
        <nav className="footer-column" aria-labelledby="footer-settings"><h2 id="footer-settings">{t("footer.settings")}</h2><Link href="/settings">{t("footer.settings")}</Link><Link href="/privacy">{t("footer.privacyLink")}</Link><Link href="/terms">{t("footer.terms")}</Link><Link href="/cookies">{t("footer.cookies")}</Link><Link href="/how-to">{t("footer.howTo")}</Link><Link href="/changelog">{t("footer.changelog")}</Link></nav>
      </div>
      <div className="site-frame footer-bottom"><span>{t("footer.copyright", { year: new Date().getFullYear() })}</span><span>{t("footer.open")} · {t("footer.updated", { date: formatSiteDate(SITE_LAST_UPDATED, language) })}</span></div>
    </footer>
  </div>;
}
