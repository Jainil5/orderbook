import { describe, expect, it } from "vitest";
import {
  parseTheme,
  resolveInitialTheme,
  THEME_COOKIE,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
} from "./theme";

describe("theme resolution", () => {
  it("parses only the two known themes", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("blue")).toBeNull();
    expect(parseTheme(undefined)).toBeNull();
    expect(parseTheme(null)).toBeNull();
    expect(parseTheme("")).toBeNull();
  });

  it("prefers the server cookie, then localStorage, then light", () => {
    expect(resolveInitialTheme("dark", "light")).toBe("dark");
    expect(resolveInitialTheme(null, "dark")).toBe("dark");
    expect(resolveInitialTheme(null, null)).toBe("light");
    expect(resolveInitialTheme("garbage", "dark")).toBe("dark");
    expect(resolveInitialTheme("light", null)).toBe("light");
  });
});

describe("theme init script", () => {
  it("reads the cookie and localStorage keys it is meant to sync", () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_COOKIE);
    expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY);
  });

  it("sets data-theme on the document element and mirrors divergent stores", () => {
    expect(THEME_INIT_SCRIPT).toContain('setAttribute("data-theme",theme)');
    expect(THEME_INIT_SCRIPT).toContain("storedTheme!==cookieTheme");
    expect(THEME_INIT_SCRIPT).toContain(
      `document.cookie="${THEME_COOKIE}="+theme+";path=/`,
    );
  });

  it("validates both stored values before applying them", () => {
    expect(THEME_INIT_SCRIPT).toContain('cookie==="light"||cookie==="dark"');
    expect(THEME_INIT_SCRIPT).toContain('stored==="light"||stored==="dark"');
  });

  it("survives a throwing storage access", () => {
    expect(THEME_INIT_SCRIPT).toContain("catch(e)");
  });
});
