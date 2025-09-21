"use client";

import CertisMap from "../components/CertisMap";

export default function Page() {
  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Logo */}
        <div className="logo">
          <a
            href="https://www.certisbio.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src="/certis_logo.png"
              alt="Certis Biologicals Logo"
            />
          </a>
        </div>

        {/* Title */}
        <h1>Certis AgRoute Planner</h1>

        {/* Clear button */}
        <button>Clear All</button>

        {/* Sidebar cards */}
        <div className="card">Card 1</div>
        <div className="card">Card 2</div>
        <div className="card">Card 3</div>
        <div className="card">Card 4</div>
        <div className="card">Card 5</div>
        <div className="card">Card 6</div>
        <div className="card">Card 7</div>
      </aside>

      {/* Map column */}
      <main className="map-container">
        <CertisMap />
      </main>
    </div>
  );
}
