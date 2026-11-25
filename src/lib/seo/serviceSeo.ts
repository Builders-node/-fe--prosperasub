/**
 * What a service page says to search engines — and, word for word, to people.
 *
 * Titles name what people actually type ("meal delivery Roatan", "house
 * cleaning Roatan", "car rental Roatan") rather than the archetype's label.
 * The FAQ is drawn on the page AND sent as FAQPage JSON-LD: Google only trusts
 * structured answers that a visitor can also read, so the two must never
 * differ — which is why both the app (ServicePage, Fleet) and the robot pages
 * (middleware.ts) read this one file.
 *
 * No imports on purpose: middleware.ts bundles it at the edge.
 *
 * Keep every answer TRUE for every business in the service. Nothing about a
 * deposit, a cancellation fee or a delivery area that only one of them has.
 */
export interface ServiceSeo {
  title: string;
  description: string;
  h1: string;
  faq: Array<{ q: string; a: string }>;
}

export type SeoLang = "en" | "es";

const PAY = "Lightning, on-chain Bitcoin, or card and PayPal — all paid up front at checkout.";
const CANCEL = "Cancel any time in My subscriptions. It keeps running to the end of the period you paid for and simply won't renew — nothing more is charged.";
const PAY_ES = "Lightning, Bitcoin on-chain, o tarjeta y PayPal — todo se paga por adelantado al finalizar la compra.";
const CANCEL_ES = "Cancela cuando quieras en Mis suscripciones. Sigue activa hasta el final del periodo pagado y simplemente no se renueva — no se cobra nada más.";

const SEO: Record<string, ServiceSeo> = {
  food: {
    title: "Meal plans & food delivery in Roatán",
    description: "Weekly meal plans and food delivery from Roatán kitchens — lunch and dinner brought to your door. Pay with Bitcoin, Lightning, card or PayPal.",
    h1: "Meal plans and food delivery in Roatán",
    faq: [
      { q: "How do meal plans work?", a: "Pick a restaurant and a plan — how many meals a day and for how many weeks. The kitchen cooks the week's menu and brings it to you; you can see the menu and change which meals you get in My subscriptions." },
      { q: "Do you deliver to my address?", a: "At checkout you drop a pin on the map. Before you pay you see whether that spot is covered and what delivery costs." },
      { q: "How can I pay?", a: PAY },
      { q: "Can I stop my plan?", a: CANCEL },
    ],
  },
  cleaning: {
    title: "House & apartment cleaning in Roatán",
    description: "Recurring house and apartment cleaning in Roatán, booked online — pick a plan, choose your days, pay with Bitcoin, Lightning, card or PayPal.",
    h1: "House and apartment cleaning in Roatán",
    faq: [
      { q: "How does a cleaning plan work?", a: "Choose a plan with the number of cleanings you want, pay, then pick your days and times. Each visit appears in My subscriptions." },
      { q: "Can I move a cleaning?", a: "Yes — open the visit in My subscriptions to reschedule it, or cancel it up to a day before and the cleaning goes back to your plan." },
      { q: "How can I pay?", a: PAY },
      { q: "Can I cancel?", a: CANCEL },
    ],
  },
  clubs: {
    title: "Scuba diving, gym & beach club memberships in Roatán",
    description: "Dive packages, gym and beach club memberships in Roatán from local clubs — buy online, book your sessions, pay with Bitcoin, Lightning, card or PayPal.",
    h1: "Clubs, diving and sport in Roatán",
    faq: [
      { q: "What can I buy here?", a: "Memberships and packages from Roatán clubs — dive packages, gym and beach club memberships. Each club lists exactly what its plan includes." },
      { q: "How do I get in?", a: "Your membership shows an access QR in My subscriptions; staff scan it at the door. Courts and sessions are booked from the club's calendar." },
      { q: "How can I pay?", a: PAY },
      { q: "Can I cancel a membership?", a: CANCEL },
    ],
  },
  healthcare: {
    title: "Clinics & healthcare plans in Roatán",
    description: "Healthcare plans and clinic services in Roatán — see what's included and pay online with Bitcoin, Lightning, card or PayPal.",
    h1: "Healthcare in Roatán",
    faq: [
      { q: "What is offered?", a: "Plans and services from clinics on Roatán. Each plan lists what it covers and its price before you buy." },
      { q: "How can I pay?", a: PAY },
      { q: "Can I cancel?", a: CANCEL },
    ],
  },
  entertainment: {
    title: "Massage, spa & wellness in Roatán",
    description: "Massage, spa and wellness sessions in Roatán from local studios — book a time online and pay with Bitcoin, Lightning, card or PayPal.",
    h1: "Massage, spa and wellness in Roatán",
    faq: [
      { q: "How do I book a session?", a: "Pick a studio and a plan, pay, then choose a free time on the studio's calendar. The booking appears in My subscriptions." },
      { q: "Can I buy a package of sessions?", a: "Where a studio sells one, a package is listed as its own plan with the number of sessions it includes." },
      { q: "How can I pay?", a: PAY },
      { q: "Can I cancel?", a: CANCEL },
    ],
  },
  pantry: {
    title: "Coffee, groceries & drinks delivered in Roatán",
    description: "Coffee, pantry staples and drinks from Roatán shops and roasters — subscribe for regular delivery or order once. Pay with Bitcoin, Lightning, card or PayPal.",
    h1: "Coffee, pantry and drinks in Roatán",
    faq: [
      { q: "Can I get coffee every week?", a: "Yes — choose a plan with the amount and how often, and the shop delivers it on schedule until you stop." },
      { q: "Do you deliver to my address?", a: "At checkout you drop a pin on the map. Before you pay you see whether that spot is covered and what delivery costs." },
      { q: "How can I pay?", a: PAY },
      { q: "Can I stop a subscription?", a: CANCEL },
    ],
  },
  vehicles: {
    title: "Car rental in Roatán — cars, jeeps & scooters",
    description: "Rent a car, jeep or scooter in Roatán from local rental companies — by the day, week or month, delivered or picked up. Pay with Bitcoin, Lightning, card or PayPal.",
    h1: "Car rental in Roatán",
    faq: [
      { q: "How is the price worked out?", a: "By the day, with weekly and monthly rates that cap it: a longer rental never costs more than the week or month price for the same days." },
      { q: "Can the car be brought to me?", a: "Where the rental company delivers, you choose the area at booking and the delivery fee is shown before you pay. Otherwise you pick it up at their office." },
      { q: "How can I pay?", a: PAY },
      { q: "Can I change or cancel a booking?", a: "An unpaid booking can be cancelled from your bookings. For a paid one, message the rental company or EverySub support." },
    ],
  },
};

/** The same pages in Spanish — the words people type in Honduras ("renta de carros", "limpieza a domicilio"). */
const SEO_ES: Record<string, ServiceSeo> = {
  food: {
    title: "Planes de comida y comida a domicilio en Roatán",
    description: "Planes de comida semanales y comida a domicilio de cocinas de Roatán — almuerzo y cena en tu puerta. Paga con Bitcoin, Lightning, tarjeta o PayPal.",
    h1: "Planes de comida y comida a domicilio en Roatán",
    faq: [
      { q: "¿Cómo funcionan los planes de comida?", a: "Elige un restaurante y un plan — cuántas comidas al día y por cuántas semanas. La cocina prepara el menú de la semana y te lo lleva; puedes ver el menú y cambiar tus comidas en Mis suscripciones." },
      { q: "¿Entregan en mi dirección?", a: "Al pagar marcas tu ubicación en el mapa. Antes de pagar ves si esa zona tiene cobertura y cuánto cuesta la entrega." },
      { q: "¿Cómo puedo pagar?", a: PAY_ES },
      { q: "¿Puedo detener mi plan?", a: CANCEL_ES },
    ],
  },
  cleaning: {
    title: "Limpieza de casas y apartamentos en Roatán",
    description: "Limpieza a domicilio recurrente en Roatán, reservada en línea — elige un plan y tus días, paga con Bitcoin, Lightning, tarjeta o PayPal.",
    h1: "Limpieza de casas y apartamentos en Roatán",
    faq: [
      { q: "¿Cómo funciona un plan de limpieza?", a: "Elige un plan con el número de limpiezas que quieres, paga y luego escoge tus días y horas. Cada visita aparece en Mis suscripciones." },
      { q: "¿Puedo cambiar una limpieza?", a: "Sí — abre la visita en Mis suscripciones para reprogramarla, o cancélala hasta un día antes y la limpieza vuelve a tu plan." },
      { q: "¿Cómo puedo pagar?", a: PAY_ES },
      { q: "¿Puedo cancelar?", a: CANCEL_ES },
    ],
  },
  clubs: {
    title: "Buceo, gimnasio y beach club en Roatán — membresías",
    description: "Paquetes de buceo y membresías de gimnasio y beach club en Roatán — compra en línea, reserva tus sesiones y paga con Bitcoin, Lightning, tarjeta o PayPal.",
    h1: "Clubes, buceo y deporte en Roatán",
    faq: [
      { q: "¿Qué puedo comprar aquí?", a: "Membresías y paquetes de clubes de Roatán — buceo, gimnasio y beach club. Cada club indica exactamente qué incluye su plan." },
      { q: "¿Cómo entro?", a: "Tu membresía muestra un código QR de acceso en Mis suscripciones; el personal lo escanea en la entrada. Las canchas y sesiones se reservan en el calendario del club." },
      { q: "¿Cómo puedo pagar?", a: PAY_ES },
      { q: "¿Puedo cancelar una membresía?", a: CANCEL_ES },
    ],
  },
  healthcare: {
    title: "Clínicas y planes de salud en Roatán",
    description: "Planes de salud y servicios de clínicas en Roatán — mira qué incluye cada plan y paga en línea con Bitcoin, Lightning, tarjeta o PayPal.",
    h1: "Salud en Roatán",
    faq: [
      { q: "¿Qué se ofrece?", a: "Planes y servicios de clínicas de Roatán. Cada plan indica qué cubre y su precio antes de comprar." },
      { q: "¿Cómo puedo pagar?", a: PAY_ES },
      { q: "¿Puedo cancelar?", a: CANCEL_ES },
    ],
  },
  entertainment: {
    title: "Masajes, spa y bienestar en Roatán",
    description: "Masajes, spa y sesiones de bienestar en Roatán de estudios locales — reserva en línea y paga con Bitcoin, Lightning, tarjeta o PayPal.",
    h1: "Masajes, spa y bienestar en Roatán",
    faq: [
      { q: "¿Cómo reservo una sesión?", a: "Elige un estudio y un plan, paga y escoge una hora libre en su calendario. La reserva aparece en Mis suscripciones." },
      { q: "¿Puedo comprar un paquete de sesiones?", a: "Cuando un estudio lo ofrece, el paquete aparece como un plan propio con el número de sesiones que incluye." },
      { q: "¿Cómo puedo pagar?", a: PAY_ES },
      { q: "¿Puedo cancelar?", a: CANCEL_ES },
    ],
  },
  pantry: {
    title: "Café, despensa y bebidas a domicilio en Roatán",
    description: "Café, productos de despensa y bebidas de tiendas y tostadores de Roatán — suscríbete para entregas regulares o pide una vez. Paga con Bitcoin, Lightning, tarjeta o PayPal.",
    h1: "Café, despensa y bebidas en Roatán",
    faq: [
      { q: "¿Puedo recibir café cada semana?", a: "Sí — elige un plan con la cantidad y la frecuencia, y la tienda lo entrega según el calendario hasta que lo detengas." },
      { q: "¿Entregan en mi dirección?", a: "Al pagar marcas tu ubicación en el mapa. Antes de pagar ves si esa zona tiene cobertura y cuánto cuesta la entrega." },
      { q: "¿Cómo puedo pagar?", a: PAY_ES },
      { q: "¿Puedo detener una suscripción?", a: CANCEL_ES },
    ],
  },
  vehicles: {
    title: "Renta de carros en Roatán — autos, jeeps y motos",
    description: "Renta un carro, jeep o moto en Roatán con empresas locales — por día, semana o mes, con entrega o recogida. Paga con Bitcoin, Lightning, tarjeta o PayPal.",
    h1: "Renta de carros en Roatán",
    faq: [
      { q: "¿Cómo se calcula el precio?", a: "Por día, con tarifas semanales y mensuales que lo limitan: una renta más larga nunca cuesta más que el precio de la semana o el mes por los mismos días." },
      { q: "¿Me pueden llevar el carro?", a: "Si la empresa hace entregas, eliges la zona al reservar y ves el costo de entrega antes de pagar. Si no, lo recoges en su oficina." },
      { q: "¿Cómo puedo pagar?", a: PAY_ES },
      { q: "¿Puedo cambiar o cancelar una reserva?", a: "Una reserva sin pagar se cancela desde tus reservas. Para una pagada, escribe a la empresa de renta o al soporte de EverySub." },
    ],
  },
};

/** The copy for a service key, or null when it has none (a new service uses its own label). */
export function serviceSeo(key: string | null | undefined, lang: SeoLang = "en"): ServiceSeo | null {
  if (!key) return null;
  return (lang === "es" ? SEO_ES[key] : null) || SEO[key] || null;
}

/** FAQPage JSON-LD for the answers shown on the page. */
export function faqJsonLd(faq: ServiceSeo["faq"]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}
