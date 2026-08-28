import type { Customer } from '../types/customer';
import type { Wish } from '../types/wish';
import type { Trip } from '../types/trip';
import type { Proposal } from '../types/proposal';
import type { Booking, BookingPassenger } from '../types/booking';

export const AGENCY_ID = 'agency-demo-001';

// ============================================================
// CUSTOMERS
// ============================================================

export const customers: Customer[] = [
  {
    id: 'cust-001',
    agencyId: AGENCY_ID,
    name: 'Lucas Martins',
    email: 'lucas.martins@email.com',
    phone: '(11) 99876-5432',
    cpf: '***.456.789-**',
    notes: 'Cliente VIP, viaja em família anualmente. Prefere hotéis 4+ estrelas.',
    status: 'ACTIVE',
    createdAt: '2024-03-15T10:00:00.000Z',
    updatedAt: '2026-08-10T14:30:00.000Z',
  },
  {
    id: 'cust-002',
    agencyId: AGENCY_ID,
    name: 'Ana Beatriz Souza',
    email: 'ana.souza@email.com',
    phone: '(21) 98765-4321',
    cpf: '***.123.456-**',
    notes: 'Viajante frequente, interessada em Europa e Asia.',
    status: 'ACTIVE',
    createdAt: '2024-06-20T08:00:00.000Z',
    updatedAt: '2026-07-22T09:15:00.000Z',
  },
  {
    id: 'cust-003',
    agencyId: AGENCY_ID,
    name: 'Ricardo Oliveira',
    email: 'ricardo.oliveira@email.com',
    phone: '(31) 97654-3210',
    cpf: '***.987.654-**',
    notes: 'Primeira viagem internacional. Interesse em pacotes all-inclusive.',
    status: 'ACTIVE',
    createdAt: '2025-01-10T12:00:00.000Z',
    updatedAt: '2026-08-05T16:45:00.000Z',
  },
  {
    id: 'cust-004',
    agencyId: AGENCY_ID,
    name: 'Fernanda Costa',
    email: 'fernanda.costa@email.com',
    phone: '(11) 96543-2109',
    status: 'ACTIVE',
    createdAt: '2025-04-05T11:00:00.000Z',
    updatedAt: '2026-08-20T10:00:00.000Z',
  },
  {
    id: 'cust-005',
    agencyId: AGENCY_ID,
    name: 'Pedro Henrique Almeida',
    email: 'pedro.almeida@email.com',
    phone: '(41) 95432-1098',
    cpf: '***.321.654-**',
    notes: 'Viaja a trabalho e lazer. Perfil corporativo e familiar.',
    status: 'INACTIVE',
    createdAt: '2023-11-18T09:00:00.000Z',
    updatedAt: '2026-03-10T08:30:00.000Z',
  },
];

// ============================================================
// WISHES
// ============================================================

export const wishes: Wish[] = [
  {
    id: 'wish-001',
    agencyId: AGENCY_ID,
    customerId: 'cust-001',
    destination: 'Portugal (Lisboa + Porto)',
    startDate: '2026-10-15T00:00:00.000Z',
    endDate: '2026-10-28T00:00:00.000Z',
    budget: 35000,
    travelersCount: 4,
    notes: 'Família com 2 filhos (8 e 12 anos). Querem explorar cultura, gastronomia e vinícolas do Douro.',
    status: 'PROPOSED',
    createdAt: '2026-06-20T10:00:00.000Z',
    updatedAt: '2026-07-15T14:00:00.000Z',
  },
  {
    id: 'wish-002',
    agencyId: AGENCY_ID,
    customerId: 'cust-002',
    destination: 'Grécia (Atenas + Santorini)',
    startDate: '2026-09-01T00:00:00.000Z',
    endDate: '2026-09-14T00:00:00.000Z',
    budget: 28000,
    travelersCount: 2,
    notes: 'Lua de mel adiada. Querem ilhas e ruins históricas.',
    status: 'MATCHED',
    createdAt: '2026-05-10T09:00:00.000Z',
    updatedAt: '2026-07-22T11:00:00.000Z',
  },
  {
    id: 'wish-003',
    agencyId: AGENCY_ID,
    customerId: 'cust-003',
    destination: 'Cancún, México',
    startDate: '2026-12-20T00:00:00.000Z',
    endDate: '2026-12-27T00:00:00.000Z',
    budget: 18000,
    travelersCount: 2,
    notes: 'Primeira viagem internacional. Interesse em resort all-inclusive e passeios arqueológicos.',
    status: 'ACTIVE',
    createdAt: '2026-08-01T14:00:00.000Z',
    updatedAt: '2026-08-05T16:45:00.000Z',
  },
  {
    id: 'wish-004',
    agencyId: AGENCY_ID,
    customerId: 'cust-004',
    destination: 'Japão (Tóquio + Kyoto)',
    startDate: '2027-03-20T00:00:00.000Z',
    endDate: '2027-04-02T00:00:00.000Z',
    budget: 45000,
    travelersCount: 2,
    notes: 'Cherry blossom season. Interesse em cultura japonesa, culinária e tecnologia.',
    status: 'ACTIVE',
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-20T10:00:00.000Z',
  },
  {
    id: 'wish-005',
    agencyId: AGENCY_ID,
    customerId: 'cust-001',
    destination: 'Islândia',
    startDate: '2027-06-01T00:00:00.000Z',
    endDate: '2027-06-10T00:00:00.000Z',
    budget: 40000,
    travelersCount: 4,
    notes: 'Aurora boreal e natureza. Mesma família da viagem de Portugal.',
    status: 'ACTIVE',
    createdAt: '2026-08-15T08:00:00.000Z',
    updatedAt: '2026-08-15T08:00:00.000Z',
  },
];

// ============================================================
// TRIPS
// ============================================================

export const trips: Trip[] = [
  {
    id: 'trip-001',
    agencyId: AGENCY_ID,
    customerId: 'cust-001',
    saleId: 'sale-001',
    name: 'Família Martins — Portugal',
    destination: 'Lisboa + Porto, Portugal',
    description: 'Rota cultural por Portugal: Lisboa (4 noites), Sintra (1 noite), Porto (3 noites), Vale do Douro (2 noites). Inclui degustação de vinhos e tour gastronômico.',
    startDate: '2026-10-15T00:00:00.000Z',
    endDate: '2026-10-28T00:00:00.000Z',
    status: 'CONFIRMED',
    notes: 'Documentação em dia. Passaportes validados. Seguro viagem contratado.',
    createdAt: '2026-07-20T10:00:00.000Z',
    updatedAt: '2026-08-10T14:30:00.000Z',
  },
  {
    id: 'trip-002',
    agencyId: AGENCY_ID,
    customerId: 'cust-002',
    saleId: 'sale-002',
    name: 'Ana & Marcos — Grécia',
    destination: 'Atenas + Santorini, Grécia',
    description: 'Lua de mel clássica: Atenas (3 noites), Santorini (5 noites), Mykonos (3 noites). Inclui transfers privativos e jantar romântico.',
    startDate: '2026-09-01T00:00:00.000Z',
    endDate: '2026-09-14T00:00:00.000Z',
    status: 'CONFIRMED',
    createdAt: '2026-07-25T09:00:00.000Z',
    updatedAt: '2026-08-15T11:00:00.000Z',
  },
];

// ============================================================
// PROPOSALS
// ============================================================

export const proposals: Proposal[] = [
  {
    id: 'prop-001',
    agencyId: AGENCY_ID,
    customerId: 'cust-001',
    wishId: 'wish-001',
    proposedPrice: 38500,
    discount: 3500,
    total: 35000,
    validUntil: '2026-09-15T00:00:00.000Z',
    conditions: 'Sujeito à disponibilidade de voos e hotéis. Crianças com desconto especial.',
    notes: 'Pacote personalizado com voos LATAM ida/volta Lisboa + traslados e transporte interno em Portugal.',
    status: 'ACCEPTED',
    createdAt: '2026-07-10T10:00:00.000Z',
    updatedAt: '2026-07-18T14:00:00.000Z',
  },
  {
    id: 'prop-002',
    agencyId: AGENCY_ID,
    customerId: 'cust-002',
    wishId: 'wish-002',
    proposedPrice: 30000,
    discount: 2000,
    total: 28000,
    validUntil: '2026-08-30T00:00:00.000Z',
    conditions: 'Passagens aéreas com ALTERAÇÕES limitadas. Hotel sujeito a disponibilidade.',
    notes: 'Pacote personalizado para lua de mel. Inclui upgrade para suíte.',
    status: 'ACCEPTED',
    createdAt: '2026-07-22T11:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
  },
  {
    id: 'prop-003',
    agencyId: AGENCY_ID,
    customerId: 'cust-003',
    wishId: 'wish-003',
    proposedPrice: 19500,
    discount: 1500,
    total: 18000,
    validUntil: '2026-09-30T00:00:00.000Z',
    conditions: 'Resort all-inclusive. Voos indiretos via Bogotá.',
    notes: 'Proposta para Ricardo Oliveira (Cancún)',
    status: 'SENT',
    createdAt: '2026-08-10T14:00:00.000Z',
    updatedAt: '2026-08-10T14:00:00.000Z',
  },
];

// ============================================================
// BOOKINGS
// ============================================================

export const bookings: Booking[] = [
  {
    id: 'bk-001',
    agencyId: AGENCY_ID,
    bookerCustomerId: 'cust-001',
    tripType: 'ROUND_TRIP',
    outboundDepartureId: 'dep-001',
    returnDepartureId: 'dep-002',
    cancelled: false,
    notes: 'Família Martins. 4 passageiros. Poltrona janela preferida para crianças.',
    createdAt: '2026-07-20T10:00:00.000Z',
    updatedAt: '2026-08-10T14:30:00.000Z',
  },
  {
    id: 'bk-002',
    agencyId: AGENCY_ID,
    bookerCustomerId: 'cust-002',
    tripType: 'ROUND_TRIP',
    outboundDepartureId: 'dep-003',
    returnDepartureId: 'dep-004',
    cancelled: false,
    notes: 'Ana & Marcos. Lua de mel. Solicitaram assentos adjacentes.',
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-15T11:00:00.000Z',
  },
];

export const bookingPassengers: BookingPassenger[] = [
  { id: 'bp-001', agencyId: AGENCY_ID, bookingId: 'bk-001', name: 'Lucas Martins', createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T10:00:00.000Z' },
  { id: 'bp-002', agencyId: AGENCY_ID, bookingId: 'bk-001', name: 'Mariana Martins', notes: 'Criança (8 anos)', createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T10:00:00.000Z' },
  { id: 'bp-003', agencyId: AGENCY_ID, bookingId: 'bk-001', name: 'Rafael Martins', notes: 'Criança (12 anos)', createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T10:00:00.000Z' },
  { id: 'bp-004', agencyId: AGENCY_ID, bookingId: 'bk-001', name: 'Juliana Martins', createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T10:00:00.000Z' },
  { id: 'bp-005', agencyId: AGENCY_ID, bookingId: 'bk-002', name: 'Ana Beatriz Souza', createdAt: '2026-08-01T09:00:00.000Z', updatedAt: '2026-08-01T09:00:00.000Z' },
  { id: 'bp-006', agencyId: AGENCY_ID, bookingId: 'bk-002', name: 'Marcos Souza', createdAt: '2026-08-01T09:00:00.000Z', updatedAt: '2026-08-01T09:00:00.000Z' },
];

// ============================================================
// DASHBOARD DATA
// ============================================================

export const dashboardSummary = {
  totalSales: 63000,
  salesDelta: '+12% vs. mês anterior',
  salesTone: 'positive' as const,
  openProposals: 1,
  proposalsDelta: '1 aguardando resposta',
  proposalsTone: 'neutral' as const,
  activeTrips: 2,
  tripsDelta: '2 viagens confirmadas',
  tripsTone: 'positive' as const,
  upcomingDepartures: 1,
  departuresDelta: 'Próxima: 01/09 (Grécia)',
  departuresTone: 'neutral' as const,
  pendingBookings: 0,
  bookingsDelta: 'Todas confirmadas',
  bookingsTone: 'positive' as const,
  activeCustomers: 4,
  customersDelta: '+1 este mês',
  customersTone: 'positive' as const,
};

export interface RecentAction {
  id: string;
  icon: string;
  label: string;
  detail: string;
  timestamp: string;
}

export const recentActions: RecentAction[] = [
  { id: 'act-001', icon: 'check', label: 'Proposta aceita', detail: 'Lucas Martins aceitou proposta Portugal — R$ 35.000', timestamp: '2026-07-18T14:00:00.000Z' },
  { id: 'act-002', icon: 'plane', label: 'Viagem confirmada', detail: 'Família Martins — Lisboa + Porto (15/10 a 28/10)', timestamp: '2026-07-20T10:00:00.000Z' },
  { id: 'act-003', icon: 'check', label: 'Proposta aceita', detail: 'Ana Beatriz Souza aceitou proposta Grécia — R$ 28.000', timestamp: '2026-08-01T09:00:00.000Z' },
  { id: 'act-004', icon: 'send', label: 'Proposta enviada', detail: 'Proposta para Ricardo Oliveira (Cancún) — R$ 18.000', timestamp: '2026-08-10T14:00:00.000Z' },
  { id: 'act-005', icon: 'user-plus', label: 'Novo cliente', detail: 'Fernanda Costa adicionada ao sistema', timestamp: '2026-08-20T10:00:00.000Z' },
  { id: 'act-006', icon: 'heart', label: 'Novo desejo', detail: 'Fernanda Costa — Japão (mar/2027, R$ 45.000)', timestamp: '2026-08-20T10:00:00.000Z' },
];

export interface AlertItem {
  id: string;
  severity: 'warning' | 'info';
  label: string;
  detail: string;
}

export const alerts: AlertItem[] = [
  { id: 'alert-001', severity: 'warning', label: 'Proposta expirando', detail: 'Proposta para Ricardo Oliveira (Cancún) expira em 30/09. Follow-up pendente.' },
  { id: 'alert-002', severity: 'info', label: 'Partida próxima', detail: 'Grécia (Ana & Marcos) sai em 01/09 — 4 dias.' },
];

// ============================================================
// TRIP ITINERARY (visual timeline data for trip detail)
// ============================================================

export interface ItineraryDay {
  date: string;
  location: string;
  description: string;
  highlights: string[];
}

export const portugalItinerary: ItineraryDay[] = [
  {
    date: '2026-10-15',
    location: 'Lisboa',
    description: 'Chegada e check-in. Passeio pelo bairro de Alfama.',
    highlights: ['Transfer aeroporto', 'Fado à noite'],
  },
  {
    date: '2026-10-16',
    location: 'Lisboa',
    description: 'Visita ao Mosteiro dos Jerónimos, Torre de Belém e pastéis de Belém.',
    highlights: ['Torre de Belém', 'Pastéis de nata'],
  },
  {
    date: '2026-10-17',
    location: 'Sintra',
    description: 'Passeio de trem até Sintra. Palácio da Pena e Quinta da Regaleira.',
    highlights: ['Palácio da Pena', 'Poço Iniciático'],
  },
  {
    date: '2026-10-18',
    location: 'Lisboa',
    description: 'Dia livre. Mercado da Ribeira, Time Out Market e miradouros.',
    highlights: ['Time Out Market', 'Miradouro da Graça'],
  },
  {
    date: '2026-10-19',
    location: 'Lisboa → Porto',
    description: 'Trem Alfa Pendular para Porto (2h40). Check-in no hotel no centro.',
    highlights: ['Alfa Pendular', 'Ribeira do Porto'],
  },
  {
    date: '2026-10-20',
    location: 'Porto',
    description: 'Catedral, Livraria Lello, Torre dos Clérigos e Ponte Dom Luís I.',
    highlights: ['Livraria Lello', 'Vila Nova de Gaia'],
  },
  {
    date: '2026-10-21',
    location: 'Vale do Douro',
    description: 'Excursão ao Vale do Douro com degustação de vinhos em 2 vinícolas.',
    highlights: ['Degustação de vinhos', 'Paisagem do Douro'],
  },
  {
    date: '2026-10-22',
    location: 'Porto',
    description: 'Tour gastronômico. Provar francesinha e bacalhau à brás.',
    highlights: ['Francesinha', 'Tour gastronômico'],
  },
  {
    date: '2026-10-23',
    location: 'Porto → Lisboa',
    description: 'Retorno a Lisboa. Noite de despedida em Bairro Alto.',
    highlights: ['Bairro Alto', 'Shopping'],
  },
  {
    date: '2026-10-24',
    location: 'Lisboa',
    description: 'Último dia. Compras e transfer para o aeroporto.',
    highlights: ['Aeroporto', 'Volta para casa'],
  },
];

// ============================================================
// LOOKUP HELPERS
// ============================================================

export function getCustomerById(id: string): Customer | undefined {
  return customers.find((c) => c.id === id);
}

export function getWishesByCustomerId(customerId: string): Wish[] {
  return wishes.filter((w) => w.customerId === customerId);
}

export function getTripsByCustomerId(customerId: string): Trip[] {
  return trips.filter((t) => t.customerId === customerId);
}

export function getProposalsByCustomerId(customerId: string): Proposal[] {
  return proposals.filter((p) => p.customerId === customerId);
}

export function getBookingsByCustomerId(customerId: string): Booking[] {
  return bookings.filter((b) => b.bookerCustomerId === customerId);
}

export function getPassengersByBookingId(bookingId: string): BookingPassenger[] {
  return bookingPassengers.filter((p) => p.bookingId === bookingId);
}

export function getWishById(id: string): Wish | undefined {
  return wishes.find((w) => w.id === id);
}

export function getTripById(id: string): Trip | undefined {
  return trips.find((t) => t.id === id);
}
