"use client";

import Image from "next/image";
import CertisMap from "../components/CertisMap";

export default function Page() {
  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Logo (locked at 150px, clickable, not expandable) */}
        <a
          href="https://www.certisbio.com"
          target="_blank"
          rel="noopener noreferrer"
          className="logo"
        >
          <Image
            src="/certis-logo.png" // ✅ Correct filename
            alt="Certis Biologicals Logo"
            width={150} // ✅ Fixed width
            height={50} // keeps aspect ratio, CSS ensures no stretch
            priority
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
