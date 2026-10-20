/* Recreated product screens (Travel Lite). Illustrative only: every name and
   value below is fictional demonstration data, not a real customer. */

const INSTALLMENTS = [
  { n: '1/3', due: '10/12', value: 'R$ 4.200' },
  { n: '2/3', due: '10/01', value: 'R$ 4.200' },
  { n: '3/3', due: '10/02', value: 'R$ 4.200' },
];

const SELLERS = [
  { name: 'Ana', sales: '14', margin: 'R$ 16.100' },
  { name: 'Bruno', sales: '11', margin: 'R$ 12.900' },
  { name: 'Carla', sales: '9', margin: 'R$ 12.300' },
];

const BARS = [
  [40, 28],
  [50, 36],
  [44, 38],
  [60, 42],
  [54, 44],
  [68, 50],
  [76, 52],
];

export function LiteSalesShot({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-md border border-slate-200 bg-white p-5 text-[#1a1d21] shadow-2xl shadow-travel-navy/20 ${className}`}
    >
      <p className="text-xs font-semibold text-slate-500">Vendas</p>
      <p className="mt-1 font-serif text-xl">Família Souza · Cancún</p>
      <div className="mt-4 rounded-sm bg-lite-blue px-4 py-2.5 text-center text-sm font-semibold text-white">
        Registrar venda
      </div>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="pb-2 font-semibold">Parcela</th>
            <th className="pb-2 font-semibold">Vencimento</th>
            <th className="pb-2 text-right font-semibold">Valor</th>
          </tr>
        </thead>
        <tbody>
          {INSTALLMENTS.map((row) => (
            <tr key={row.n} className="border-t border-slate-200">
              <td className="py-2">{row.n}</td>
              <td className="py-2">{row.due}</td>
              <td className="py-2 text-right">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LiteDashboardShot({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-md border border-slate-200 bg-white p-5 text-[#1a1d21] shadow-2xl shadow-travel-navy/20 ${className}`}
    >
      <p className="text-xs font-semibold text-slate-500">Dashboard · Agência Horizonte</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-sm border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Vendido</p>
          <p className="mt-1 text-xl font-bold text-lite-blue">R$ 248.900</p>
        </div>
        <div className="rounded-sm border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Margem</p>
          <p className="mt-1 text-xl font-bold text-[#157347]">R$ 41.300</p>
        </div>
      </div>
      <div className="mt-4 flex h-20 items-end gap-2">
        {BARS.map(([entrada, saida], index) => (
          <div key={index} className="flex flex-1 items-end gap-0.5">
            <div className="flex-1 rounded-t-sm bg-lite-blue" style={{ height: `${entrada}%` }} />
            <div className="flex-1 rounded-t-sm bg-[#9a6700]" style={{ height: `${saida}%` }} />
          </div>
        ))}
      </div>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="pb-1 font-semibold">Vendedor</th>
            <th className="pb-1 font-semibold">Vendas</th>
            <th className="pb-1 text-right font-semibold">Margem</th>
          </tr>
        </thead>
        <tbody>
          {SELLERS.map((row) => (
            <tr key={row.name} className="border-t border-slate-200">
              <td className="py-1.5 font-semibold">{row.name}</td>
              <td className="py-1.5">{row.sales}</td>
              <td className="py-1.5 text-right text-[#157347]">{row.margin}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
