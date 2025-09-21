"use client";

import CertisMap from "../components/CertisMap";

export default function Page() {
  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className="sidebar p-4">
        {/* Card 1: Logo + Title + Clear All */}
        <div className="card flex flex-col items-center">
          <a
            href="https://www.certisbio.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src="/certis_logo.png"
              alt="Certis Biologicals"
              width={150}
              height={150}
              className="mb-2"
            />
          </a>
          <h1 className="text-xl font-bold text-center">Certis AgRoute Planner</h1>
          <button className="clear-btn mt-2">Clear All</button>
        </div>

        {/* Card 2: Home Zip */}
        <div className="card">
          <h2>Home Zip Code</h2>
          <input type="text" placeholder="Enter zip..." />
        </div>

        {/* Card 3: State Filter */}
        <div className="card">
          <h2>Filter by State</h2>
          <select>
            <option value="">All States</option>
          </select>
        </div>

        {/* Card 4: Category Filter */}
        <div className="card">
          <h2>Filter by Category</h2>
          <select>
            <option value="">All Categories</option>
          </select>
        </div>

        {/* Card 5: Retailer Name */}
        <div className="card">
          <h2>Filter by Retailer</h2>
          <select>
            <option value="">All Retailers</option>
          </select>
        </div>

        {/* Card 6: Supplier Filter */}
        <div className="card">
          <h2>Filter by Supplier</h2>
          <select>
            <option value="">All Suppliers</option>
          </select>
        </div>

        {/* Card 7: Waypoints + Trip */}
        <div className="card">
          <h2>Waypoints</h2>
          <p>No waypoints selected.</p>
          <button className="mt-2 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded">
            Optimize Trip
          </button>
        </div>
      </aside>

      {/* Map */}
      <main className="main-content">
        <CertisMap />
      </main>
    </div>
  );
}
