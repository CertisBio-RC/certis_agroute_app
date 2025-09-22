"use client";

import CertisMap from "../components/CertisMap";

export default function Page() {
  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Logo */}
        <a
          href="https://www.certisbio.com"
          target="_blank"
          rel="noopener noreferrer"
          className="logo"
        >
          <img
            src="/certis_agroute_app/certislogo.png" // ✅ explicit GH Pages path
            alt="Certis Biologicals Logo"
            width="150"
            style={{ height: "auto" }}
          />
        </a>

        {/* Title */}
        <h1>Certis AgRoute Planner</h1>

        {/* Sidebar content */}
        <button>Clear All</button>

        <div className="card">Card 1</div>
        <div className="card">Card 2</div>
        <div className="card">Card 3</div>
        <div className="card">Card 4</div>
        <div className="card">Card 5</div>
        <div className="card">Card 6</div>
        <div className="card">Card 7</div>
      </aside>

      {/* Map Column */}
      <main className="map-container">
        <CertisMap />
      </main>
    </div>
  );
}
