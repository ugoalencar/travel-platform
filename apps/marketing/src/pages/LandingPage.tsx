import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle } from 'lucide-react';

export function LandingPage() {
  return (
    <div className="bg-white">
      {/* Navigation */}
      <nav className="flex justify-between items-center px-8 py-4 border-b">
        <h1 className="text-2xl font-bold text-blue-600">Travel Platform</h1>
        <div className="flex gap-6">
          <Link to="/pricing" className="text-gray-700 hover:text-blue-600">Pricing</Link>
          <button className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="px-8 py-20 text-center">
        <h2 className="text-5xl font-bold mb-6 text-gray-900">
          Manage Your Travel Agency with Ease
        </h2>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          A comprehensive SaaS platform for travel agencies to manage bookings, customers, and operations in one place.
        </p>
        <button className="bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto">
          Start Free Trial
          <ArrowRight size={20} />
        </button>
      </section>

      {/* Features Section */}
      <section className="px-8 py-20 bg-gray-50">
        <h2 className="text-4xl font-bold mb-12 text-center">Powerful Features</h2>
        <div className="grid grid-cols-3 gap-8 max-w-6xl mx-auto">
          <FeatureCard title="Customer Management" desc="Organize and track all your customers in one place" />
          <FeatureCard title="Booking System" desc="Streamline travel bookings with our intuitive interface" />
          <FeatureCard title="Financial Reports" desc="Get detailed insights into your revenue and expenses" />
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-8 py-20 text-center bg-blue-600 text-white">
        <h2 className="text-4xl font-bold mb-6">Ready to Transform Your Agency?</h2>
        <p className="text-lg mb-8">Join hundreds of travel agencies using our platform.</p>
        <button className="bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100">
          Start Your Free Trial Today
        </button>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white px-8 py-8 text-center">
        <p>&copy; 2025 Travel Platform. All rights reserved.</p>
      </footer>
    </div>
  );
}

function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <div className="flex items-center gap-3 mb-4">
        <CheckCircle className="text-blue-600" size={24} />
        <h3 className="text-lg font-bold">{title}</h3>
      </div>
      <p className="text-gray-600">{desc}</p>
    </div>
  );
}
