export function PlansPage() {
  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Plans</h1>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          Create Plan
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <PlanCard name="Starter" price="$99" features={['10 users', '100GB storage']} />
        <PlanCard name="Professional" price="$299" features={['50 users', '500GB storage']} />
        <PlanCard name="Enterprise" price="Custom" features={['Unlimited users', 'Unlimited storage']} />
      </div>
    </div>
  );
}

function PlanCard({ name, price, features }: { name: string; price: string; features: string[] }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-2">{name}</h2>
      <p className="text-3xl font-bold text-blue-600 mb-4">{price}</p>
      <ul className="space-y-2">
        {features.map((f) => (
          <li key={f} className="text-sm text-gray-600">✓ {f}</li>
        ))}
      </ul>
    </div>
  );
}
