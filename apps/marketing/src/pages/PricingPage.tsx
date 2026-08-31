import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';

export function PricingPage() {
  return (
    <div className="bg-white">
      {/* Navigation */}
      <nav className="flex justify-between items-center px-8 py-4 border-b">
        <h1 className="text-2xl font-bold text-blue-600">Travel Platform</h1>
        <Link to="/" className="text-gray-700 hover:text-blue-600">← Back</Link>
      </nav>

      {/* Pricing Section */}
      <section className="px-8 py-20">
        <h2 className="text-4xl font-bold mb-12 text-center">Simple, Transparent Pricing</h2>

        <div className="grid grid-cols-3 gap-8 max-w-6xl mx-auto">
          <PlanCard 
            name="Starter" 
            price="$99" 
            features={['10 users', '100GB storage', 'Basic support', 'Essential features']} 
          />
          <PlanCard 
            name="Professional" 
            price="$299"
            featured={true}
            features={['50 users', '500GB storage', 'Priority support', 'All features', 'Custom integrations']} 
          />
          <PlanCard 
            name="Enterprise" 
            price="Custom"
            features={['Unlimited users', 'Unlimited storage', '24/7 support', 'All features', 'Dedicated account manager']} 
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white px-8 py-8 text-center">
        <p>&copy; 2025 Travel Platform. All rights reserved.</p>
      </footer>
    </div>
  );
}

function PlanCard({ name, price, features, featured }: { name: string; price: string; features: string[]; featured?: boolean }) {
  return (
    <div className={`border rounded-lg p-8 ${featured ? 'border-blue-600 shadow-lg' : 'border-gray-200'}`}>
      {featured && <span className="text-blue-600 font-semibold text-sm">RECOMMENDED</span>}
      <h3 className="text-2xl font-bold mb-2 mt-2">{name}</h3>
      <p className="text-3xl font-bold text-blue-600 mb-6">{price}</p>
      <ul className="space-y-3 mb-8">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2">
            <Check size={20} className="text-green-600" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button className={`w-full py-2 rounded-lg font-semibold transition-colors ${
        featured 
          ? 'bg-blue-600 text-white hover:bg-blue-700' 
          : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
      }`}>
        Choose Plan
      </button>
    </div>
  );
}
