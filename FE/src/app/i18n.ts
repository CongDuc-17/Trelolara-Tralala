import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import vi from "./locales/vi.json";
import en from "./locales/en.json";

export const LANGUAGE_STORAGE_KEY = "trelolara-language";
export const THEME_STORAGE_KEY = "trelolara-theme";

export function readLanguage() {
  try { return localStorage.getItem(LANGUAGE_STORAGE_KEY) === "en" ? "en" : "vi"; }
  catch { return "vi"; }
}

void i18n.use(initReactI18next).init({
  resources: { vi: { translation: vi }, en: { translation: en } },
  lng: readLanguage(),
  fallbackLng: "vi",
  supportedLngs: ["vi", "en"],
  initAsync: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

function applyLanguage(language: string) {
  document.documentElement.lang = language === "en" ? "en" : "vi";
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, document.documentElement.lang); }
  catch { /* Preferences still work when browser storage is unavailable. */ }
}
i18n.on("languageChanged", applyLanguage);
applyLanguage(i18n.language);

export default i18n;
