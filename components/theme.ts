export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_STORAGE_KEY = "theme";

// Runs in <head> before first paint so a forced theme never flashes the
// system one. Must stay self-contained: it is serialised into the HTML.
export const themeBootScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});document.documentElement.setAttribute("data-theme",t==="light"||t==="dark"?t:"system")}catch(e){document.documentElement.setAttribute("data-theme","system")}})()`;
