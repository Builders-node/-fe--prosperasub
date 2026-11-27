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
    slug: "things-to-do-in-roatan",
    services: ["clubs", "entertainment", "vehicles", "food"],
    updated: "2026-11-27",
    en: {
      title: "Things to do in Roatán: the reef, beaches, nature and culture",
      description: "The best things to do in Roatán, Honduras: snorkel and dive the reef, West Bay and quieter beaches, wildlife parks, Garifuna Punta Gorda and the east end.",
      h1: "Things to do in Roatán, from the reef to the east end",
      intro: "Roatán is about 75 kilometres of green hills and beaches sitting on the edge of the Mesoamerican Reef. Most visitors see West Bay and West End and leave. Stay a little longer and the island opens up: quiet beaches, Garifuna villages, mangrove canals and some of the easiest diving in the Caribbean. Here is what is worth your time, grouped the way people who live here would plan it.",
      sections: [
        { h: "Snorkel or dive the reef", p: [
          "The Mesoamerican Reef is the largest barrier reef in the Western Hemisphere, and on Roatán it starts a short swim from the sand. Much of the west end is protected by the Roatán Marine Park, so the coral, turtles and reef fish are close to shore.",
          "You do not need a boat to see it. West Bay and Half Moon Bay in West End are the classic places to snorkel straight from the beach. For walls, wrecks and deeper sites, dive shops run boats every day; if you have never dived, a try dive or an open water course takes a few days and the water is warm all year.",
          "Divers who stay a week or more usually save by buying a package of dives instead of paying dive by dive, and residents often take a membership.",
        ] },
        { h: "Pick your beach", p: [
          "West Bay is the postcard: a long white beach with calm, clear water and resorts behind it. It is the busiest beach on the island, especially on cruise ship days.",
          "West End is the island's village of bars, dive shops and restaurants along a sand road, with Half Moon Bay at its edge. Sandy Bay, between West End and Coxen Hole, is quieter and more residential. On the far east end, Camp Bay is a long beach with almost nothing built on it, worth the drive if you have a car or jeep for the last stretch of road.",
          "Many beach clubs sell day passes or memberships with loungers, a pool, showers and food, which turns a beach day into something you can repeat without thinking about it.",
        ] },
        { h: "Get into the green: wildlife and gardens", p: [
          "Inland the island is steep and covered in forest. Carambola Botanical Gardens in Sandy Bay has trails through tropical plants up to a lookout over the reef. Near West Bay, Gumbalimba Park mixes a nature reserve with monkeys, parrots and a zip-line, and there are other zip-line and canopy tours along the hills.",
          "Iguanas are everywhere on the island, and the iguana farm near French Harbour is a popular stop for families.",
        ] },
        { h: "Garifuna culture in Punta Gorda", p: [
          "Punta Gorda, on the north coast, is the oldest Garifuna community in Honduras, settled at the end of the 18th century. Visit for the food, like hudut, a fish and coconut broth with mashed plantain, and for punta music and drumming. The anniversary of the Garifuna arrival, in April, is the biggest celebration of the year.",
        ] },
        { h: "The east end and Oak Ridge", p: [
          "East of French Harbour the island slows down. Oak Ridge is a fishing town of houses on stilts, and boat tours take you through the mangrove canals and tunnels around it. Further on, the road reaches Camp Bay and the small communities of the east end, where few visitors go.",
          "This is the half of Roatán where your own transport pays off. Taxis rarely wait for you out here, so most people rent a car or jeep for the day or the week.",
        ] },
        { h: "Slow down: wellness, food and evenings", p: [
          "After a few days of sun and salt water, many visitors book a massage or a spa session; studios on the island sell single sessions and packages. Gyms and yoga classes are easy to find in West End, West Bay and French Harbour.",
          "Evenings mean sunset on the west side, fresh fish and baleadas, and live music in West End. If you are staying in a house or apartment, a weekly meal plan from a local kitchen means you are not cooking or searching for dinner every night.",
        ] },
        { h: "One day from the cruise port", p: [
          "Ships dock at Mahogany Bay or at the Town Center port in Coxen Hole. With a day, most passengers pick one of three things: West Bay beach and snorkelling, a dive or snorkel trip, or a loop of the island with a wildlife park and a lookout. Watch the time: the island has one main road, and traffic towards West Bay builds up on busy port days.",
        ] },
        { h: "Staying a week or longer", p: [
          "The longer you stay, the more it makes sense to set things up by the week or month rather than pay as you go: a rental car, a dive package or club membership, a meal plan, a few massage sessions. On EverySub every business lists its plans with the price up front, and you pay by Lightning, Bitcoin, card or PayPal.",
          "The island is busiest from December to April. The wettest months are usually October to January, when showers come and go, and the sea can be rougher on the north side.",
        ] },
      ],
    },
    es: {
      title: "Qué hacer en Roatán: arrecife, playas, naturaleza y cultura",
      description: "Qué hacer en Roatán, Honduras: snorkel y buceo en el arrecife, West Bay y playas tranquilas, parques de naturaleza, Punta Gorda garífuna y el este de la isla.",
      h1: "Qué hacer en Roatán, del arrecife al este de la isla",
      intro: "Roatán son unos 75 kilómetros de colinas verdes y playas al borde del Arrecife Mesoamericano. La mayoría de los visitantes conoce West Bay y West End y se va. Si te quedas un poco más, la isla se abre: playas tranquilas, pueblos garífunas, canales de manglar y uno de los buceos más fáciles del Caribe. Esto es lo que vale la pena, ordenado como lo planearía alguien que vive aquí.",
      sections: [
        { h: "Snorkel o buceo en el arrecife", p: [
          "El Arrecife Mesoamericano es el arrecife de barrera más grande del hemisferio occidental, y en Roatán empieza a unos metros de la arena. Gran parte del oeste está protegido por el Roatán Marine Park, así que el coral, las tortugas y los peces están cerca de la orilla.",
          "No necesitas lancha para verlo. West Bay y Half Moon Bay, en West End, son los lugares clásicos para hacer snorkel desde la playa. Para paredes, naufragios y sitios más profundos, los centros de buceo salen en lancha todos los días; si nunca has buceado, una inmersión de prueba o un curso open water toma unos días y el agua está tibia todo el año.",
          "Quien se queda una semana o más suele ahorrar comprando un paquete de inmersiones en vez de pagar una por una, y los residentes muchas veces toman una membresía.",
        ] },
        { h: "Elige tu playa", p: [
          "West Bay es la postal: una playa larga de arena blanca con agua tranquila y clara, y hoteles detrás. Es la playa con más gente de la isla, sobre todo los días de crucero.",
          "West End es el pueblo de bares, centros de buceo y restaurantes a lo largo de una calle de arena, con Half Moon Bay en un extremo. Sandy Bay, entre West End y Coxen Hole, es más tranquila y residencial. En el extremo este, Camp Bay es una playa larga casi sin construcciones; vale la pena el viaje si tienes carro o jeep para el último tramo de camino.",
          "Muchos beach clubs venden pases de día o membresías con camastros, piscina, duchas y comida, y así un día de playa se vuelve algo que repites sin pensarlo.",
        ] },
        { h: "Naturaleza: fauna y jardines", p: [
          "Tierra adentro la isla es empinada y llena de bosque. Carambola Botanical Gardens, en Sandy Bay, tiene senderos entre plantas tropicales hasta un mirador sobre el arrecife. Cerca de West Bay, Gumbalimba Park combina una reserva natural con monos, loros y canopy, y hay otros tours de canopy en las colinas.",
          "Las iguanas están por toda la isla, y la granja de iguanas cerca de French Harbour es una parada popular para ir en familia.",
        ] },
        { h: "Cultura garífuna en Punta Gorda", p: [
          "Punta Gorda, en la costa norte, es la comunidad garífuna más antigua de Honduras, fundada a finales del siglo XVIII. Ve por la comida, como el hudut, un caldo de pescado y coco con plátano machacado, y por la punta y los tambores. El aniversario de la llegada garífuna, en abril, es la gran fiesta del año.",
        ] },
        { h: "El este de la isla y Oak Ridge", p: [
          "Al este de French Harbour la isla va más despacio. Oak Ridge es un pueblo pesquero de casas sobre pilotes, y hay recorridos en lancha por los canales y túneles de manglar. Más adelante, la carretera llega a Camp Bay y a las pequeñas comunidades del este, adonde van pocos visitantes.",
          "Es la mitad de Roatán donde conviene tener transporte propio. Por aquí casi no hay taxis esperando, así que la mayoría renta un carro o jeep por el día o la semana.",
        ] },
        { h: "Bajar el ritmo: bienestar, comida y noches", p: [
          "Después de unos días de sol y mar, muchos visitantes reservan un masaje o una sesión de spa; los estudios de la isla venden sesiones sueltas y paquetes. Hay gimnasios y clases de yoga en West End, West Bay y French Harbour.",
          "Las noches son atardecer en el oeste, pescado fresco y baleadas, y música en vivo en West End. Si te quedas en una casa o apartamento, un plan de comida semanal de una cocina local te ahorra cocinar o buscar cena cada noche.",
        ] },
        { h: "Un día desde el puerto de cruceros", p: [
          "Los barcos atracan en Mahogany Bay o en el puerto Town Center de Coxen Hole. Con un día, casi todos eligen una de tres cosas: playa y snorkel en West Bay, una salida de buceo o snorkel, o una vuelta a la isla con un parque de naturaleza y un mirador. Cuida el tiempo: la isla tiene una sola carretera principal y el tráfico hacia West Bay crece los días de muchos barcos.",
        ] },
        { h: "Si te quedas una semana o más", p: [
          "Cuanto más tiempo te quedas, más conviene organizar las cosas por semana o por mes en vez de pagar suelto: un carro rentado, un paquete de buceo o membresía de club, un plan de comida, unas sesiones de masaje. En EverySub cada negocio muestra sus planes con el precio por adelantado, y pagas con Lightning, Bitcoin, tarjeta o PayPal.",
          "La isla tiene más movimiento de diciembre a abril. Los meses más lluviosos suelen ser de octubre a enero, con chubascos que van y vienen, y el mar puede estar más picado en la costa norte.",
        ] },
      ],
    },
  },
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
    slug: "renting-a-car-in-roatan",
    services: ["vehicles"],
    updated: "2026-11-27",
    en: {
      title: "Renting a car in Roatán: licence, insurance and deposit",
      description: "What you need to rent a car, jeep or scooter in Roatán: driver's licence, insurance, refundable deposit, the pick-up check and driving on the island.",
      h1: "Renting a car in Roatán: what to know before you book",
      intro: "Deciding to rent is the easy part. Then come the questions people actually search: is my licence valid here, what does the insurance cover, why is there a deposit, and what are the roads like? This guide answers them in the order you will meet them, from booking to giving the keys back.",
      sections: [
        { h: "What you need to rent", p: [
          "Bring a valid driver's licence from home and your passport. Visitors in Honduras generally drive on their home licence during a tourist stay. An International Driving Permit is not a licence on its own, only a translation of yours, but it helps if your licence is not written in the Latin alphabet. If you are moving to the island for good, ask about getting a Honduran licence.",
          "Each rental company sets its own rules on minimum age and on who may drive. Anyone else who will drive should be added as a second driver, which is usually an extra on the booking.",
        ] },
        { h: "Insurance: what to check", p: [
          "Every rental company on the island has its own insurance, so compare it, not just the daily rate. On EverySub each company lists its insurance options on the booking, from no upgrade to fuller cover, with the price shown before you pay.",
          "Before you choose, ask what the excess (deductible) is, and whether tyres, glass, the underside of the car and water damage are covered. Those are the parts most at risk on unpaved side roads and in heavy rain.",
        ] },
        { h: "The refundable deposit", p: [
          "Many rentals require a refundable deposit, which is returned once the vehicle comes back as agreed. It covers things like an empty tank, a parking ticket or damage below the excess. Ask how much it is, how it is taken and how quickly it comes back, and keep the receipt.",
        ] },
        { h: "Extras worth adding", p: [
          "Common extras are a second driver, a child seat and a GPS, priced per day or once per rental. Phone maps work on most of the island, but offline maps are useful on the east end, where signal can drop.",
        ] },
        { h: "Car, jeep or scooter", p: [
          "A small car covers West Bay, West End, Sandy Bay, Coxen Hole and French Harbour on the main road. A jeep or SUV is worth it for steep or unpaved side roads, the east end, and anything with luggage or dive gear. A scooter is cheap and easy to park, but suits riders with experience: the road has hills, sudden showers and fast traffic.",
        ] },
        { h: "The pick-up check", p: [
          "Take five minutes at the handover. Walk around the vehicle with the agent and photograph every scratch and dent, the tyres and the windscreen. Check that the fuel level is written down, that the registration and insurance papers are in the car, and that the lights, wipers and air conditioning work. Return the car with the same fuel level to avoid a refuelling charge.",
        ] },
        { h: "Driving on Roatán", p: [
          "Traffic drives on the right. One main road runs the length of the island, and almost everything you need is on it or a short turn off it. Expect speed bumps through every village, potholes after rain, steep driveways and people, dogs and scooters at the edge of the road.",
          "If you are new to the island, drive the side roads in daylight and leave extra time on busy cruise ship days, when traffic builds towards West Bay. Fill up in the towns along the main road before heading to the east end.",
        ] },
        { h: "By the day, week or month", p: [
          "Companies price by the day and give lower weekly and monthly rates. On EverySub those rates cap the total, so a longer rental never costs more than the week or month price for the same days. Where a company delivers, you choose the area at booking and see the delivery fee before you pay; otherwise you collect the car at its office.",
          "An unpaid booking can be cancelled from your bookings. To change a paid one, message the rental company or EverySub support. You pay by Lightning, Bitcoin, card or PayPal.",
        ] },
      ],
    },
    es: {
      title: "Rentar carro en Roatán: licencia, seguro y depósito",
      description: "Qué necesitas para rentar carro, jeep o moto en Roatán: licencia, seguro, depósito reembolsable, la revisión al recibirlo y cómo manejar en la isla.",
      h1: "Rentar carro en Roatán: lo que debes saber antes de reservar",
      intro: "Decidir rentar es lo fácil. Luego vienen las preguntas que la gente busca de verdad: ¿mi licencia sirve aquí?, ¿qué cubre el seguro?, ¿por qué hay un depósito?, ¿cómo son las carreteras? Esta guía las responde en el orden en que aparecen, desde la reserva hasta devolver las llaves.",
      sections: [
        { h: "Qué necesitas para rentar", p: [
          "Lleva una licencia de conducir vigente de tu país y tu pasaporte. En Honduras los visitantes por lo general manejan con la licencia de su país durante su estancia como turistas. El permiso internacional de conducir no es una licencia por sí solo, solo una traducción de la tuya, pero ayuda si tu licencia no está escrita en alfabeto latino. Si te mudas a la isla, pregunta por sacar la licencia hondureña.",
          "Cada empresa de renta pone sus propias reglas sobre edad mínima y quién puede manejar. Cualquier otra persona que vaya a manejar debe agregarse como segundo conductor, que suele ser un extra de la reserva.",
        ] },
        { h: "Seguro: qué revisar", p: [
          "Cada empresa de renta en la isla tiene su propio seguro, así que compáralo, no solo la tarifa diaria. En EverySub cada empresa muestra sus opciones de seguro en la reserva, desde sin mejora hasta una cobertura más completa, con el precio antes de pagar.",
          "Antes de elegir, pregunta cuál es el deducible y si cubre llantas, vidrios, la parte de abajo del carro y daños por agua. Son las partes con más riesgo en caminos de tierra y con lluvias fuertes.",
        ] },
        { h: "El depósito reembolsable", p: [
          "Muchas rentas piden un depósito reembolsable, que se devuelve cuando el vehículo regresa como se acordó. Cubre cosas como el tanque vacío, una multa o daños por debajo del deducible. Pregunta cuánto es, cómo se toma y en cuánto tiempo se devuelve, y guarda el comprobante.",
        ] },
        { h: "Extras que valen la pena", p: [
          "Los extras más comunes son segundo conductor, silla para niños y GPS, con precio por día o una vez por renta. Los mapas del teléfono funcionan en casi toda la isla, pero conviene bajar mapas sin conexión para el este, donde la señal puede fallar.",
        ] },
        { h: "Carro, jeep o moto", p: [
          "Un carro pequeño basta para West Bay, West End, Sandy Bay, Coxen Hole y French Harbour por la carretera principal. Un jeep o SUV vale la pena para caminos empinados o de tierra, el este de la isla y cualquier viaje con equipaje o equipo de buceo. La moto es barata y fácil de estacionar, pero conviene a conductores con experiencia: la carretera tiene cuestas, lluvias repentinas y tráfico rápido.",
        ] },
        { h: "La revisión al recibirlo", p: [
          "Tómate cinco minutos en la entrega. Rodea el vehículo con el agente y fotografía cada rayón y golpe, las llantas y el parabrisas. Revisa que anoten el nivel de combustible, que la tarjeta de circulación y los papeles del seguro estén en el carro, y que funcionen las luces, los limpiaparabrisas y el aire acondicionado. Devuélvelo con el mismo nivel de combustible para evitar un cargo por llenado.",
        ] },
        { h: "Manejar en Roatán", p: [
          "Se maneja por la derecha. Una carretera principal recorre la isla de punta a punta, y casi todo lo que necesitas está en ella o a una vuelta. Espera túmulos en cada pueblo, baches después de la lluvia, entradas empinadas y gente, perros y motos a la orilla del camino.",
          "Si eres nuevo en la isla, maneja los caminos secundarios de día y deja tiempo extra los días de muchos cruceros, cuando el tráfico crece hacia West Bay. Llena el tanque en los pueblos de la carretera principal antes de ir al este.",
        ] },
        { h: "Por día, semana o mes", p: [
          "Las empresas cobran por día y dan tarifas más bajas por semana y por mes. En EverySub esas tarifas limitan el total: una renta más larga nunca cuesta más que la semana o el mes por los mismos días. Si la empresa hace entregas, eliges la zona al reservar y ves el costo de entrega antes de pagar; si no, recoges el carro en su oficina.",
          "Una reserva sin pagar se cancela desde tus reservas. Para cambiar una pagada, escribe a la empresa de renta o al soporte de EverySub. Pagas con Lightning, Bitcoin, tarjeta o PayPal.",
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
  "things-to-do-in-roatan": {
    en: {
      takeaways: [
        "The reef starts a short swim from West Bay and Half Moon Bay, so you can snorkel without a boat.",
        "West Bay is the busiest beach; Sandy Bay and Camp Bay on the east end are much quieter.",
        "Punta Gorda is the oldest Garifuna community in Honduras.",
        "Staying a week or more? Dive packages, club memberships and weekly rentals cost less than paying day by day.",
      ],
      faq: [
        { q: "What is Roatán known for?", a: "The Mesoamerican Reef, which makes it one of the easiest and cheapest places in the Caribbean to snorkel and learn to dive, and West Bay beach." },
        { q: "Can you snorkel from the beach on Roatán?", a: "Yes. West Bay and Half Moon Bay in West End both have reef a short swim from the sand." },
        { q: "How many days do you need on Roatán?", a: "Three or four days cover the reef, a beach and a wildlife park. With a week you can add the east end, Punta Gorda, Oak Ridge and a few dives." },
        { q: "What can I do on Roatán in one cruise day?", a: "Pick one: West Bay beach and snorkelling, a dive or snorkel trip, or an island loop with a wildlife park. Leave time to get back, as traffic builds on busy port days." },
      ],
    },
    es: {
      takeaways: [
        "El arrecife empieza a unos metros de West Bay y Half Moon Bay: puedes hacer snorkel sin lancha.",
        "West Bay es la playa con más gente; Sandy Bay y Camp Bay, en el este, son mucho más tranquilas.",
        "Punta Gorda es la comunidad garífuna más antigua de Honduras.",
        "¿Te quedas una semana o más? Paquetes de buceo, membresías y rentas semanales cuestan menos que pagar día a día.",
      ],
      faq: [
        { q: "¿Por qué es famosa Roatán?", a: "Por el Arrecife Mesoamericano, que la hace uno de los lugares más fáciles y económicos del Caribe para hacer snorkel y aprender a bucear, y por la playa de West Bay." },
        { q: "¿Se puede hacer snorkel desde la playa en Roatán?", a: "Sí. En West Bay y en Half Moon Bay, en West End, el arrecife está a unos metros de la arena." },
        { q: "¿Cuántos días necesito en Roatán?", a: "Con tres o cuatro días ves el arrecife, una playa y un parque de naturaleza. Con una semana puedes sumar el este, Punta Gorda, Oak Ridge y algunas inmersiones." },
        { q: "¿Qué hacer en Roatán en un día de crucero?", a: "Elige una cosa: playa y snorkel en West Bay, una salida de buceo o snorkel, o una vuelta a la isla con un parque de naturaleza. Deja tiempo para volver, porque el tráfico crece los días de muchos barcos." },
      ],
    },
  },
  "renting-a-car-in-roatan": {
    en: {
      takeaways: [
        "Bring your home driver's licence and passport; an International Driving Permit only translates your licence.",
        "Compare insurance, not only the daily rate: ask about the excess, tyres, glass and the underside.",
        "Photograph the car and note the fuel level at pick-up.",
        "Weekly and monthly rates cap the price, so a longer rental never costs more than the week or month.",
      ],
      faq: [
        { q: "Do I need an International Driving Permit in Roatán?", a: "Visitors generally drive on a valid licence from home during a tourist stay. A permit is only a translation, useful if your licence is not in the Latin alphabet. Each rental company sets its own requirements." },
        { q: "Is insurance included when I rent a car in Roatán?", a: "Each rental company has its own insurance. On EverySub its options and their prices are shown on the booking before you pay." },
        { q: "Why is there a deposit?", a: "Many rentals take a refundable deposit, returned once the vehicle comes back as agreed. It covers things like fuel or small damage." },
        { q: "Which side of the road do they drive on in Roatán?", a: "On the right, as in the rest of Honduras." },
      ],
    },
    es: {
      takeaways: [
        "Lleva la licencia de tu país y tu pasaporte; el permiso internacional solo traduce tu licencia.",
        "Compara el seguro, no solo la tarifa diaria: pregunta por el deducible, llantas, vidrios y la parte de abajo.",
        "Fotografía el carro y anota el combustible al recibirlo.",
        "Las tarifas semanales y mensuales limitan el precio: una renta larga nunca cuesta más que la semana o el mes.",
      ],
      faq: [
        { q: "¿Necesito permiso internacional para manejar en Roatán?", a: "Los visitantes por lo general manejan con una licencia vigente de su país durante su estancia como turistas. El permiso es solo una traducción, útil si tu licencia no está en alfabeto latino. Cada empresa pone sus propios requisitos." },
        { q: "¿La renta de carro en Roatán incluye seguro?", a: "Cada empresa de renta tiene su propio seguro. En EverySub sus opciones y precios se ven en la reserva antes de pagar." },
        { q: "¿Por qué piden un depósito?", a: "Muchas rentas toman un depósito reembolsable, que se devuelve cuando el vehículo regresa como se acordó. Cubre cosas como combustible o daños pequeños." },
        { q: "¿De qué lado se maneja en Roatán?", a: "Por la derecha, como en el resto de Honduras." },
      ],
    },
  },
};

export const guideExtras = (slug: string, lang: "en" | "es"): GuideExtras | null => GUIDE_EXTRAS[slug]?.[lang] ?? null;

export const guideBySlug = (slug: string | undefined) => GUIDES.find((g) => g.slug === slug) ?? null;

export const GUIDES_INDEX = {
  en: {
    title: "Roatán guides — living, getting around and services",
    description: "Practical guides to Roatán: things to do, moving to the island, renting a car, getting around, cleaning, meal plans, diving and what services cost.",
    h1: "Guides to life on Roatán",
    intro: "Short, practical answers to the questions people ask before they move to, or stay a while on, Roatán.",
    more: "Plans you can sign up for",
    updated: "Updated",
    all: "All guides",
  },
  es: {
    title: "Guías de Roatán — vivir, moverse y servicios",
    description: "Guías prácticas de Roatán: qué hacer, mudarse a la isla, rentar carro, moverse, limpieza, planes de comida, buceo y cuánto cuestan los servicios.",
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
