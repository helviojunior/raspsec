/**
 * Centralized custom SVG icon library.
 * All project-specific icons live here to avoid duplication and ensure consistency.
 * For generic UI icons (Plus, Trash2, Save, etc.), import directly from "lucide-react".
 */
import React from "react";

// ── Network / Infrastructure ──

export const EthernetIcon = ({ className = "w-5 h-5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m15 20 3-3h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2l3 3z" />
    <path d="M6 8v1" />
    <path d="M10 8v1" />
    <path d="M14 8v1" />
    <path d="M18 8v1" />
  </svg>
);

export const VlanIcon = EthernetIcon;

export const WifiIcon = ({ className = "w-5 h-5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 20h.01" />
    <path d="M2 8.82a15 15 0 0 1 20 0" />
    <path d="M5 12.859a10 10 0 0 1 14 0" />
    <path d="M8.5 16.429a5 5 0 0 1 7 0" />
  </svg>
);

export const UsbIcon = ({ className = "w-5 h-5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="10" cy="7" r="1" />
    <circle cx="4" cy="20" r="1" />
    <path d="M4.7 19.3 19 5" />
    <path d="m21 3-3 1 2 2Z" />
    <path d="M9.26 7.68 5 12l2 5" />
    <path d="m10 14 5 2 3.5-3.5" />
    <path d="m18 12 1-1 1 1-1 1Z" />
  </svg>
);

export const CellularIcon = ({ className = "w-5 h-5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="17" width="4" height="5" rx="1" />
    <rect x="7" y="13" width="4" height="9" rx="1" />
    <rect x="12" y="9" width="4" height="13" rx="1" />
    <rect x="17" y="4" width="4" height="18" rx="1" />
  </svg>
);

export const TetherIcon = ({ className = "w-5 h-5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="7" y="2" width="10" height="20" rx="2" />
    <path d="M12 18h.01" />
    <path d="M11 6h2" />
  </svg>
);

// ── Client indicators ──

export const LaptopWifiIcon = ({ className = "w-5 h-5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M2 20h20" />
    <path d="M12 12h.01" />
    <path d="M9 10a3.5 3.5 0 0 1 6 0" />
  </svg>
);

export const LaptopEthIcon = ({ className = "w-5 h-5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M2 20h20" />
    <path d="M9 9v2" />
    <path d="M12 9v2" />
    <path d="M15 9v2" />
  </svg>
);

// ── Service status ──

export const ApIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="3" />
    <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
  </svg>
);

export const FirewallStatusIcon = ({ className = "w-5 h-5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

export const VpnIcon = ({ className = "w-5 h-5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
  </svg>
);

// ── Page / Tab icons ──

export const RulesIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 -960 960 960" fill="currentColor">
    <path d="M480-80q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Zm0-84q97-30 162-118.5T718-480H480v-315l-240 90v207q0 7 2 18h238v336Z" />
  </svg>
);

export const NatIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 -960 960 960" fill="currentColor">
    <path d="M280-120v-80h160v-124q-49-11-87.5-41.5T296-442q-75-9-125.5-65.5T120-640v-40q0-33 23.5-56.5T200-760h80v-80h400v80h80q33 0 56.5 23.5T840-680v40q0 76-50.5 132.5T664-442q-18 46-56.5 76.5T520-324v124h160v80H280Zm0-408v-152h-80v40q0 38 22 68t58 44Zm400 0q36-14 58-44t22-68v-40h-80v152Z" />
  </svg>
);

export const NetworkStatusIcon = ({ className = "w-5 h-5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="16" y="16" width="6" height="6" rx="1" />
    <rect x="2" y="16" width="6" height="6" rx="1" />
    <rect x="9" y="2" width="6" height="6" rx="1" />
    <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
    <path d="M12 12V8" />
  </svg>
);

export const DnsIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 -960 960 960" fill="currentColor">
    <path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm-40-82v-78q-33 0-56.5-23.5T360-320v-40L168-552q-3 18-5.5 36t-2.5 36q0 121 79.5 212T440-162Zm276-102q20-22 36-47.5t26.5-53q10.5-27.5 16-56.5t5.5-59q0-98-54.5-179T600-776v16q0 33-23.5 56.5T520-680h-80v80q0 17-11.5 28.5T400-560h-80v80h240q17 0 28.5 11.5T600-440v120h40q26 0 47 15.5t29 40.5Z" />
  </svg>
);

export const RouterIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 -960 960 960" fill="currentColor">
    <path d="M200-120q-33 0-56.5-23.5T120-200v-160q0-33 23.5-56.5T200-440h560q33 0 56.5 23.5T840-360v160q0 33-23.5 56.5T760-120H200Zm0-80h560v-160H200v160Zm80-40q17 0 28.5-11.5T320-280q0-17-11.5-28.5T280-320q-17 0-28.5 11.5T240-280q0 17 11.5 28.5T280-240Zm160 0q17 0 28.5-11.5T480-280q0-17-11.5-28.5T440-320q-17 0-28.5 11.5T400-280q0 17 11.5 28.5T440-240ZM320-520l-80-80v-200h80v170l60 60 60-60v-170h80v200l-80 80-60-60-60 60Z" />
  </svg>
);

// ── Shell / Tools ──

export const WebShellIcon = ({ className = "w-5 h-5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="3" width="20" height="18" rx="2" />
    <line x1="2" y1="7" x2="22" y2="7" />
    <circle cx="5" cy="5" r="0.5" fill="currentColor" />
    <circle cx="7.5" cy="5" r="0.5" fill="currentColor" />
    <circle cx="10" cy="5" r="0.5" fill="currentColor" />
    <path d="M6 12l3 3-3 3" />
    <line x1="12" y1="18" x2="18" y2="18" />
  </svg>
);

export const TerminalIcon = ({ className = "w-5 h-5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M6 9l3 3-3 3" />
    <line x1="12" y1="15" x2="18" y2="15" />
  </svg>
);

// ── Device Illustration (Dashboard) ──

export const DeviceIllustration = ({ className = "w-44 h-auto" }) => (
  <svg viewBox="0 0 200 140" className={className} fill="none">
    <rect x="20" y="15" width="160" height="110" rx="8"
      className="fill-emerald-500/10 stroke-emerald-500" strokeWidth="2" />
    <rect x="75" y="45" width="50" height="50" rx="4"
      className="fill-emerald-500/20 stroke-emerald-500" strokeWidth="1.5" />
    <text x="100" y="74" textAnchor="middle"
      className="fill-emerald-500 text-[9px] font-bold">CPU</text>
    <g className="stroke-emerald-500/60" strokeWidth="1">
      {[30, 38, 46, 54, 62, 70, 78, 86, 94, 102].map((x) => (
        <line key={x} x1={x} y1="20" x2={x} y2="10" />
      ))}
    </g>
    <rect x="155" y="25" width="25" height="20" rx="2"
      className="fill-emerald-500/15 stroke-emerald-500" strokeWidth="1" />
    <text x="167" y="38" textAnchor="middle"
      className="fill-emerald-500/70 text-[6px]">ETH</text>
    <rect x="155" y="55" width="25" height="15" rx="2"
      className="fill-emerald-500/15 stroke-emerald-500" strokeWidth="1" />
    <rect x="155" y="75" width="25" height="15" rx="2"
      className="fill-emerald-500/15 stroke-emerald-500" strokeWidth="1" />
    <text x="167" y="65" textAnchor="middle"
      className="fill-emerald-500/70 text-[6px]">USB</text>
    <text x="167" y="85" textAnchor="middle"
      className="fill-emerald-500/70 text-[6px]">USB</text>
    <rect x="25" y="100" width="18" height="10" rx="2"
      className="fill-emerald-500/15 stroke-emerald-500" strokeWidth="1" />
    <text x="34" y="108" textAnchor="middle"
      className="fill-emerald-500/70 text-[5px]">PWR</text>
    <rect x="55" y="115" width="15" height="10" rx="1"
      className="fill-emerald-500/15 stroke-emerald-500" strokeWidth="1" />
    <circle cx="50" cy="70" r="12"
      className="fill-emerald-500/10 stroke-emerald-500/50" strokeWidth="1" strokeDasharray="3 2" />
    <text x="50" y="73" textAnchor="middle"
      className="fill-emerald-500/60 text-[6px]">WiFi</text>
    {[[28, 23], [172, 23], [28, 117], [172, 117]].map(([cx, cy]) => (
      <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3"
        className="stroke-emerald-500/40" strokeWidth="1" fill="none" />
    ))}
  </svg>
);
