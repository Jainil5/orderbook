export const THEME_COOKIE = "ob-theme";
export const THEME_STORAGE_KEY = "ob-theme";

export type Theme = "light" | "dark";

export function parseTheme(value: string | null | undefined): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}

/** Cookie wins over localStorage: it is what the server used to render, so
 *  preferring it on the client keeps SSR and client HTML in agreement. */
export function resolveInitialTheme(
  cookieValue: string | null | undefined,
  storedValue: string | null | undefined,
): Theme {
  return parseTheme(cookieValue) ?? parseTheme(storedValue) ?? "light";
}

/** Runs before hydration in the document head. localStorage can hold a theme
 *  for a session whose cookie was never written (cleared cookies), so the
 *  script reconciles in favour of localStorage and mirrors back to the cookie
 *  for later SSR reads. */
export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement;var c=document.cookie.split(";").map(function(s){return s.trim()});var m=c.find(function(s){return s.indexOf("${THEME_COOKIE}=")===0});var cookie=m?m.slice("${THEME_COOKIE}=".length+1):null;var stored=localStorage.getItem("${THEME_STORAGE_KEY}");var cookieTheme=(cookie==="light"||cookie==="dark")?cookie:null;var storedTheme=(stored==="light"||stored==="dark")?stored:null;var theme=storedTheme||cookieTheme||"light";d.setAttribute("data-theme",theme);if(storedTheme!==cookieTheme){document.cookie="${THEME_COOKIE}="+theme+";path=/;max-age=31536000;samesite=lax"}}catch(e){}})();`;
