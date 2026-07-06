import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type LanguageCode = "en" | "es";

const LANGUAGE_STORAGE_KEY = "prospera_language";

const en = {
  "common.back": "Back",
  "common.home": "Home",
  "common.saving": "Saving...",
  "common.saveChanges": "Save Changes",
  "nav.account": "Account",
  "nav.logIn": "Log in",
  "language.choose": "Choose language",
  "language.label": "Language",
  "language.english": "English",
  "language.spanish": "Spanish",
  "language.englishNative": "English",
  "language.spanishNative": "Español",
  "auth.signInRequired": "Please sign in to continue",
  "auth.signIn": "Sign In",
  "notFound.message": "Page not found",
  "notFound.home": "Return Home",
  "cleaning.badge": "Convenience Subscriptions to Próspera",
  "cleaning.choosePlan": "Choose Your Plan",
  "cleaning.subtitle": "Your all-in-one platform for subscriptions and services in the Próspera ecosystem.",
  "cleaning.availability": "Mon-Sat, 8AM-4PM",
  "cleaning.frequency": "1 cleaning / week",
  "cleaning.cancelAnytime": "Cancel anytime",
  "cleaning.professionalPerWeek": "1 professional cleaning per week",
  "cleaning.pickSlot": "Pick your own time slot",
  "cleaning.hours": "Mon-Sat, 8 AM - 4 PM",
  "cleaning.choose": "Choose",
  "cleaning.noPackagesTitle": "No cleaning packages available",
  "cleaning.noPackagesDescription": "Check back soon for new cleaning service options.",
  "cleaning.viewBookings": "View My Bookings",
  "profile.pageTitle": "Profile",
  "profile.user": "User",
  "profile.logOut": "Log Out",
  "profile.bookings": "My Subs",
  "profile.platformAdmin": "Platform Admin",
  "profile.platformAdminDescription": "Manage settings, analytics, and cleaning operations.",
  "profile.personalInformation": "Personal Information",
  "profile.personalDescription": "Keep your profile details ready for support.",
  "profile.name": "Name",
  "profile.phone": "Phone Number",
  "profile.telegram": "Telegram Username",
  "profile.updated": "Profile updated successfully!",
  "profile.updateFailed": "Failed to update profile",
  "profile.openProfile": "Open profile",
  "profile.viewAsUser": "View as user",
} as const;

export type TranslationKey = keyof typeof en;

const es: Record<TranslationKey, string> = {
  "common.back": "Volver",
  "common.home": "Inicio",
  "common.saving": "Guardando...",
  "common.saveChanges": "Guardar cambios",
  "nav.account": "Cuenta",
  "nav.logIn": "Iniciar sesión",
  "language.choose": "Elegir idioma",
  "language.label": "Idioma",
  "language.english": "Inglés",
  "language.spanish": "Español",
  "language.englishNative": "English",
  "language.spanishNative": "Español",
  "auth.signInRequired": "Inicia sesión para continuar",
  "auth.signIn": "Iniciar sesión",
  "notFound.message": "Página no encontrada",
  "notFound.home": "Volver al inicio",
  "cleaning.badge": "Suscripciones de conveniencia en Próspera",
  "cleaning.choosePlan": "Elige tu plan",
  "cleaning.subtitle": "Tu plataforma integral para suscripciones y servicios en el ecosistema de Próspera.",
  "cleaning.availability": "Lun-Sáb, 8AM-4PM",
  "cleaning.frequency": "1 limpieza / semana",
  "cleaning.cancelAnytime": "Cancela cuando quieras",
  "cleaning.professionalPerWeek": "1 limpieza profesional por semana",
  "cleaning.pickSlot": "Elige tu propio horario",
  "cleaning.hours": "Lun-Sáb, 8 AM - 4 PM",
  "cleaning.choose": "Elegir",
  "cleaning.noPackagesTitle": "No hay paquetes de limpieza disponibles",
  "cleaning.noPackagesDescription": "Vuelve pronto para ver nuevas opciones de servicio de limpieza.",
  "cleaning.viewBookings": "Ver mis reservas",
  "profile.pageTitle": "Perfil",
  "profile.user": "Usuario",
  "profile.logOut": "Cerrar sesión",
  "profile.bookings": "Mis subs",
  "profile.platformAdmin": "Admin de plataforma",
  "profile.platformAdminDescription": "Gestiona configuración, analítica y operaciones de limpieza.",
  "profile.personalInformation": "Información personal",
  "profile.personalDescription": "Mantén tus datos listos para soporte.",
  "profile.name": "Nombre",
  "profile.phone": "Teléfono",
  "profile.telegram": "Usuario de Telegram",
  "profile.updated": "Perfil actualizado correctamente",
  "profile.updateFailed": "No se pudo actualizar el perfil",
  "profile.openProfile": "Abrir perfil",
  "profile.viewAsUser": "Ver como usuario",
};

const dictionaries: Record<LanguageCode, Record<TranslationKey, string>> = { en, es };

export const languages: Array<{ code: LanguageCode; labelKey: TranslationKey; nativeLabelKey: TranslationKey }> = [
  { code: "en", labelKey: "language.english", nativeLabelKey: "language.englishNative" },
  { code: "es", labelKey: "language.spanish", nativeLabelKey: "language.spanishNative" },
];

interface I18nContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function getInitialLanguage(): LanguageCode {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return stored === "es" ? "es" : "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<LanguageCode>(getInitialLanguage);

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    t: (key) => dictionaries[language][key] ?? en[key],
  }), [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within LanguageProvider");
  }
  return context;
}
