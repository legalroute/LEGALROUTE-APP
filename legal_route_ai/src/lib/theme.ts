// Color themes for the attorney app, sign-in and the firm's intake link (see globals.css).
export const THEMES = [
  { id: "original", label: "Original", description: "Warm peach background with orange accents." },
  { id: "mono", label: "Black & white", description: "White background, black accents, gray tones." },
  { id: "dark", label: "Dark", description: "Black background with white text." },
] as const;

export type Theme = (typeof THEMES)[number]["id"];
export const DEFAULT_THEME: Theme = "dark";

// Sign-in pages have no firm yet, so they use the theme last saved in this browser.
export const THEME_COOKIE = "lr_theme";

export function isTheme(value: unknown): value is Theme {
  return THEMES.some((t) => t.id === value);
}

export function themeClass(value: unknown) {
  return `theme-${isTheme(value) ? value : DEFAULT_THEME}`;
}
