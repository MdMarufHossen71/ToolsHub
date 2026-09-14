/** Cobalt Workshop design reminder: the favorite control is a small instrument toggle — present on every surface, never louder than the tool name beside it. */
import { Star } from "lucide-react";
import { useTranslation } from "@/contexts/AppSettingsContext";
import { toggleFavorite, useFavoriteSlugs } from "@/lib/favorites";

/**
 * The star. It subscribes to the favorites store so every copy of the same tool —
 * card, compact card, tool page — flips together without a reload.
 *
 * `aria-pressed` carries the on/off state; the accessible name states the action and
 * the tool, so the two states are distinguishable to a screen reader even though the
 * icon is the only visible content. The filled/outline star is a second, visual
 * signal rather than the only one.
 */
export function FavoriteButton({ slug, name, className }: { slug: string; name: string; className: string }) {
  const { t } = useTranslation();
  const slugs = useFavoriteSlugs();
  const favorite = slugs.includes(slug);
  return (
    <button
      type="button"
      className={className}
      aria-pressed={favorite}
      aria-label={favorite ? t("favorite.remove", { name }) : t("favorite.add", { name })}
      data-favorite={favorite}
      onClick={() => toggleFavorite(slug)}
    >
      <Star className="size-4" fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}
