// ============================================================
// CUSTOMER PORTAL PROTOTYPE FIXTURES
// ============================================================
// Presentation-ready mock data for the customer traveler portal.
// All data represents ONE customer only (self-scope safety).
// No tenant/customer selector exists in the customer portal.
//
// Shares the same presentation story as apps/agency's fixtures
// (Lucas Martins / Horizonte Viagens / Portugal family trip) so the
// staff and traveler experiences read as one coherent demo. IDs
// (trip-001, prop-001, bk-001) intentionally match apps/agency's
// fixtures.ts entities for the same conceptual records.
// ============================================================

export interface FixtureTrip {
  id: string;
  name: string;
  destination: string;
  description: string;
  startDate: string;
  endDate: string;
  status: 'PLANNED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  travelers: string[];
  heroImage: string;
  itinerary: ItineraryDay[];
  hotel: HotelInfo;
  transport: TransportInfo;
  activities: Activity[];
}

export interface ItineraryDay {
  day: number;
  date: string;
  title: string;
  description: string;
  highlights: string[];
}

export interface HotelInfo {
  name: string;
  address: string;
  checkIn: string;
  checkOut: string;
  roomType: string;
  amenities: string[];
}

export interface TransportInfo {
  outbound: FlightInfo;
  returnFlight: FlightInfo | null;
  localTransfers: string[];
}

export interface FlightInfo {
  airline: string;
  flightNumber: string;
  departure: string;
  arrival: string;
  origin: string;
  destination: string;
  seatClass: string;
}

export interface Activity {
  id: string;
  name: string;
  date: string;
  time: string;
  duration: string;
  location: string;
  description: string;
  included: boolean;
}

export interface FixtureProposal {
  id: string;
  tripName: string;
  destination: string;
  total: number;
  proposedPrice: number;
  discount: number;
  validUntil: string;
  conditions: string;
  status: 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  createdAt: string;
  includes: string[];
}

export interface FixtureBooking {
  id: string;
  tripName: string;
  origin: string;
  destination: string;
  productName: string;
  departureAt: string;
  arrivalAt: string;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  passengerCount: number;
  status: 'CONFIRMED' | 'PENDING' | 'CANCELLED';
  isFuture: boolean;
  passengers: FixturePassenger[];
}

export interface FixturePassenger {
  id: string;
  name: string;
  documentType: string;
  documentLastDigits: string;
}

// ============================================================
// MOCK DATA - SINGLE CUSTOMER (Lucas Martins, Horizonte Viagens)
// ============================================================

export const FIXTURE_CUSTOMER = {
  id: 'cust-001',
  name: 'Lucas Martins',
  email: 'lucas.martins@email.com',
  phone: '(11) 99876-5432',
  cpfMasked: '***.456.789-**',
  passportMasked: '***5678',
  address: {
    street: 'Rua Augusta',
    number: '1234',
    complement: 'Apto 42',
    neighborhood: 'Jardins',
    city: 'São Paulo',
    state: 'SP',
    zipCode: '01412-000',
  },
};

export const FIXTURE_AGENCY = {
  name: 'Horizonte Viagens',
  phone: '(11) 3456-7890',
  email: 'contato@horizonteviagens.com.br',
};

export const FIXTURE_TRIPS: FixtureTrip[] = [
  {
    id: 'trip-001',
    name: 'Família Martins — Portugal',
    destination: 'Portugal',
    description:
      'Rota cultural por Portugal: Lisboa, Sintra e Porto, com degustação de vinhos no Vale do Douro e experiências gastronômicas pensadas para toda a família.',
    startDate: '2026-10-15',
    endDate: '2026-10-28',
    status: 'CONFIRMED',
    travelers: ['Lucas Martins', 'Mariana Martins', 'Rafael Martins', 'Juliana Martins'],
    heroImage: '🇵🇹',
    itinerary: [
      {
        day: 1,
        date: '2026-10-15',
        title: 'Chegada a Lisboa',
        description: 'Transfer privativo do aeroporto e check-in. Passeio pelo bairro de Alfama.',
        highlights: ['Transfer aeroporto', 'Fado à noite'],
      },
      {
        day: 2,
        date: '2026-10-16',
        title: 'Lisboa histórica',
        description: 'Visita ao Mosteiro dos Jerónimos, Torre de Belém e pastéis de Belém.',
        highlights: ['Torre de Belém', 'Pastéis de nata'],
      },
      {
        day: 3,
        date: '2026-10-17',
        title: 'Sintra em família',
        description: 'Passeio de trem até Sintra. Palácio da Pena e Quinta da Regaleira.',
        highlights: ['Palácio da Pena', 'Poço Iniciático'],
      },
      {
        day: 4,
        date: '2026-10-19',
        title: 'Rumo ao Porto',
        description: 'Trem Alfa Pendular para Porto. Check-in no hotel no centro histórico.',
        highlights: ['Alfa Pendular', 'Ribeira do Porto'],
      },
      {
        day: 5,
        date: '2026-10-21',
        title: 'Vale do Douro',
        description: 'Excursão ao Vale do Douro com degustação de vinhos em duas vinícolas.',
        highlights: ['Degustação de vinhos', 'Paisagem do Douro'],
      },
    ],
    hotel: {
      name: 'Hotel Alfama Rio (Lisboa) · Hotel Ribeira Collection (Porto)',
      address: 'Alfama, Lisboa + Ribeira, Porto',
      checkIn: '2026-10-15 14:00',
      checkOut: '2026-10-28 12:00',
      roomType: 'Duas suítes família com café da manhã',
      amenities: ['Café da manhã', 'Wi-Fi', 'Localização central', 'Piscina (Lisboa)'],
    },
    transport: {
      outbound: {
        airline: 'LATAM',
        flightNumber: 'LA 8084',
        departure: '2026-10-15 08:30',
        arrival: '2026-10-15 18:45',
        origin: 'São Paulo (GRU)',
        destination: 'Lisboa (LIS)',
        seatClass: 'Econômica Premium',
      },
      returnFlight: {
        airline: 'LATAM',
        flightNumber: 'LA 8085',
        departure: '2026-10-28 20:00',
        arrival: '2026-10-29 06:15',
        origin: 'Lisboa (LIS)',
        destination: 'São Paulo (GRU)',
        seatClass: 'Econômica Premium',
      },
      localTransfers: ['Transfer aeroporto ↔ hotel', 'Trem Alfa Pendular Lisboa ↔ Porto'],
    },
    activities: [
      {
        id: 'act-001',
        name: 'Degustação de Vinhos no Douro',
        date: '2026-10-21',
        time: '09:00',
        duration: '6 horas',
        location: 'Vale do Douro',
        description: 'Excursão guiada com degustação em duas vinícolas tradicionais.',
        included: true,
      },
      {
        id: 'act-002',
        name: 'Palácio da Pena',
        date: '2026-10-17',
        time: '10:00',
        duration: '3 horas',
        location: 'Sintra',
        description: 'Visita guiada ao Palácio da Pena e à Quinta da Regaleira.',
        included: true,
      },
      {
        id: 'act-003',
        name: 'Tour Gastronômico no Porto',
        date: '2026-10-22',
        time: '18:00',
        duration: '3 horas',
        location: 'Porto',
        description: 'Degustação de francesinha, bacalhau à brás e vinho do Porto.',
        included: true,
      },
    ],
  },
  {
    id: 'trip-005',
    name: 'Família Martins — Islândia',
    destination: 'Islândia',
    description: 'Aurora boreal e natureza. Mesma família da viagem de Portugal.',
    startDate: '2027-06-01',
    endDate: '2027-06-10',
    status: 'PLANNED',
    travelers: ['Lucas Martins', 'Mariana Martins', 'Rafael Martins', 'Juliana Martins'],
    heroImage: '🌋',
    itinerary: [
      {
        day: 1,
        date: '2027-06-01',
        title: 'Chegada a Reykjavík',
        description: 'Transfer para o hotel e primeira noite na capital.',
        highlights: ['Reykjavík', 'Lagoa Azul'],
      },
    ],
    hotel: {
      name: 'Hotel Reykjavík Centro',
      address: 'Centro, Reykjavík',
      checkIn: '2027-06-01 15:00',
      checkOut: '2027-06-10 11:00',
      roomType: 'Suíte família',
      amenities: ['Café da manhã', 'Wi-Fi'],
    },
    transport: {
      outbound: {
        airline: 'TAP',
        flightNumber: 'TP 5040',
        departure: '2027-06-01 22:00',
        arrival: '2027-06-02 14:30',
        origin: 'São Paulo (GRU)',
        destination: 'Reykjavík (KEF)',
        seatClass: 'Econômica Premium',
      },
      returnFlight: null,
      localTransfers: ['Transfer aeroporto ↔ hotel'],
    },
    activities: [],
  },
];

export const FIXTURE_PROPOSALS: FixtureProposal[] = [
  {
    id: 'prop-001',
    tripName: 'Família Martins — Portugal',
    destination: 'Portugal',
    total: 35000,
    proposedPrice: 38500,
    discount: 3500,
    validUntil: '2026-09-15',
    conditions: 'Sujeito à disponibilidade de voos e hotéis. Crianças com desconto especial.',
    status: 'ACCEPTED',
    createdAt: '2026-07-10',
    includes: [
      'Passagens aéreas ida e volta (Econômica Premium)',
      '13 noites entre Lisboa e Porto',
      'Transfer aeroporto e trem Lisboa-Porto',
      'Degustação de vinhos no Vale do Douro',
      'Visita ao Palácio da Pena em Sintra',
      'Tour gastronômico no Porto',
      'Café da manhã incluso',
    ],
  },
];

export const FIXTURE_BOOKINGS: FixtureBooking[] = [
  {
    id: 'bk-001',
    tripName: 'Família Martins — Portugal',
    origin: 'São Paulo',
    destination: 'Portugal',
    productName: 'Pacote Portugal em Família 13 Noites',
    departureAt: '2026-10-15T08:30:00Z',
    arrivalAt: '2026-10-15T18:45:00Z',
    tripType: 'ROUND_TRIP',
    passengerCount: 4,
    status: 'CONFIRMED',
    isFuture: true,
    passengers: [
      {
        id: 'bp-001',
        name: 'Lucas Martins',
        documentType: 'Passaporte',
        documentLastDigits: '5678',
      },
      {
        id: 'bp-002',
        name: 'Mariana Martins',
        documentType: 'Passaporte',
        documentLastDigits: '1234',
      },
      {
        id: 'bp-003',
        name: 'Rafael Martins',
        documentType: 'Passaporte',
        documentLastDigits: '4321',
      },
      {
        id: 'bp-004',
        name: 'Juliana Martins',
        documentType: 'Passaporte',
        documentLastDigits: '8765',
      },
    ],
  },
];
