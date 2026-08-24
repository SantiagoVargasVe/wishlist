const THEME_BOOTSTRAP = `(function(){try{
  var stored = localStorage.getItem('theme');
  var dark = stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}})();`;

/**
 * Sets the `.dark` class on `<html>` *before* React hydrates or anything
 * paints. Must be an unmarked, synchronous `<script>` (no type="module",
 * no async/defer) rendered inside `<head>` — anything else runs too late and
 * the page flashes light before switching to dark.
 *
 * `<html>` needs `suppressHydrationWarning` in layout.tsx: this script
 * mutates the DOM directly, so the server-rendered class list and the
 * client's actual class list legitimately differ, and that's fine — React
 * never owns this class, so there's nothing to reconcile.
 */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />;
}
