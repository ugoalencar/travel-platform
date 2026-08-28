import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, getMyTrip } from '../../lib/customerApi';
import type { Trip } from '../../types/trip';
import { tripStatusLabel } from '../../lib/statusLabels';
import { BackLink } from '../BackLink';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; trip: Trip };

export function CustomerTripDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getMyTrip(id)
      .then((trip) => {
        if (!cancelled) setState({ status: 'success', trip });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível carregar esta viagem.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="flex flex-col gap-6">
      <BackLink to="/customer-portal/trips" label="Voltar para minhas viagens" />

      <div aria-live="polite">
        {state.status === 'loading' && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
            <span className="text-sm text-slate-500">Carregando detalhes da viagem...</span>
          </div>
        )}
        {state.status === 'error' && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
      </div>

      {state.status === 'success' && <TripDetails trip={state.trip} />}
    </div>
  );
}

function TripDetails({ trip }: { trip: Trip }) {
  const daysUntil = Math.ceil(
    (new Date(trip.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const statusColors: Record<string, string> = {
    PLANNED: 'bg-blue-100 text-blue-800',
    CONFIRMED: 'bg-teal-100 text-teal-800',
    IN_PROGRESS: 'bg-green-100 text-green-800',
    COMPLETED: 'bg-slate-100 text-slate-600',
    CANCELLED: 'bg-red-100 text-red-800',
  };

  return (
    <>
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 p-8 text-white shadow-xl">
        <div className="absolute -right-8 -top-8 text-8xl opacity-20">
          {trip.destination === 'Portugal' ? '🇵🇹' : trip.destination === 'Islândia' ? '🌋' : '✈️'}
        </div>
        <div className="relative">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                statusColors[trip.status] ?? 'bg-white/20 text-white'
              }`}
            >
              {tripStatusLabel(trip.status)}
            </span>
            {!trip.status.includes('CANCELLED') && daysUntil > 0 && (
              <span className="text-sm text-teal-100">Faltam {daysUntil} dias</span>
            )}
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">{trip.name}</h1>
          <p className="mt-2 text-lg text-teal-100">{trip.destination}</p>
          <div className="mt-4 flex items-center gap-4 text-sm text-teal-100">
            <span>
              📅 {new Date(trip.startDate).toLocaleDateString('pt-BR')} –{' '}
              {new Date(trip.endDate).toLocaleDateString('pt-BR')}
            </span>
          </div>
        </div>
      </div>

      {/* Description */}
      {trip.description && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Sobre a viagem
          </h2>
          <p className="text-sm text-slate-700 leading-relaxed">{trip.description}</p>
        </div>
      )}

      {/* Trip Info Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InfoCard icon="📅" label="Data de início" value={new Date(trip.startDate).toLocaleDateString('pt-BR')} />
        <InfoCard icon="📅" label="Data de retorno" value={new Date(trip.endDate).toLocaleDateString('pt-BR')} />
        <InfoCard icon="👥" label="Viajantes" value={`${trip.description ? '2' : '1'} pessoa(s)`} />
        <InfoCard icon="🏷️" label="Status" value={tripStatusLabel(trip.status)} />
      </div>

      {/* Itinerary Preview */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Itinerário
        </h2>
        <div className="space-y-4">
          {[
            { day: 1, title: 'Chegada', desc: 'Transfer e instalação no hotel', icon: '✈️' },
            { day: 2, title: 'Dia de Praia', desc: 'Mergulho e relaxamento', icon: '🏖️' },
            { day: 3, title: 'Aventura', desc: 'Passeio e atividades ao ar livre', icon: '🤿' },
          ].map((item) => (
            <div key={item.day} className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-lg">
                {item.icon}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  Dia {item.day} — {item.title}
                </p>
                <p className="text-xs text-slate-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hotel */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          🏨 Hospedagem
        </h2>
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Resort & Spa</p>
            <p className="text-xs text-slate-500">Vila sobre a água com piscina privativa</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-slate-500">Check-in</p>
              <p className="font-medium text-slate-900">14:00</p>
            </div>
            <div>
              <p className="text-slate-500">Check-out</p>
              <p className="font-medium text-slate-900">12:00</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {['Piscina', 'Spa', 'Restaurante', 'Wi-Fi'].map((amenity) => (
              <span
                key={amenity}
                className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700"
              >
                {amenity}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Transport */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          ✈️ Transporte
        </h2>
        <div className="space-y-4">
          <FlightCard
            type="Ida"
            airline="Emirates"
            flight="EK 261"
            departure="08:30"
            arrival="18:45"
            origin="São Paulo (GRU)"
            destination="Malé (MLE)"
            seatClass="Executiva"
          />
          <FlightCard
            type="Volta"
            airline="Emirates"
            flight="EK 262"
            departure="20:00"
            arrival="06:15+1"
            origin="Malé (MLE)"
            destination="São Paulo (GRU)"
            seatClass="Executiva"
          />
        </div>
      </div>

      {/* Activities */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          🎯 Atividades Incluídas
        </h2>
        <div className="space-y-3">
          {[
            { name: 'Mergulho com Tubarões-Baleia', time: '08:00', duration: '3h' },
            { name: 'Passeio de Barco ao Pôr do Sol', time: '17:00', duration: '2h' },
            { name: 'Spa & Wellness', time: '10:00', duration: '2h' },
          ].map((activity, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-slate-100 p-3"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                ✓
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">{activity.name}</p>
                <p className="text-xs text-slate-500">
                  {activity.time} · {activity.duration}
                </p>
              </div>
              <span className="text-xs font-medium text-green-700">Incluído</span>
            </div>
          ))}
        </div>
      </div>

      {/* Booking Status */}
      <div className="rounded-xl border border-teal-200 bg-teal-50 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-lg">
            ✅
          </div>
          <div>
            <p className="text-sm font-semibold text-teal-900">Reserva confirmada</p>
            <p className="text-xs text-teal-700">
              Sua viagem está confirmada. Tenha uma boa aventura!
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-sm font-semibold text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

function FlightCard({
  type,
  airline,
  flight,
  departure,
  arrival,
  origin,
  destination,
  seatClass,
}: {
  type: string;
  airline: string;
  flight: string;
  departure: string;
  arrival: string;
  origin: string;
  destination: string;
  seatClass: string;
}) {
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{type}</span>
        <span className="text-xs font-medium text-slate-700">
          {airline} · {flight}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="text-right">
          <p className="text-lg font-bold text-slate-900">{departure}</p>
          <p className="text-xs text-slate-500">{origin}</p>
        </div>
        <div className="flex-1 text-center">
          <div className="text-xs text-slate-400">✈️ ──── ✈️</div>
          <p className="text-xs text-slate-500">{seatClass}</p>
        </div>
        <div>
          <p className="text-lg font-bold text-slate-900">{arrival}</p>
          <p className="text-xs text-slate-500">{destination}</p>
        </div>
      </div>
    </div>
  );
}
