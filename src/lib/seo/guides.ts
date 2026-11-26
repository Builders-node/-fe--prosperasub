/**
 * Guides — plain answers to what people search before they buy a service on
 * Roatán ("moving to Roatan", "getting around Roatan", "renta de carros
 * Roatán"). Each guide ends in the live plans of the services it is about, so
 * a reader can act on it, and a search engine sees a page that is useful
 * rather than a thin list.
 *
 * The app (src/pages/Guides.tsx) and the robot pages (middleware.ts) both read
 * this file, so a person and a crawler read the same words. No imports on
 * purpose: middleware.ts bundles it at the edge.
 *
 * Keep every sentence true for every business in the service, like
 * serviceSeo.ts: no prices (the live list shows them), no promises one
 * business makes and another does not.
 */
export interface GuideText {
  title: string;
  description: string;
  h1: string;
  intro: string;
  sections: Array<{ h: string; p: string[] }>;
}

export interface Guide {
  slug: string;
  /** Service keys whose live plans are listed under the guide. */
  services: string[];
  /** YYYY-MM-DD — shown on the page and sent as dateModified. */
  updated: string;
  en: GuideText;
  es: GuideText;
}

const UPDATED = "2026-11-25";

export const GUIDES: Guide[] = [
  {
    slug: "moving-to-roatan",
    services: ["food", "cleaning", "vehicles", "healthcare"],
    updated: UPDATED,
    en: {
      title: "Moving to Roatán: services to set up in your first month",
      description: "A checklist for your first weeks on Roatán — getting around, meals, cleaning, healthcare and how to pay local businesses, with the plans you can sign up for today.",
      h1: "Moving to Roatán: what to set up in your first month",
      intro: "The first weeks on the island go to the same handful of questions: how will I get around, who cooks and cleans while I settle in, where is a clinic, and how do I pay people. This checklist takes them in the order most newcomers meet them.",
      sections: [
        { h: "1. Transport, before anything else", p: [
          "Roatán is long and narrow, and the places you will need — Coxen Hole, French Harbour, West End, West Bay, Sandy Bay, First Bight and Pristine Bay — are spread along one main road. Taxis and colectivos run it, but most people who stay more than a few days rent a car, jeep or scooter.",
          "Renting by the week or month is cheaper per day than by the day. On EverySub the weekly and monthly rates cap the price, so a longer rental never costs more than the week or month for the same days.",
        ] },
        { h: "2. Meals while you settle in", p: [
          "Until you know the markets and supermarkets, a meal plan takes cooking off the list. Local kitchens cook a weekly menu and bring lunch, dinner or both to your door; you choose how many meals and for how many weeks.",
        ] },
        { h: "3. A cleaner on a schedule", p: [
          "Sand, humidity and salt air mean a house on the island needs cleaning more often than you may be used to. A recurring plan books the same days every week, and you can move or skip a visit from your phone.",
        ] },
        { h: "4. Know where your clinic is", p: [
          "Find a clinic before you need one. Some clinics on the island sell plans that bundle consultations or check-ups, with what is covered listed before you pay.",
        ] },
        { h: "5. How to pay", p: [
          "Cash in lempiras and US dollars is common on the island, but paying a business you have not met yet is easier online. Every business on EverySub takes Lightning, on-chain Bitcoin, card and PayPal, paid up front at checkout.",
        ] },
      ],
    },
    es: {
      title: "Mudarse a Roatán: servicios para tu primer mes",
      description: "Una lista para tus primeras semanas en Roatán — transporte, comida, limpieza, salud y cómo pagar a negocios locales, con los planes que puedes contratar hoy.",
      h1: "Mudarse a Roatán: qué organizar en tu primer mes",
      intro: "Las primeras semanas en la isla giran en torno a las mismas preguntas: cómo moverme, quién cocina y limpia mientras me instalo, dónde hay una clínica y cómo pago. Esta lista las ordena como suelen aparecer.",
      sections: [
        { h: "1. Transporte, antes que nada", p: [
          "Roatán es larga y angosta, y los lugares que vas a necesitar — Coxen Hole, French Harbour, West End, West Bay, Sandy Bay, First Bight y Pristine Bay — están a lo largo de una carretera principal. Hay taxis y colectivos, pero quien se queda más de unos días suele rentar un carro, jeep o moto.",
          "Rentar por semana o por mes sale más barato por día. En EverySub las tarifas semanales y mensuales limitan el precio: una renta más larga nunca cuesta más que la semana o el mes por los mismos días.",
        ] },
        { h: "2. Comida mientras te instalas", p: [
          "Hasta que conozcas los mercados y supermercados, un plan de comida te quita la cocina de encima. Cocinas locales preparan un menú semanal y te llevan almuerzo, cena o ambos; tú eliges cuántas comidas y por cuántas semanas.",
        ] },
        { h: "3. Limpieza con horario fijo", p: [
          "La arena, la humedad y el aire salado hacen que una casa en la isla necesite limpieza más seguido. Un plan recurrente reserva los mismos días cada semana, y puedes mover o saltar una visita desde tu teléfono.",
        ] },
        { h: "4. Ubica tu clínica", p: [
          "Busca una clínica antes de necesitarla. Algunas clínicas de la isla venden planes con consultas o chequeos, y lo que cubren se ve antes de pagar.",
        ] },
        { h: "5. Cómo pagar", p: [
          "En la isla es común pagar en efectivo, en lempiras y dólares, pero pagar en línea es más fácil con un negocio que aún no conoces. Todos los negocios en EverySub aceptan Lightning, Bitcoin on-chain, tarjeta y PayPal, por adelantado.",
        ] },
      ],
    },
  },
  {
    slug: "getting-around-roatan",
    services: ["vehicles"],
    updated: UPDATED,
    en: {
      title: "Getting around Roatán: renting a car, jeep or scooter",
      description: "How to get around Roatán: when a taxi is enough, when to rent, car vs jeep vs scooter, renting by the day, week or month, and delivery to where you stay.",
      h1: "Getting around Roatán: car, jeep or scooter?",
      intro: "Whether you need your own wheels depends on where you stay and for how long. Here is how people who live on the island decide.",
      sections: [
        { h: "When a taxi is enough", p: [
          "If you stay in West End or West Bay for a few days and mostly walk to the beach and back, taxis and water taxis cover it. Once you want to see the east end, shop in French Harbour or commute, the fares add up quickly.",
        ] },
        { h: "Car, jeep or scooter", p: [
          "A scooter is the cheapest way around and easy to park, but the main road has hills, rain showers and fast traffic, so it suits experienced riders. A small car is the everyday choice. A jeep or SUV is worth it for unpaved side roads, the east end and anything with luggage or dive gear.",
        ] },
        { h: "By the day, week or month", p: [
          "Rental companies price by the day and give lower weekly and monthly rates. On EverySub those rates cap the total, so 6 days never costs more than a week, and 25 days never more than a month.",
        ] },
        { h: "Delivery and pick-up", p: [
          "Some rental companies bring the car to where you stay; you choose the area when booking and see the delivery fee before paying. Others hand it over at their office.",
        ] },
      ],
    },
    es: {
      title: "Cómo moverse en Roatán: rentar carro, jeep o moto",
      description: "Cómo moverse en Roatán: cuándo basta un taxi, cuándo rentar, carro vs jeep vs moto, renta por día, semana o mes, y entrega donde te hospedas.",
      h1: "Moverse en Roatán: ¿carro, jeep o moto?",
      intro: "Si necesitas vehículo propio depende de dónde te quedas y por cuánto tiempo. Así lo deciden quienes viven en la isla.",
      sections: [
        { h: "Cuándo basta un taxi", p: [
          "Si te quedas unos días en West End o West Bay y casi solo vas a la playa, los taxis y taxis acuáticos alcanzan. Cuando quieres conocer el este de la isla, hacer compras en French Harbour o moverte a diario, las tarifas suman rápido.",
        ] },
        { h: "Carro, jeep o moto", p: [
          "La moto es lo más barato y fácil de estacionar, pero la carretera principal tiene cuestas, lluvias y tráfico rápido, así que conviene a conductores con experiencia. Un carro pequeño es la opción diaria. Un jeep o SUV vale la pena para caminos de tierra, el este de la isla y cualquier viaje con equipaje o equipo de buceo.",
        ] },
        { h: "Por día, semana o mes", p: [
          "Las empresas cobran por día y dan tarifas más bajas por semana y por mes. En EverySub esas tarifas limitan el total: 6 días nunca cuestan más que una semana, ni 25 días más que un mes.",
        ] },
        { h: "Entrega y recogida", p: [
          "Algunas empresas llevan el carro a donde te hospedas; eliges la zona al reservar y ves el costo de entrega antes de pagar. Otras lo entregan en su oficina.",
        ] },
      ],
    },
  },
  {
    slug: "house-cleaning-roatan",
    services: ["cleaning"],
    updated: UPDATED,
    en: {
      title: "House cleaning in Roatán: how a recurring plan works",
      description: "How recurring house and apartment cleaning works on Roatán — how often to book, what to agree on, rescheduling, and paying online.",
      h1: "House cleaning in Roatán, week after week",
      intro: "Finding a cleaner on the island usually means asking around in a group chat and agreeing everything by message. A plan puts the same agreement in writing: how many visits, which days, and the price.",
      sections: [
        { h: "How often", p: [
          "Most homes on the island are cleaned once or twice a week: sand comes in on feet, humidity brings mould to bathrooms and closets, and salt air settles on every surface. A rental between guests needs a cleaning on each changeover.",
        ] },
        { h: "What to agree on", p: [
          "Each plan says what a visit includes. Before you subscribe, check the size of home it is priced for, whether supplies are brought or yours, and whether extras like laundry, windows or the inside of the fridge are part of it.",
        ] },
        { h: "Moving or skipping a visit", p: [
          "Plans move with you: open the visit in My subscriptions to reschedule it, or cancel it up to a day before and it goes back to your plan.",
        ] },
        { h: "Paying", p: [
          "You pay the plan up front by Lightning, Bitcoin, card or PayPal, so there is no cash to leave out and nothing to chase at the end of the month.",
        ] },
      ],
    },
    es: {
      title: "Limpieza de casas en Roatán: cómo funciona un plan recurrente",
      description: "Cómo funciona la limpieza recurrente de casas y apartamentos en Roatán — cada cuánto reservar, qué acordar, reprogramar y pagar en línea.",
      h1: "Limpieza de casas en Roatán, semana tras semana",
      intro: "Encontrar quien limpie en la isla suele ser preguntar en un grupo de chat y acordar todo por mensaje. Un plan deja ese acuerdo por escrito: cuántas visitas, qué días y el precio.",
      sections: [
        { h: "Cada cuánto", p: [
          "La mayoría de las casas en la isla se limpian una o dos veces por semana: la arena entra con los pies, la humedad trae moho a baños y clósets, y el aire salado se asienta en todo. Una casa de renta necesita limpieza en cada cambio de huéspedes.",
        ] },
        { h: "Qué acordar", p: [
          "Cada plan indica qué incluye la visita. Antes de suscribirte revisa para qué tamaño de casa es el precio, si llevan los productos o usan los tuyos, y si extras como lavandería, ventanas o el interior del refrigerador están incluidos.",
        ] },
        { h: "Mover o saltar una visita", p: [
          "El plan se adapta a ti: abre la visita en Mis suscripciones para reprogramarla, o cancélala hasta un día antes y vuelve a tu plan.",
        ] },
        { h: "Pago", p: [
          "Pagas el plan por adelantado con Lightning, Bitcoin, tarjeta o PayPal: no hay efectivo que dejar ni cobros pendientes a fin de mes.",
        ] },
      ],
    },
  },
  {
    slug: "meal-plans-roatan",
    services: ["food"],
    updated: UPDATED,
    en: {
      title: "Meal plans in Roatán: eating well without cooking",
      description: "How meal plans and food delivery subscriptions work on Roatán — choosing a kitchen, how many meals, delivery to your address, changing meals and pausing.",
      h1: "Meal plans in Roatán",
      intro: "A meal plan is a kitchen cooking for you on a schedule: you pick how many meals a day and for how many weeks, and they arrive without ordering each time.",
      sections: [
        { h: "Who it suits", p: [
          "People working long days, families settling in, anyone staying a month or more in a place without a proper kitchen — and anyone who would rather spend the evening on the beach than in the supermarket.",
        ] },
        { h: "Choosing a plan", p: [
          "Plans differ by meals per day (lunch, dinner or both), by number of weeks and by menu. Each kitchen shows the week's menu, and in My subscriptions you can change which meals you get.",
        ] },
        { h: "Delivery", p: [
          "At checkout you drop a pin where you want the food. Before paying you see whether that spot is covered and what delivery costs — coverage depends on the kitchen.",
        ] },
        { h: "Stopping", p: [
          "Cancel any time in My subscriptions. The plan runs to the end of the period you paid for and doesn't renew.",
        ] },
      ],
    },
    es: {
      title: "Planes de comida en Roatán: comer bien sin cocinar",
      description: "Cómo funcionan los planes de comida y la comida a domicilio por suscripción en Roatán — elegir cocina, cuántas comidas, entrega, cambiar comidas y pausar.",
      h1: "Planes de comida en Roatán",
      intro: "Un plan de comida es una cocina que cocina para ti con horario: eliges cuántas comidas al día y por cuántas semanas, y llegan sin pedir cada vez.",
      sections: [
        { h: "Para quién es", p: [
          "Para quien trabaja jornadas largas, familias que se están instalando, quien se queda un mes o más sin una cocina completa — y para quien prefiere pasar la tarde en la playa y no en el supermercado.",
        ] },
        { h: "Elegir un plan", p: [
          "Los planes cambian según comidas al día (almuerzo, cena o ambos), número de semanas y menú. Cada cocina muestra el menú de la semana, y en Mis suscripciones puedes cambiar tus comidas.",
        ] },
        { h: "Entrega", p: [
          "Al pagar marcas en el mapa dónde quieres la comida. Antes de pagar ves si esa zona tiene cobertura y cuánto cuesta la entrega — depende de cada cocina.",
        ] },
        { h: "Detener el plan", p: [
          "Cancela cuando quieras en Mis suscripciones. El plan sigue hasta el final del periodo pagado y no se renueva.",
        ] },
      ],
    },
  },
  {
    slug: "learn-to-dive-roatan",
    services: ["clubs"],
    updated: UPDATED,
    en: {
      title: "Learning to dive in Roatán: courses, packages and memberships",
      description: "Why Roatán is one of the easiest places to learn to dive, how dive courses and packages work, and how to buy dives from local shops online.",
      h1: "Learning to dive in Roatán",
      intro: "Roatán sits on the Mesoamerican Barrier Reef, with calm, warm water and reef close to shore — which is why so many people take their first dive course here.",
      sections: [
        { h: "Why here", p: [
          "Many dive sites are a short boat ride from the shore, visibility is usually good, and the water is warm all year. Shops run courses every week, from a first try-dive to full certification.",
        ] },
        { h: "Course, package or membership", p: [
          "A course teaches and certifies you. A package is a bundle of fun dives for people already certified. A membership suits residents who dive regularly. Each shop's plan says exactly what is included — dives, equipment, certification fees.",
        ] },
        { h: "Booking your dives", p: [
          "After you buy, you book dives or sessions from the shop's calendar, and your plan shows an access QR the staff scan at the dock or the door.",
        ] },
      ],
    },
    es: {
      title: "Aprender a bucear en Roatán: cursos, paquetes y membresías",
      description: "Por qué Roatán es uno de los lugares más fáciles para aprender a bucear, cómo funcionan cursos y paquetes, y cómo comprar inmersiones en línea.",
      h1: "Aprender a bucear en Roatán",
      intro: "Roatán está sobre el Sistema Arrecifal Mesoamericano, con agua tibia y tranquila y arrecife cerca de la costa — por eso tanta gente hace aquí su primer curso de buceo.",
      sections: [
        { h: "Por qué aquí", p: [
          "Muchos sitios de buceo están a pocos minutos en lancha, la visibilidad suele ser buena y el agua es tibia todo el año. Las tiendas dan cursos cada semana, desde una primera inmersión de prueba hasta la certificación completa.",
        ] },
        { h: "Curso, paquete o membresía", p: [
          "Un curso te enseña y te certifica. Un paquete es un conjunto de inmersiones para quien ya está certificado. Una membresía conviene a residentes que bucean seguido. Cada plan indica qué incluye — inmersiones, equipo, costo de certificación.",
        ] },
        { h: "Reservar tus inmersiones", p: [
          "Después de comprar reservas inmersiones o sesiones en el calendario de la tienda, y tu plan muestra un QR de acceso que el personal escanea en el muelle o la entrada.",
        ] },
      ],
    },
  },
  {
    slug: "cost-of-services-roatan",
    services: ["food", "cleaning", "clubs", "healthcare", "entertainment", "pantry", "vehicles"],
    updated: UPDATED,
    en: {
      title: "What services cost in Roatán — live prices from local businesses",
      description: "Current prices for meal plans, cleaning, car rental, diving, gym, healthcare and more on Roatán, from businesses selling on EverySub — updated as they change.",
      h1: "What services cost in Roatán",
      intro: "Cost-of-living articles go out of date the month they are written. The list below is not an estimate: it is every plan local businesses sell on EverySub right now, at today's price.",
      sections: [
        { h: "How to read the prices", p: [
          "Prices are in US dollars and include what each plan lists. A weekly or monthly price is for the whole period; delivery, where there is one, is shown at checkout before you pay.",
        ] },
        { h: "What usually changes the total", p: [
          "Where you live (delivery areas and fees), how long you commit (weekly and monthly plans cost less per day or per meal), and the season — the island is busiest from December to April.",
        ] },
      ],
    },
    es: {
      title: "Cuánto cuestan los servicios en Roatán — precios actuales",
      description: "Precios actuales de planes de comida, limpieza, renta de carros, buceo, gimnasio, salud y más en Roatán, de negocios que venden en EverySub.",
      h1: "Cuánto cuestan los servicios en Roatán",
      intro: "Los artículos de costo de vida se desactualizan el mismo mes. La lista de abajo no es una estimación: son todos los planes que los negocios locales venden hoy en EverySub, con el precio de hoy.",
      sections: [
        { h: "Cómo leer los precios", p: [
          "Los precios están en dólares e incluyen lo que indica cada plan. Un precio semanal o mensual es por todo el periodo; la entrega, si la hay, se muestra al pagar.",
        ] },
        { h: "Qué cambia el total", p: [
          "Dónde vives (zonas y costos de entrega), por cuánto tiempo te comprometes (los planes semanales y mensuales cuestan menos por día o por comida) y la temporada — la isla tiene más movimiento de diciembre a abril.",
        ] },
      ],
    },
  },
];

/**
 * What a reader should leave with (shown first, as "In short") and the
 * questions people actually type, answered in a line or two (shown last and
 * sent as FAQPage JSON-LD). Same rule as above: true for every business.
 */
export interface GuideExtras {
  takeaways: string[];
  faq: Array<{ q: string; a: string }>;
}

export const GUIDE_EXTRAS: Record<string, { en: GuideExtras; es: GuideExtras }> = {
  "moving-to-roatan": {
    en: {
      takeaways: [
        "Sort out transport first: the island's towns are spread along one main road.",
        "A weekly or monthly rental, meal plan and cleaner cost less per day than paying as you go.",
        "Find a clinic before you need one.",
        "Every business on EverySub takes Lightning, Bitcoin, card and PayPal, paid up front.",
      ],
      faq: [
        { q: "Do I need a car on Roatán?", a: "For a short beach stay in West End or West Bay, taxis are enough. If you live on the island, shop in French Harbour or visit the east end, most people rent a car, jeep or scooter." },
        { q: "Can I pay businesses on Roatán without cash?", a: "Cash in lempiras and US dollars is common, but every business on EverySub takes Lightning, on-chain Bitcoin, card and PayPal online, paid up front." },
        { q: "Where are the main towns on Roatán?", a: "Coxen Hole, French Harbour, West End, West Bay, Sandy Bay, First Bight and Pristine Bay, all along the main road." },
      ],
    },
    es: {
      takeaways: [
        "Resuelve el transporte primero: los pueblos de la isla están a lo largo de una carretera principal.",
        "Una renta, un plan de comida o una limpieza por semana o por mes cuestan menos por día que pagar suelto.",
        "Ubica una clínica antes de necesitarla.",
        "Todos los negocios en EverySub aceptan Lightning, Bitcoin, tarjeta y PayPal, por adelantado.",
      ],
      faq: [
        { q: "¿Necesito carro en Roatán?", a: "Para unos días de playa en West End o West Bay alcanzan los taxis. Si vives en la isla, compras en French Harbour o vas al este, la mayoría renta carro, jeep o moto." },
        { q: "¿Puedo pagar a negocios en Roatán sin efectivo?", a: "El efectivo en lempiras y dólares es común, pero todos los negocios en EverySub aceptan Lightning, Bitcoin on-chain, tarjeta y PayPal en línea, por adelantado." },
        { q: "¿Cuáles son los pueblos principales de Roatán?", a: "Coxen Hole, French Harbour, West End, West Bay, Sandy Bay, First Bight y Pristine Bay, todos sobre la carretera principal." },
      ],
    },
  },
  "getting-around-roatan": {
    en: {
      takeaways: [
        "Taxis cover a short stay in West End or West Bay; for more, rent.",
        "A small car is the everyday choice; a jeep or SUV helps on the east end's hills and dirt roads.",
        "Weekly and monthly rates cap the total, so a longer rental never costs more.",
        "Some companies deliver the car to where you stay; you see the fee before paying.",
      ],
      faq: [
        { q: "Is it better to rent a scooter or a car on Roatán?", a: "A scooter is cheapest and easy to park but suits experienced riders, since the main road has hills, rain and fast traffic. A small car is the everyday choice." },
        { q: "Can the rental car be delivered to my hotel?", a: "Some rental companies deliver to where you stay. You choose the area when booking and see the delivery fee before paying; others hand the car over at their office." },
        { q: "Is renting by the week cheaper?", a: "Yes. Companies give lower weekly and monthly rates, and on EverySub those rates cap the total: 6 days never cost more than a week." },
      ],
    },
    es: {
      takeaways: [
        "Para unos días en West End o West Bay alcanza el taxi; para más, renta.",
        "Un carro pequeño es lo diario; un jeep o SUV ayuda en las cuestas y caminos de tierra del este.",
        "Las tarifas semanales y mensuales limitan el total: rentar más tiempo nunca cuesta más.",
        "Algunas empresas llevan el carro a donde te hospedas; ves el costo antes de pagar.",
      ],
      faq: [
        { q: "¿Conviene rentar moto o carro en Roatán?", a: "La moto es lo más barato y fácil de estacionar, pero conviene a conductores con experiencia: la carretera tiene cuestas, lluvia y tráfico rápido. El carro pequeño es lo diario." },
        { q: "¿Me pueden llevar el carro al hotel?", a: "Algunas empresas lo llevan a donde te hospedas. Eliges la zona al reservar y ves el costo de entrega antes de pagar; otras lo entregan en su oficina." },
        { q: "¿Sale más barato rentar por semana?", a: "Sí. Las empresas dan tarifas más bajas por semana y por mes, y en EverySub esas tarifas limitan el total: 6 días nunca cuestan más que una semana." },
      ],
    },
  },
  "house-cleaning-roatan": {
    en: {
      takeaways: [
        "Most homes on the island are cleaned once or twice a week.",
        "Check what a visit includes, the home size and who brings supplies before you subscribe.",
        "Move or skip a visit from My subscriptions.",
        "Paid up front, so there is no cash to leave out.",
      ],
      faq: [
        { q: "How often should a house on Roatán be cleaned?", a: "Most homes are cleaned once or twice a week because of sand, humidity and salt air. A rental between guests needs a clean after every stay." },
        { q: "Do cleaners bring their own supplies?", a: "It depends on the plan. Each plan says whether supplies are brought or yours, and what extras like laundry or windows cost." },
        { q: "Can I reschedule a cleaning?", a: "Yes. Open the visit in My subscriptions to move it, or cancel it up to a day before and it goes back to your plan." },
      ],
    },
    es: {
      takeaways: [
        "La mayoría de las casas en la isla se limpian una o dos veces por semana.",
        "Antes de suscribirte revisa qué incluye la visita, el tamaño de casa y quién lleva los productos.",
        "Mueve o salta una visita desde Mis suscripciones.",
        "Pagas por adelantado: no hay efectivo que dejar.",
      ],
      faq: [
        { q: "¿Cada cuánto se limpia una casa en Roatán?", a: "La mayoría una o dos veces por semana, por la arena, la humedad y el aire salado. Una casa de renta necesita limpieza después de cada huésped." },
        { q: "¿Las personas de limpieza llevan sus productos?", a: "Depende del plan. Cada plan indica si llevan los productos o usan los tuyos, y cuánto cuestan extras como lavandería o ventanas." },
        { q: "¿Puedo cambiar el día de la limpieza?", a: "Sí. Abre la visita en Mis suscripciones para moverla, o cancélala hasta un día antes y vuelve a tu plan." },
      ],
    },
  },
  "meal-plans-roatan": {
    en: {
      takeaways: [
        "Choose lunch, dinner or both, for as many weeks as you want.",
        "Each kitchen shows the week's menu before you pay.",
        "Drop a pin at checkout to see whether you're covered and what delivery costs.",
        "Cancel any time; the plan runs to the end of the period you paid for.",
      ],
      faq: [
        { q: "Is there meal delivery on Roatán?", a: "Yes. Local kitchens sell weekly meal plans and deliver lunch, dinner or both. Coverage depends on the kitchen, and you see it before paying." },
        { q: "Can I change my meals during the week?", a: "Yes. In My subscriptions you can change which meals you get." },
        { q: "What happens when I cancel a meal plan?", a: "It doesn't renew. The plan keeps running to the end of the period you already paid for." },
      ],
    },
    es: {
      takeaways: [
        "Elige almuerzo, cena o ambos, por las semanas que quieras.",
        "Cada cocina muestra el menú de la semana antes de pagar.",
        "Marca en el mapa al pagar para ver si hay cobertura y cuánto cuesta la entrega.",
        "Cancela cuando quieras; el plan sigue hasta el final del periodo pagado.",
      ],
      faq: [
        { q: "¿Hay entrega de comida en Roatán?", a: "Sí. Cocinas locales venden planes semanales y entregan almuerzo, cena o ambos. La cobertura depende de cada cocina y la ves antes de pagar." },
        { q: "¿Puedo cambiar mis comidas durante la semana?", a: "Sí. En Mis suscripciones puedes cambiar qué comidas recibes." },
        { q: "¿Qué pasa si cancelo el plan de comida?", a: "No se renueva. El plan sigue hasta el final del periodo que ya pagaste." },
      ],
    },
  },
  "learn-to-dive-roatan": {
    en: {
      takeaways: [
        "Warm water all year and many sites a short boat ride from shore.",
        "A course certifies you; a package is fun dives for the certified; a membership suits regulars.",
        "Book dives from the shop's calendar and show your access QR at the dock.",
      ],
      faq: [
        { q: "Is Roatán good for learning to dive?", a: "Yes. The water is warm all year, visibility is usually good, and shops run courses every week, from a first try-dive to full certification." },
        { q: "What is the difference between a dive package and a membership?", a: "A package is a set number of fun dives for certified divers. A membership suits residents who dive regularly. Each plan lists exactly what is included." },
        { q: "How do I book my dives after buying?", a: "From the shop's calendar in your account. Your plan shows an access QR the staff scan at the dock or the door." },
      ],
    },
    es: {
      takeaways: [
        "Agua tibia todo el año y muchos sitios a pocos minutos en lancha.",
        "Un curso te certifica; un paquete son inmersiones para certificados; una membresía es para quien bucea seguido.",
        "Reserva en el calendario de la tienda y muestra tu QR de acceso en el muelle.",
      ],
      faq: [
        { q: "¿Roatán es buen lugar para aprender a bucear?", a: "Sí. El agua es tibia todo el año, la visibilidad suele ser buena y las tiendas dan cursos cada semana, desde una inmersión de prueba hasta la certificación." },
        { q: "¿Qué diferencia hay entre un paquete y una membresía de buceo?", a: "Un paquete es un número fijo de inmersiones para buzos certificados. Una membresía conviene a residentes que bucean seguido. Cada plan indica qué incluye." },
        { q: "¿Cómo reservo mis inmersiones después de comprar?", a: "En el calendario de la tienda, desde tu cuenta. Tu plan muestra un QR de acceso que el personal escanea en el muelle o la entrada." },
      ],
    },
  },
  "cost-of-services-roatan": {
    en: {
      takeaways: [
        "Every price below is live, in US dollars, from businesses on the island.",
        "Weekly and monthly plans cost less per day or per meal.",
        "December to April is the busiest season.",
      ],
      faq: [
        { q: "Are prices on Roatán in dollars or lempiras?", a: "Both are used on the island. Prices on EverySub are in US dollars and you can pay by Lightning, Bitcoin, card or PayPal." },
        { q: "When is high season on Roatán?", a: "The island is busiest from December to April." },
        { q: "Is delivery included in the price?", a: "Where a plan has delivery, its cost depends on where you are and is shown at checkout before you pay." },
      ],
    },
    es: {
      takeaways: [
        "Todos los precios de abajo son actuales, en dólares, de negocios de la isla.",
        "Los planes semanales y mensuales cuestan menos por día o por comida.",
        "De diciembre a abril es la temporada con más movimiento.",
      ],
      faq: [
        { q: "¿En Roatán se paga en dólares o lempiras?", a: "En la isla se usan ambos. En EverySub los precios están en dólares y puedes pagar con Lightning, Bitcoin, tarjeta o PayPal." },
        { q: "¿Cuándo es temporada alta en Roatán?", a: "La isla tiene más movimiento de diciembre a abril." },
        { q: "¿La entrega está incluida en el precio?", a: "Si el plan tiene entrega, su costo depende de dónde estás y se muestra al pagar, antes de confirmar." },
      ],
    },
  },
};

export const guideExtras = (slug: string, lang: "en" | "es"): GuideExtras | null => GUIDE_EXTRAS[slug]?.[lang] ?? null;

export const guideBySlug = (slug: string | undefined) => GUIDES.find((g) => g.slug === slug) ?? null;

export const GUIDES_INDEX = {
  en: {
    title: "Roatán guides — living, getting around and services",
    description: "Practical guides to life on Roatán: moving to the island, getting around, cleaning, meal plans, diving and what services cost.",
    h1: "Guides to life on Roatán",
    intro: "Short, practical answers to the questions people ask before they move to, or stay a while on, Roatán.",
    more: "Plans you can sign up for",
    updated: "Updated",
    all: "All guides",
  },
  es: {
    title: "Guías de Roatán — vivir, moverse y servicios",
    description: "Guías prácticas para la vida en Roatán: mudarse a la isla, moverse, limpieza, planes de comida, buceo y cuánto cuestan los servicios.",
    h1: "Guías para vivir en Roatán",
    intro: "Respuestas cortas y prácticas a lo que la gente pregunta antes de mudarse o pasar una temporada en Roatán.",
    more: "Planes que puedes contratar",
    updated: "Actualizado",
    all: "Todas las guías",
  },
};

/** Minutes to read a guide, at 200 words a minute — never under two. */
export const guideMinutes = (g: Guide, lang: "en" | "es") => {
  const t = g[lang];
  const words = [t.intro, ...t.sections.flatMap((s) => [s.h, ...s.p])].join(" ").split(/\s+/).length;
  return Math.max(2, Math.round(words / 200));
};
