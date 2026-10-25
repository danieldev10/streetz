export type ThemePreference = "light" | "dark" | "system";
export const THEME_STORAGE_KEY = "ccl.theme.v1";
const THEME_EVENT = "ccl:theme-change";

export function parseThemePreference(value: unknown): ThemePreference {
  return value === "dark" || value === "system" ? value : "light";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean) {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

// Runs synchronously in <head>, before the first paint and before React loads.
// Only our three known values can reach the DOM. Storage can be unavailable in
// private/embedded browsers; switching still works for the current page there.
export const themeBootstrapScript = `(function(){var p="light";try{var v=localStorage.getItem("${THEME_STORAGE_KEY}");if(v==="dark"||v==="system")p=v}catch(e){}var d=p==="dark";try{if(p==="system")d=window.matchMedia("(prefers-color-scheme: dark)").matches}catch(e){}document.documentElement.dataset.theme=d?"dark":"light";document.documentElement.dataset.themePreference=p})()`;

export function getThemePreference(): ThemePreference {
  return parseThemePreference(document.documentElement.dataset.themePreference);
}

function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = resolveTheme(preference, window.matchMedia("(prefers-color-scheme: dark)").matches);
}

export function setThemePreference(preference: ThemePreference) {
  applyTheme(preference);
  try { window.localStorage.setItem(THEME_STORAGE_KEY, preference); } catch { /* Keep the in-page choice. */ }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function subscribeTheme(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (getThemePreference() === "system") applyTheme("system");
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    applyTheme(parseThemePreference(event.key === null ? null : event.newValue));
    onChange();
  };
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", onSystemChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", onSystemChange);
  };
}
