// ============================================================
// CUSTOMER PORTAL PROTOTYPE FIXTURES
// ============================================================
// Presentation-ready mock data for the customer traveler portal.
// All data represents ONE customer only (self-scope safety).
// No tenant/customer selector exists in the customer portal.
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
// MOCK DATA - SINGLE CUSTOMER (Maria Silva)
// ============================================================

export const FIXTURE_CUSTOMER = {
  id: 'customer-maria-001',
  name: 'Maria Silva',
  email: 'maria.silva@email.com',
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
  name: 'Agência Viagem dos Sonhos',
  phone: '(11) 3456-7890',
  email: 'contato@viagemdossonhos.com.br',
};

export const FIXTURE_TRIPS: FixtureTrip[] = [
  {
    id: 'trip-001',
    name: 'Maldivas - Paraíso Tropical',
    destination: 'Maldivas',
    description:
      'Uma semana de pura relaxação nas águas cristalinas do Oceano Índico. Resorts de luxo, mergulho com tubarões-baleia e pôr do sol incríveis.',
    startDate: '2026-09-15',
    endDate: '2026-09-22',
    status: 'CONFIRMED',
    travelers: ['Maria Silva', 'João Silva'],
    heroImage: '🏝️',
    itinerary: [
      {
        day: 1,
        date: '2026-09-15',
        title: 'Chegada ao Paraíso',
        description: 'Transfer de hidroavião para o resort. Acomodação na vila sobre a água.',
        highlights: ['Hidroavião panorâmico', 'Vila sobre a água', 'Welcome dinner'],
      },
      {
        day: 2,
        date: '2026-09-16',
        title: 'Mergulho e Praia',
        description: 'Mergulho com tubarões-baleia pela manhã. Tarde livre na praia privativa.',
        highlights: ['Mergulho guiado', 'Tubarões-baleia', 'Praia privativa'],
      },
      {
        day: 3,
        date: '2026-09-17',
        title: 'Passeio de Barco',
        description: 'Passeio de barco para observação de golfinhos e pôr do sol.',
        highlights: ['Golfinhos', 'Pôr do sol', 'Jantar no barco'],
      },
    ],
    hotel: {
      name: 'Soneva Fushi Resort',
      address: 'Baa Atoll, Maldivas',
      checkIn: '2026-09-15 14:00',
      checkOut: '2026-09-22 12:00',
      roomType: 'Villa sobre a água com piscina',
      amenities: ['Piscina privativa', 'Spa', 'Restaurante', 'Wi-Fi', 'Mergulho'],
    },
    transport: {
      outbound: {
        airline: 'Emirates',
        flightNumber: 'EK 261',
        departure: '2026-09-15 08:30',
        arrival: '2026-09-15 18:45',
        origin: 'São Paulo (GRU)',
        destination: 'Malé (MLE)',
        seatClass: 'Executiva',
      },
      returnFlight: {
        airline: 'Emirates',
        flightNumber: 'EK 262',
        departure: '2026-09-22 20:00',
        arrival: '2026-09-23 06:15',
        origin: 'Malé (MLE)',
        destination: 'São Paulo (GRU)',
        seatClass: 'Executiva',
      },
      localTransfers: ['Hidroavião resort ↔ aeroporto'],
    },
    activities: [
      {
        id: 'act-001',
        name: 'Mergulho com Tubarões-Baleia',
        date: '2026-09-16',
        time: '08:00',
        duration: '3 horas',
        location: 'Hanifaru Bay',
        description: 'Mergulho guiado para observar tubarões-baleia e raias-manta.',
        included: true,
      },
      {
        id: 'act-002',
        name: 'Passeio de Barco ao Pôr do Sol',
        date: '2026-09-17',
        time: '17:00',
        duration: '2 horas',
        location: 'Baa Atoll',
        description: 'Passeio romântico com observação de golfinhos.',
        included: true,
      },
      {
        id: 'act-003',
        name: 'Spa & Wellness',
        date: '2026-09-18',
        time: '10:00',
        duration: '2 horas',
        location: 'Resort Spa',
        description: 'Massagem tradicional e tratamento corporal.',
        included: true,
      },
    ],
  },
  {
    id: 'trip-002',
    name: 'Europa - Cidades Históricas',
    destination: 'Europa',
    description: 'Roma, Florença e Veneza. Arte, história e gastronomia italiana.',
    startDate: '2026-12-10',
    endDate: '2026-12-20',
    status: 'PLANNED',
    travelers: ['Maria Silva'],
    heroImage: '🏛️',
    itinerary: [
      {
        day: 1,
        date: '2026-12-10',
        title: 'Roma - Coliseu',
        description: 'Visita ao Coliseu e Fórum Romano.',
        highlights: ['Coliseu', 'Fórom Romano', 'Fontana di Trevi'],
      },
    ],
    hotel: {
      name: 'Hotel de Roma',
      address: 'Centro Histórico, Roma',
      checkIn: '2026-12-10 15:00',
      checkOut: '2026-12-14 11:00',
      roomType: 'Suíte Premium',
      amenities: ['Café da manhã', 'Wi-Fi', 'Localização central'],
    },
    transport: {
      outbound: {
        airline: 'LATAM',
        flightNumber: 'LA 8080',
        departure: '2026-12-10 22:00',
        arrival: '2026-12-11 14:30',
        origin: 'São Paulo (GRU)',
        destination: 'Roma (FCO)',
        seatClass: 'Executiva',
      },
      returnFlight: null,
      localTransfers: ['Transfer aeroporto ↔ hotel'],
    },
    activities: [],
  },
];

export const FIXTURE_PROPOSALS: FixtureProposal[] = [
  {
    id: 'proposal-001',
    tripName: 'Maldivas - Paraíso Tropical',
    destination: 'Maldivas',
    total: 28500,
    proposedPrice: 26800,
    discount: 1700,
    validUntil: '2026-09-10',
    conditions: 'Pagamento parcelado em até 6x sem juros. Cancellation free até 30 dias antes.',
    status: 'SENT',
    createdAt: '2026-08-20',
    includes: [
      'Passagens aéreas ida e volta (Executiva)',
      '7 noites em vila sobre a água',
      'Transfer hidroavião ida e volta',
      'Mergulho com tubarões-baleia',
      'Passeio de barco ao pôr do sol',
      'Spa & Wellness',
      'Café da manhã e jantar inclusos',
    ],
  },
];

export const FIXTURE_BOOKINGS: FixtureBooking[] = [
  {
    id: 'booking-001',
    tripName: 'Maldivas - Paraíso Tropical',
    origin: 'São Paulo',
    destination: 'Maldivas',
    productName: 'Pacote Maldivas 7 Noites',
    departureAt: '2026-09-15T08:30:00Z',
    arrivalAt: '2026-09-15T18:45:00Z',
    tripType: 'ROUND_TRIP',
    passengerCount: 2,
    status: 'CONFIRMED',
    isFuture: true,
    passengers: [
      {
        id: 'pax-001',
        name: 'Maria Silva',
        documentType: 'Passaporte',
        documentLastDigits: '5678',
      },
      {
        id: 'pax-002',
        name: 'João Silva',
        documentType: 'Passaporte',
        documentLastDigits: '1234',
      },
    ],
  },
];
