"use client";

import CertisMap from "../components/CertisMap";
import Image from "next/image";

export default function Page() {
  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <a href="https://www.certisbio.com" target="_blank" rel="noopener noreferrer">
          <Image
            src="/certislogo.png"
            alt="Certis Biologicals Logo"
            width={150}
            height={150}
            className="logo"
          />
        </a>

        <h1 className="title">Certis AgRoute Planner</h1>

        {/* 7 Cards */}
        <div className="card">Card 1</div>
        <div className="card">Card 2</div>
        <div className="card">Card 3</div>
        <div className="card">Card 4</div>
        <div className="card">Card 5</div>
        <div className="card">Card 6</div>
        <div className="card">Card 7</div>
      </aside>

      {/* Map */}
      <main className="map-container">
        <CertisMap />
      </main>
    </div>
  );
}
