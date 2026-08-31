export function SubscribersPage() {
  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Subscribers</h1>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          Add Subscriber
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Company</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Plan</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Users</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr className="hover:bg-gray-50">
              <td className="px-6 py-4 text-sm">Example Agency</td>
              <td className="px-6 py-4 text-sm">Professional</td>
              <td className="px-6 py-4 text-sm"><span className="bg-green-100 text-green-800 px-2 py-1 rounded">Active</span></td>
              <td className="px-6 py-4 text-sm">12</td>
              <td className="px-6 py-4 text-sm">Jan 15, 2025</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
