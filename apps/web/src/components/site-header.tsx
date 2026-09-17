"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navigation = [
  ["Helper home", "/"],
  ["TBC Trader", "/tbc/trader"],
  ["TBC Encyclopedia", "/tbc/encyclopedia"],
  ["Forever", "/forever/encyclopedia"],
  ["Data status", "/data-status"],
] as const;

export function SiteHeader(): React.JSX.Element {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string): boolean =>
    href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link
          className="brand"
          href="/"
          aria-label="KFC Helper home"
          onClick={() => setMobileOpen(false)}
        >
          <span className="brand-mark" aria-hidden="true">
            <Image alt="" height={30} priority src="/kfc-icon.svg" width={30} />
          </span>
          <span>
            <strong className="brand-name">KFC</strong>
            <small className="brand-sub">Guild Helper · Azeroth</small>
          </span>
        </Link>

        <nav className="site-header-links" aria-label="Primary navigation">
          {navigation.map(([label, href]) => (
            <Link
              className={isActive(href) ? "active" : undefined}
              href={href}
              key={href}
              prefetch={href !== "/tbc/trader"}
            >
              {label}
            </Link>
          ))}
        </nav>

        <a className="site-header-guild" href="https://kfcguild.online">
          KFC Guild
        </a>

        <button
          aria-controls="site-mobile-navigation"
          aria-expanded={mobileOpen}
          aria-label="Toggle navigation"
          className="site-header-menu-button"
          onClick={() => setMobileOpen((open) => !open)}
          type="button"
        >
          <span aria-hidden="true">{mobileOpen ? "×" : "☰"}</span>
        </button>
      </div>

      {mobileOpen ? (
        <nav className="site-mobile-navigation" id="site-mobile-navigation" aria-label="Mobile">
          {navigation.map(([label, href]) => (
            <Link
              className={isActive(href) ? "active" : undefined}
              href={href}
              key={href}
              onClick={() => setMobileOpen(false)}
              prefetch={href !== "/tbc/trader"}
            >
              {label}
            </Link>
          ))}
          <a href="https://kfcguild.online">KFC Guild</a>
        </nav>
      ) : null}
    </header>
  );
}
