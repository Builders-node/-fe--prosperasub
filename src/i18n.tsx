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

  // ── Discovery
  "discovery.village": "PROSPERA VILLAGE",
  "discovery.greeting": "Hi, {name}",
  "discovery.prompt": "What can we do for you?",
  "discovery.services": "Services",
  "discovery.mySubs": "My Subs",
  "discovery.myBusiness": "My Business",
  "discovery.manageBusinesses": "Manage your businesses",
  "discovery.becomeProvider": "Become a provider",
  "discovery.offerService": "Offer your service on EverySub",

  // ── Verify access
  "verify.granted": "Access granted",
  "verify.denied": "No access",
  "verify.invalidTitle": "Invalid QR code",
  "verify.invalidSubtitle": "This code is missing or expired.",
  "verify.whatToDo": "What to do:",
  "verify.hintRefresh": "Codes refresh every few minutes. Ask the customer to open My Subs and show a fresh one.",
  "verify.hintSignIn": "If the customer isn't signed in, they need to sign in first to generate a QR.",
  "verify.openApp": "Open EverySub",
  "verify.activeAccess": "Active access",
  "verify.noActive": "No active subscriptions",

  // ── Empty states (shared across services)
  "empty.settingUp": "We're setting things up. Check back soon.",

  // ── Query error
  "error.couldntLoad": "Couldn't load this",
  "error.retry": "Retry",
  "error.retrying": "Retrying…",

  // ── App chrome: the tab bar and the header, on every screen
  "nav.subs": "Subs",
  "nav.cart": "Cart",
  "nav.search": "Search on EverySub",
  "nav.chooseLocation": "Choose your location",
  "nav.notifications": "Notifications",

  // ── Listing
  "listing.searchIn": "Search {service}",
  "listing.providers": "Providers",
  "listing.plans": "Plans",
  "listing.all": "All",
  "listing.sort": "Sort",
  "listing.nothingYet": "Nothing here yet",
  "listing.noMatch": "Nothing matches your search",
  "listing.tryAnother": "Try a different word.",
  "listing.checkBack": "Check back soon.",

  // ── Offer / plan
  "plan.included": "What's included",
  "plan.notIncluded": "Not included",
  "plan.reviews": "Reviews",
  "plan.gallery": "Gallery",
  "plan.from": "from",
  "plan.subscribe": "Subscribe",
  "plan.book": "Book",
  "plan.perDay": "/ day",

  // ── Checkout — the path that takes money
  "checkout.title": "Checkout",
  "checkout.summary": "Your order",
  "checkout.startDate": "Start date",
  "checkout.term": "How long",
  "checkout.people": "People",
  "checkout.address": "Service address",
  "checkout.contact": "Contact details",
  "checkout.paymentMethod": "How would you like to pay?",
  "checkout.total": "Total",
  "checkout.pay": "Pay {amount}",
  "checkout.paying": "Waiting for payment…",
  "checkout.paid": "Paid",
  "checkout.successTitle": "You're all set",
  "checkout.successBody": "We've sent the details to your email.",
  "checkout.viewSubs": "View my subscriptions",
  "checkout.oneTimeNote": "A single purchase — it does not renew.",

  // ── Subscriptions
  "subs.title": "My Subs",
  "subs.active": "Active",
  "subs.expiring": "Expiring soon",
  "subs.expired": "Expired",
  "subs.renew": "Renew",
  "subs.none": "Nothing here yet",
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

  // ── Discovery
  "discovery.village": "PROSPERA VILLAGE",
  "discovery.greeting": "Hola, {name}",
  "discovery.prompt": "¿En qué podemos ayudarte?",
  "discovery.services": "Servicios",
  "discovery.mySubs": "Mis Subs",
  "discovery.myBusiness": "Mi Negocio",
  "discovery.manageBusinesses": "Gestiona tus negocios",
  "discovery.becomeProvider": "Ser proveedor",
  "discovery.offerService": "Ofrece tu servicio en EverySub",

  // ── Verify access
  "verify.granted": "Acceso concedido",
  "verify.denied": "Sin acceso",
  "verify.invalidTitle": "Código QR inválido",
  "verify.invalidSubtitle": "Este código no está disponible o ha expirado.",
  "verify.whatToDo": "Qué hacer:",
  "verify.hintRefresh": "Los códigos se renuevan cada pocos minutos. Pide al cliente que abra Mis Subs y muestre uno nuevo.",
  "verify.hintSignIn": "Si el cliente no ha iniciado sesión, debe hacerlo antes para generar un QR.",
  "verify.openApp": "Abrir EverySub",
  "verify.activeAccess": "Acceso activo",
  "verify.noActive": "Sin suscripciones activas",

  // ── Empty states
  "empty.settingUp": "Estamos preparando todo. Vuelve pronto.",

  // ── Query error
  "error.couldntLoad": "No se pudo cargar",
  "error.retry": "Reintentar",
  "error.retrying": "Reintentando…",

  // ── App chrome
  "nav.subs": "Subs",
  "nav.cart": "Carrito",
  "nav.search": "Buscar en EverySub",
  "nav.chooseLocation": "Elige tu ubicación",
  "nav.notifications": "Notificaciones",

  // ── Listado
  "listing.searchIn": "Buscar en {service}",
  "listing.providers": "Proveedores",
  "listing.plans": "Planes",
  "listing.all": "Todos",
  "listing.sort": "Ordenar",
  "listing.nothingYet": "Todavía no hay nada aquí",
  "listing.noMatch": "Nada coincide con tu búsqueda",
  "listing.tryAnother": "Prueba con otra palabra.",
  "listing.checkBack": "Vuelve pronto.",

  // ── Oferta / plan
  "plan.included": "Qué incluye",
  "plan.notIncluded": "No incluye",
  "plan.reviews": "Reseñas",
  "plan.gallery": "Galería",
  "plan.from": "desde",
  "plan.subscribe": "Suscribirme",
  "plan.book": "Reservar",
  "plan.perDay": "/ día",

  // ── Pago
  "checkout.title": "Pago",
  "checkout.summary": "Tu pedido",
  "checkout.startDate": "Fecha de inicio",
  "checkout.term": "Duración",
  "checkout.people": "Personas",
  "checkout.address": "Dirección del servicio",
  "checkout.contact": "Datos de contacto",
  "checkout.paymentMethod": "¿Cómo quieres pagar?",
  "checkout.total": "Total",
  "checkout.pay": "Pagar {amount}",
  "checkout.paying": "Esperando el pago…",
  "checkout.paid": "Pagado",
  "checkout.successTitle": "Todo listo",
  "checkout.successBody": "Te enviamos los detalles por correo.",
  "checkout.viewSubs": "Ver mis suscripciones",
  "checkout.oneTimeNote": "Una compra única — no se renueva.",

  // ── Suscripciones
  "subs.title": "Mis Subs",
  "subs.active": "Activa",
  "subs.expiring": "Vence pronto",
  "subs.expired": "Vencida",
  "subs.renew": "Renovar",
  "subs.none": "Todavía no hay nada aquí",
};

const dictionaries: Record<LanguageCode, Record<TranslationKey, string>> = { en, es };

export const languages: Array<{ code: LanguageCode; labelKey: TranslationKey; nativeLabelKey: TranslationKey }> = [
  { code: "en", labelKey: "language.english", nativeLabelKey: "language.englishNative" },
  { code: "es", labelKey: "language.spanish", nativeLabelKey: "language.spanishNative" },
];

/** Values for the `{placeholders}` a string carries. */
export type TranslationVars = Record<string, string | number>;

interface I18nContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (key: TranslationKey, vars?: TranslationVars) => string;
}

/** "Hi, {name}" + { name: "Ana" } → "Hi, Ana". An unfilled slot is left alone. */
const fill = (template: string, vars?: TranslationVars): string =>
  vars ? template.replace(/\{(\w+)\}/g, (whole, k) => (k in vars ? String(vars[k]) : whole)) : template;

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

/**
 * The language to open in.
 *
 * A stored choice always wins. Failing that we follow the browser, which in
 * Honduras is usually Spanish — the app used to hard-default to English and
 * offered no way to change it, so a Spanish-speaking customer had no Spanish
 * anywhere.
 */
function getInitialLanguage(): LanguageCode {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === "es" || stored === "en") return stored;
  const preferred = [navigator.language, ...(navigator.languages ?? [])];
  return preferred.some((l) => l?.toLowerCase().startsWith("es")) ? "es" : "en";
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
    // English is the fallback for a key Spanish has not been given yet, so a
    // missing translation shows the word rather than the key.
    t: (key, vars) => fill(dictionaries[language][key] ?? en[key] ?? String(key), vars),
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
