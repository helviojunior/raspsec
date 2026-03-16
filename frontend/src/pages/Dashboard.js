import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import api from "lib/api";
import { Card, CardContent } from "components/ui/card";
import { Button } from "components/ui/button";
import {
  EthernetIcon, WifiIcon, TetherIcon, CellularIcon, VlanIcon, UsbIcon,
  LaptopWifiIcon, LaptopEthIcon,
  ApIcon, FirewallStatusIcon, VpnIcon,
  DeviceIllustration,
} from "components/icons";

// ── Helpers ──

function getInterfaceIcon(type) {
  switch (type) {
    case "wireless": return WifiIcon;
    case "usb": return UsbIcon;
    case "vlan": return VlanIcon;
    case "cellular": return CellularIcon;
    default: return EthernetIcon;
  }
}

function isIfaceActive(iface) {
  if (iface.type === "physical") return iface.up && iface.carrier;
  return iface.up;
}

const CHAIN_COLORS = { implant: "text-amber-400", outside: "text-red-400", internal: "text-blue-400" };

// ── Tree connectors (label → trunk → horizontal arm into device) ──
// Left: [label + icon] [branch: horiz from label to trunk] [arm: horiz from trunk to device]
// The trunk is a vertical line on the right edge of the branch column.
// The arm extends from the trunk into the device center.

const ACTIVE_BORDER = "border-emerald-500 border-solid";
const INACTIVE_BORDER = "border-zinc-700 border-dashed";

const TreeBranchLeft = ({ active, isFirst, isLast, isOnly }) => {
  const hb = active ? ACTIVE_BORDER : INACTIVE_BORDER; // horizontal branch
  const vb = INACTIVE_BORDER; // trunk is always dashed for continuity
  return (
    <div className="relative w-10 self-stretch flex items-center">
      {/* Horizontal: label → trunk */}
      <div className={`absolute left-0 right-0 top-1/2 border-t-2 ${hb}`} />
      {/* Trunk: top half (always present except first) */}
      {!isFirst && !isOnly && <div className={`absolute right-0 top-0 bottom-1/2 border-r-2 ${vb}`} />}
      {/* Trunk: bottom half (always present except last) */}
      {!isLast && !isOnly && <div className={`absolute right-0 top-1/2 bottom-0 border-r-2 ${vb}`} />}
    </div>
  );
};

const TreeArmLeft = ({ anyActive }) => {
  const b = anyActive ? ACTIVE_BORDER : INACTIVE_BORDER;
  return (
    <div className="relative w-12 self-center flex items-center" style={{ height: 2 }}>
      <div className={`absolute left-0 right-0 top-0 border-t-2 ${b}`} />
    </div>
  );
};

const TreeBranchRight = ({ active, isFirst, isLast, isOnly }) => {
  const hb = active ? ACTIVE_BORDER : INACTIVE_BORDER;
  const vb = INACTIVE_BORDER;
  return (
    <div className="relative w-10 self-stretch flex items-center">
      {/* Horizontal: trunk → label */}
      <div className={`absolute left-0 right-0 top-1/2 border-t-2 ${hb}`} />
      {/* Trunk: top half */}
      {!isFirst && !isOnly && <div className={`absolute left-0 top-0 bottom-1/2 border-l-2 ${vb}`} />}
      {/* Trunk: bottom half */}
      {!isLast && !isOnly && <div className={`absolute left-0 top-1/2 bottom-0 border-l-2 ${vb}`} />}
    </div>
  );
};

const TreeArmRight = ({ anyActive }) => {
  const b = anyActive ? ACTIVE_BORDER : INACTIVE_BORDER;
  return (
    <div className="relative w-12 self-center flex items-center" style={{ height: 2 }}>
      <div className={`absolute left-0 right-0 top-0 border-t-2 ${b}`} />
    </div>
  );
};

// ── Status Badge ──

const StatusBadge = ({ icon: Icon, label, active }) => (
  <div className={`flex flex-col items-center gap-1 transition-colors ${active ? "text-emerald-400" : "text-muted-foreground/30"}`}>
    <Icon className="w-5 h-5" />
    <span className="text-[10px] font-medium">{label}</span>
  </div>
);

const BandBadge = ({ label, active }) => (
  <span className={`px-3 py-1 text-xs font-medium rounded border transition-colors ${
    active ? "border-emerald-500 text-emerald-400 bg-emerald-500/10" : "border-border text-muted-foreground/30 bg-transparent"
  }`}>{label}</span>
);

// ── Main Dashboard ──

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      const { data: resp } = await api.get("/api/dashboard/");
      setData(resp);
    } catch {
      if (!isRefresh) {
        setTimeout(() => {
          api.get("/api/dashboard/").then(({ data: resp }) => setData(resp)).catch(() => {});
        }, 3000);
      }
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  if (loading || !data) {
    return (
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold tracking-tight mb-6">Dashboard</h1>
        <Card><CardContent className="p-6">
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
            <p className="text-sm text-muted-foreground">Carregando dashboard...</p>
          </div>
        </CardContent></Card>
      </div>
    );
  }

  const { system, wifi, clients, services, frequency_bands, interfaces } = data;

  // ── Build left rows (connection types) ──
  const externalIfaces = (interfaces || []).filter(i => i.chain === "implant" || i.chain === "outside" || !i.chain);
  const buildLeft = (key, label, icon, typeFilter) => {
    const ifaces = externalIfaces.filter(typeFilter);
    const active = ifaces.some(isIfaceActive);
    const main = ifaces.find(isIfaceActive) || ifaces[0];
    return { key, label, icon, active, ifaceName: main?.name || "", chain: main?.chain || "", ip: main?.ip || "" };
  };

  const leftRows = [
    buildLeft("ethernet", "Ethernet", EthernetIcon, i => i.type === "physical"),
    buildLeft("wifi-client", "WiFi Client", WifiIcon, i => i.type === "wireless"),
    buildLeft("tethering", "Tethering", TetherIcon, i => i.type === "usb"),
    buildLeft("cellular", "Cellular", CellularIcon, i => i.type === "cellular"),
  ];
  // Add VLANs dynamically
  externalIfaces.filter(i => i.type === "vlan").forEach(v => {
    leftRows.push({ key: v.name, label: v.name, icon: VlanIcon, active: isIfaceActive(v), ifaceName: v.name, chain: v.chain, ip: v.ip });
  });

  // ── Build right rows (internal / clients) ──
  const rightInterfaces = (interfaces || []).filter(i => i.chain === "internal");
  const byIface = clients.by_interface || {};

  const rightRows = rightInterfaces.length > 0
    ? rightInterfaces.map(iface => {
        const c = iface.type === "wireless" ? clients.wifi : (byIface[iface.name] || 0);
        return {
          key: iface.name, icon: getInterfaceIcon(iface.type), active: isIfaceActive(iface),
          name: iface.name, chain: iface.chain, count: c, label: `client${c !== 1 ? "s" : ""}`,
        };
      })
    : [
        { key: "wlan", icon: LaptopWifiIcon, active: clients.wifi > 0, name: "WLAN", count: clients.wifi, label: `client${clients.wifi !== 1 ? "s" : ""}` },
        { key: "lan", icon: LaptopEthIcon, active: clients.lan > 0, name: "LAN", count: clients.lan, label: `client${clients.lan !== 1 ? "s" : ""}` },
      ];

  const wlan0 = interfaces?.find(i => i.name === "wlan0");
  const primaryIface = wlan0 || interfaces?.find(i => i.up) || {};
  const apUp = wlan0?.up || false;
  const leftCount = leftRows.length;
  const rightCount = rightRows.length;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
          apUp ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" : "bg-red-500/10 text-red-400 border border-red-500/30"
        }`}>
          <span className={`w-2 h-2 rounded-full ${apUp ? "bg-emerald-400" : "bg-red-400"}`} />
          wlan0 {apUp ? "up" : "down"}
        </div>
      </div>

      <Card><CardContent className="p-6">
        <h2 className="text-xl font-semibold mb-8">Current status</h2>

        <div className="flex items-center justify-center max-w-5xl mx-auto">

          {/* ── LEFT: connection types + tree ── */}
          <div className="shrink-0">
            {leftRows.map((row, i) => {
              const Icon = row.icon;
              const chainColor = CHAIN_COLORS[row.chain] || "";
              return (
                <div key={row.key} className="flex items-center">
                  <div className={`flex items-center gap-2 justify-end transition-colors py-3 ${row.active ? "text-emerald-400" : "text-muted-foreground/40"}`}>
                    <div className="text-right min-w-[80px]">
                      <span className="text-xs font-medium block">{row.label}</span>
                      {row.ifaceName && <span className="text-[10px] text-muted-foreground/60 block">{row.ifaceName}</span>}
                      {row.chain && <span className={`text-[10px] ${chainColor}`}>{row.chain}</span>}
                    </div>
                    <Icon className="w-5 h-5 shrink-0" />
                  </div>
                  <TreeBranchLeft active={row.active} isFirst={i === 0} isLast={i === leftCount - 1} isOnly={leftCount === 1} />
                </div>
              );
            })}
          </div>

          {/* Left arm: horizontal line from trunk into device */}
          <TreeArmLeft anyActive={leftRows.some(r => r.active)} />

          {/* ── CENTER: Device ── */}
          <div className="flex flex-col items-center justify-center flex-1 min-w-[240px] max-w-[360px] py-4">
            <DeviceIllustration />
            <div className="mt-4 text-center">
              <h3 className="text-base font-semibold text-foreground">
                {system.model || "Raspberry Pi"}
                {system.memory_mb > 0 && ` (${system.memory_mb >= 1024 ? `${Math.round(system.memory_mb / 1024)} GB` : `${system.memory_mb} MB`})`}
              </h3>
              <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                {primaryIface.ip && <p>IP Address: <span className="text-foreground">{primaryIface.ip}</span></p>}
                {wifi.subnet_mask && <p>Netmask: <span className="text-foreground">{wifi.subnet_mask}</span></p>}
                {primaryIface.mac && <p>MAC Address: <span className="text-foreground">{primaryIface.mac}</span></p>}
                {wifi.ssid && <p>SSID: <span className="text-foreground">{wifi.ssid}</span></p>}
              </div>
            </div>
            <div className="flex items-center gap-4 mt-5">
              <StatusBadge icon={ApIcon} label="AP" active={services.ap} />
              <StatusBadge icon={FirewallStatusIcon} label="Firewall" active={services.firewall} />
              <StatusBadge icon={VpnIcon} label="VPN" active={services.vpn} />
              <StatusBadge icon={UsbIcon} label="USB" active={services.usb_gadget} />
            </div>
            <div className="flex items-center gap-3 mt-4">
              <BandBadge label="5G" active={frequency_bands["5G"]} />
              <BandBadge label="2.4G" active={frequency_bands["2.4G"]} />
            </div>
          </div>

          {/* Right arm: horizontal line from device into trunk */}
          <TreeArmRight anyActive={rightRows.some(r => r.active)} />

          {/* ── RIGHT: clients ── */}
          <div className="shrink-0">
            {rightRows.map((row, i) => {
              const Icon = row.icon;
              const chainColor = CHAIN_COLORS[row.chain] || "";
              return (
                <div key={row.key} className="flex items-center">
                  {/* Tree branch */}
                  <TreeBranchRight active={row.active} isFirst={i === 0} isLast={i === rightCount - 1} isOnly={rightCount === 1} />
                  {/* Icon + Label */}
                  <div className={`flex items-center gap-2 transition-colors py-3 ${row.active ? "text-emerald-400" : "text-muted-foreground/40"}`}>
                    <Icon className="w-5 h-5 shrink-0" />
                    <div>
                      <span className="text-xs font-medium block">
                        {row.count !== undefined ? `${row.count} ${row.name} ${row.label}` : row.name}
                      </span>
                      {row.chain && <span className={`text-[10px] ${chainColor}`}>{row.chain}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <Button variant="outline" onClick={() => fetchDashboard(true)} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="mt-6 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {system.hostname && <>Host: <span className="text-foreground">{system.hostname}</span> · </>}
            {system.cpu_temp > 0 && <>CPU: <span className="text-foreground">{system.cpu_temp}°C</span> · </>}
            {system.memory_mb > 0 && <>Mem: <span className="text-foreground">{system.memory_used_mb}/{system.memory_mb} MB ({Math.round(system.memory_used_mb / system.memory_mb * 100)}%)</span> · </>}
            {system.uptime && <>Uptime: <span className="text-foreground">{system.uptime.replace("up ", "")}</span></>}
          </p>
        </div>
      </CardContent></Card>
    </div>
  );
}
