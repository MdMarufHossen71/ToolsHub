import { Suspense, lazy } from "react";
import { Route, Router, Switch, useLocation } from "wouter";
import { useHashPath, useHashSearch } from "@/lib/hashLocation";
import { SiteShell } from "@/components/SiteShell";
import { AppSettingsProvider, useTranslation } from "@/contexts/AppSettingsContext";
import ErrorBoundary from "./components/ErrorBoundary";

// Route-level splitting: the home shell stays light — tool parsers and game
// engines load only when their route is visited. Games themselves split
// further via `games/registry.ts` dynamic imports.
const Home = lazy(() => import("./pages/Home"));
const Tools = lazy(() => import("./pages/Tools"));
const ToolPage = lazy(() => import("./pages/ToolPage"));
const Games = lazy(() => import("./pages/Games"));
const GamePage = lazy(() => import("./pages/GamePage"));
const Links = lazy(() => import("./pages/Links"));
const AI = lazy(() => import("./pages/AI"));
const Settings = lazy(() => import("./pages/Settings"));
const Changelog = lazy(() => import("./pages/Changelog"));
const InfoPage = lazy(() => import("./pages/InfoPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

/**
 * Route-level fallback.
 *
 * This is not a decorative spinner: its height is load-bearing. The previous
 * one-line paragraph let the footer sit ~874px down, so swapping in a several-screen
 * page dragged the footer while it was still visible — the home page measured a CLS
 * of 0.126. Reserving the full header-to-fold height (`.route-skeleton`), plus a few
 * neutral blocks in the Cobalt Workshop tokens, keeps the footer off-screen until the
 * real page is in place. It is announced politely and carries no animation, so the
 * global `prefers-reduced-motion` rule has nothing to suppress.
 */
function RouteFallback() {
  const { t } = useTranslation();
  return (
    <div className="site-frame page-space route-skeleton" role="status" aria-live="polite" aria-label={t("common.loading")}>
      <span className="sr-only">{t("common.loading")}</span>
      <div className="route-skeleton-bar" aria-hidden="true" />
      <div className="route-skeleton-bar route-skeleton-title" aria-hidden="true" />
      <div className="route-skeleton-bar route-skeleton-copy" aria-hidden="true" />
      <div className="route-skeleton-grid" aria-hidden="true">
        <div className="route-skeleton-block" />
        <div className="route-skeleton-block" />
        <div className="route-skeleton-block" />
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/tools" component={Tools} />
      <Route path="/tools/:slug" component={ToolPage} />
      <Route path="/games" component={Games} />
      <Route path="/games/:slug" component={GamePage} />
      <Route path="/links" component={Links} />
      <Route path="/ai" component={AI} />
      <Route path="/settings" component={Settings} />
      <Route path="/changelog" component={Changelog} />
      <Route path="/about" component={InfoPage} />
      <Route path="/how-to" component={InfoPage} />
      <Route path="/privacy" component={InfoPage} />
      <Route path="/404">{() => <NotFound />}</Route>
      {/* Final fallback route */}
      <Route>{() => <NotFound />}</Route>
    </Switch>
  );
}

/**
 * A failure inside one page must not take down the header, navigation and footer.
 * Keying on the location also clears the error when the user navigates away, so a
 * broken route is recoverable without a full reload.
 */
function RoutedContent() {
  const [location] = useLocation();
  return (
    <ErrorBoundary key={location} variant="route">
      <Suspense fallback={<RouteFallback />}>
        <AppRoutes />
      </Suspense>
    </ErrorBoundary>
  );
}

function App() {
  return (
    // Hash routing: on a static host (GitHub Pages included) there is no rewrite
    // rule, so a path-based deep link or refresh returns the host's own 404.
    // Hash locations survive both, which is also what the README documents.
    <ErrorBoundary>
      {/* eslint-disable-next-line react-compiler/react-compiler -- wouter's Router takes the location hooks themselves as values; calling them here would break routing, so the compiler must leave this element alone. */}
      <Router hook={useHashPath} searchHook={useHashSearch}>
        {/* The sonner <Toaster /> and the Radix <TooltipProvider /> used to wrap the app,
            but nothing ever called `toast()` or rendered a tooltip — the two of them
            pulled sonner and @radix-ui/react-tooltip into the entry chunk for no
            behaviour. Removed; their primitives stay in components/ui if needed later. */}
        <AppSettingsProvider>
          <SiteShell>
            <RoutedContent />
          </SiteShell>
        </AppSettingsProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
