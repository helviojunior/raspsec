import React, { useState, useEffect, useRef, useCallback } from "react";
import { Radio, Pause, Play, Eye } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getToken } from "lib/api";
import { Card, CardContent } from "components/ui/card";
import { Button } from "components/ui/button";
import { cn } from "lib/utils";

// ── Channel / Frequency mappings ──

const CHANNELS_2G = [
  { ch: 1, freq: 2412 }, { ch: 2, freq: 2417 }, { ch: 3, freq: 2422 },
  { ch: 4, freq: 2427 }, { ch: 5, freq: 2432 }, { ch: 6, freq: 2437 },
  { ch: 7, freq: 2442 }, { ch: 8, freq: 2447 }, { ch: 9, freq: 2452 },
  { ch: 10, freq: 2457 }, { ch: 11, freq: 2462 }, { ch: 12, freq: 2467 },
  { ch: 13, freq: 2472 }, { ch: 14, freq: 2484 },
];

const CHANNELS_5G = [
  { ch: 36, freq: 5180 }, { ch: 40, freq: 5200 }, { ch: 44, freq: 5220 },
  { ch: 48, freq: 5240 }, { ch: 52, freq: 5260 }, { ch: 56, freq: 5280 },
  { ch: 60, freq: 5300 }, { ch: 64, freq: 5320 }, { ch: 100, freq: 5500 },
  { ch: 104, freq: 5520 }, { ch: 108, freq: 5540 }, { ch: 112, freq: 5560 },
  { ch: 116, freq: 5580 }, { ch: 120, freq: 5600 }, { ch: 124, freq: 5620 },
  { ch: 128, freq: 5640 }, { ch: 132, freq: 5660 }, { ch: 136, freq: 5680 },
  { ch: 140, freq: 5700 }, { ch: 144, freq: 5720 }, { ch: 149, freq: 5745 },
  { ch: 153, freq: 5765 }, { ch: 157, freq: 5785 }, { ch: 161, freq: 5805 },
  { ch: 165, freq: 5825 },
];

const BAND_2G = "2.4 GHz";
const BAND_5G = "5 GHz";

// Distinct colors for networks
const NETWORK_COLORS = [
  "#00ff00", "#ff6600", "#00ccff", "#ff00ff", "#ffff00",
  "#ff3333", "#33ff99", "#9966ff", "#ff9900", "#66ffcc",
  "#ff6699", "#99ff33", "#3399ff", "#cc66ff", "#ffcc00",
  "#00ff99", "#ff3366", "#66ccff", "#cc33ff", "#33ffcc",
];

function getNetworkColor(index) {
  return NETWORK_COLORS[index % NETWORK_COLORS.length];
}

function freqToBand(freq) {
  if (freq >= 2400 && freq <= 2500) return BAND_2G;
  if (freq >= 5100 && freq <= 5900) return BAND_5G;
  return null;
}

// ── Spectrum Chart (Canvas) ──

function SpectrumChart({ networks, band, highlightBssid, onNetworkClick }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        setDimensions({ width: Math.max(320, width), height: Math.max(250, Math.min(500, width * 0.5)) });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const { width, height } = dimensions;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const channels = band === BAND_2G ? CHANNELS_2G : CHANNELS_5G;
    const margin = { top: 30, right: 20, bottom: 45, left: 55 };
    const chartW = width - margin.left - margin.right;
    const chartH = height - margin.top - margin.bottom;

    // Signal range
    const sigMin = -100;
    const sigMax = -20;

    // Frequency range
    const freqMin = channels[0].freq - 10;
    const freqMax = channels[channels.length - 1].freq + 10;

    const freqToX = (f) => margin.left + ((f - freqMin) / (freqMax - freqMin)) * chartW;
    const sigToY = (s) => margin.top + ((sigMax - Math.max(sigMin, Math.min(sigMax, s))) / (sigMax - sigMin)) * chartH;

    // ── Background ──
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);

    // ── Grid ──
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 0.5;

    // Horizontal grid (signal levels)
    for (let sig = sigMin; sig <= sigMax; sig += 10) {
      const y = sigToY(sig);
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
      ctx.stroke();

      ctx.fillStyle = "#666";
      ctx.font = "11px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${sig}`, margin.left - 6, y + 4);
    }

    // Vertical grid (channels)
    ctx.textAlign = "center";
    for (const ch of channels) {
      const x = freqToX(ch.freq);
      ctx.strokeStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, height - margin.bottom);
      ctx.stroke();

      ctx.fillStyle = "#888";
      ctx.font = "10px monospace";
      ctx.fillText(`${ch.ch}`, x, height - margin.bottom + 14);
    }

    // Axis labels
    ctx.fillStyle = "#aaa";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Channel", width / 2, height - 4);

    ctx.save();
    ctx.translate(14, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Signal (dBm)", 0, 0);
    ctx.restore();

    // Band label
    ctx.fillStyle = "#555";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(band, margin.left + 4, margin.top + 16);

    // ── Filter networks for this band ──
    const bandNetworks = networks.filter((n) => freqToBand(n.frequency) === band);

    // Assign colors by unique BSSID
    const bssidList = [...new Set(bandNetworks.map((n) => n.bssid))];
    const colorMap = {};
    bssidList.forEach((b, i) => { colorMap[b] = getNetworkColor(i); });

    // ── Draw network shapes (trapezoids) ──
    // Sort by signal (weakest first so strongest draws on top)
    const sorted = [...bandNetworks].sort((a, b) => a.signal - b.signal);

    for (const net of sorted) {
      const centerFreq = net.frequency;
      const halfWidth = (net.channel_width || 20) / 2;
      const color = colorMap[net.bssid];
      const isHighlighted = !highlightBssid || highlightBssid === net.bssid;
      const alpha = isHighlighted ? 0.35 : 0.08;
      const strokeAlpha = isHighlighted ? 0.9 : 0.2;

      const xLeft = freqToX(centerFreq - halfWidth);
      const xRight = freqToX(centerFreq + halfWidth);
      const xCenter = freqToX(centerFreq);
      const yTop = sigToY(net.signal);
      const yBottom = sigToY(sigMin);

      // Trapezoid shape with slight inset at top
      const topInset = (xRight - xLeft) * 0.08;

      ctx.beginPath();
      ctx.moveTo(xLeft, yBottom);
      ctx.lineTo(xLeft + topInset, yTop);
      ctx.lineTo(xRight - topInset, yTop);
      ctx.lineTo(xRight, yBottom);
      ctx.closePath();

      // Fill
      const grad = ctx.createLinearGradient(0, yTop, 0, yBottom);
      grad.addColorStop(0, color + Math.round(alpha * 255).toString(16).padStart(2, "0"));
      grad.addColorStop(1, color + "05");
      ctx.fillStyle = grad;
      ctx.fill();

      // Stroke
      ctx.strokeStyle = color + Math.round(strokeAlpha * 255).toString(16).padStart(2, "0");
      ctx.lineWidth = isHighlighted ? 2 : 1;
      ctx.stroke();

      // SSID label
      if (isHighlighted && net.ssid) {
        ctx.fillStyle = color;
        ctx.font = `${isHighlighted && highlightBssid ? "bold " : ""}11px sans-serif`;
        ctx.textAlign = "center";

        const labelY = yTop - 6;
        // Background for readability
        const textWidth = ctx.measureText(net.ssid).width;
        ctx.fillStyle = "#0a0a0aCC";
        ctx.fillRect(xCenter - textWidth / 2 - 3, labelY - 10, textWidth + 6, 14);
        ctx.fillStyle = color;
        ctx.fillText(net.ssid, xCenter, labelY);

        // Signal value
        ctx.fillStyle = "#0a0a0aCC";
        const sigText = `${net.signal} dBm`;
        const sigW = ctx.measureText(sigText).width;
        ctx.fillRect(xCenter - sigW / 2 - 2, labelY + 2, sigW + 4, 12);
        ctx.fillStyle = color + "BB";
        ctx.font = "10px monospace";
        ctx.fillText(sigText, xCenter, labelY + 12);
      }
    }

    // ── Chart border ──
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.strokeRect(margin.left, margin.top, chartW, chartH);
  }, [networks, band, dimensions, highlightBssid]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas
        ref={canvasRef}
        style={{ width: dimensions.width, height: dimensions.height }}
        className="rounded cursor-crosshair"
      />
    </div>
  );
}

// ── Network List Sidebar ──

function NetworkList({ networks, highlightBssid, onSelect, t }) {
  const bssidList = [...new Set(networks.map((n) => n.bssid))];
  const colorMap = {};
  bssidList.forEach((b, i) => { colorMap[b] = getNetworkColor(i); });

  // Group by SSID, keep all BSSIDs
  const grouped = {};
  for (const net of networks) {
    const key = net.ssid || net.bssid;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(net);
  }

  // Sort by strongest signal
  const entries = Object.entries(grouped).sort(
    (a, b) => Math.max(...b[1].map((n) => n.signal)) - Math.max(...a[1].map((n) => n.signal))
  );

  return (
    <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
      {/* Clear selection */}
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "w-full text-left px-2 py-1.5 rounded text-xs transition-colors",
          !highlightBssid
            ? "bg-zinc-700 text-white"
            : "text-zinc-400 hover:bg-zinc-800"
        )}
      >
        <Eye className="inline w-3 h-3 mr-1" /> {t("spectrum.showAll")}
      </button>
      {entries.map(([name, nets]) => (
        <div key={name}>
          {nets.map((net) => {
            const color = colorMap[net.bssid];
            const isActive = highlightBssid === net.bssid;
            return (
              <button
                key={net.bssid}
                onClick={() => onSelect(isActive ? null : net.bssid)}
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded text-xs transition-colors flex items-center gap-2",
                  isActive ? "bg-zinc-700" : "hover:bg-zinc-800"
                )}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-medium" style={{ color }}>
                    {net.ssid || "(Hidden)"}
                  </span>
                  <span className="block text-zinc-500 truncate text-[10px]">
                    {net.bssid} &middot; Ch {net.channel} &middot; {net.channel_width}MHz
                  </span>
                </span>
                <span className="text-zinc-400 font-mono text-[10px] flex-shrink-0">
                  {net.signal} dBm
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ──

export default function SpectrumAnalyser() {
  const { t } = useTranslation();
  const [wsStatus, setWsStatus] = useState("disconnected"); // disconnected | connecting | connected
  const [interfaces, setInterfaces] = useState([]);
  const [selectedIface, setSelectedIface] = useState("");
  const [scanning, setScanning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [networks, setNetworks] = useState([]);
  const [highlightBssid, setHighlightBssid] = useState(null);
  const [activeBand, setActiveBand] = useState(BAND_2G);
  const [error, setError] = useState("");
  const [scanCount, setScanCount] = useState(0);

  const wsRef = useRef(null);
  const pausedRef = useRef(false);

  // Keep pausedRef in sync
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const connectWs = useCallback(() => {
    if (wsRef.current) return;

    setWsStatus("connecting");
    setError("");

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/ws/spectrum`);
    wsRef.current = ws;

    ws.onopen = () => {
      const token = getToken();
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);

        if (msg.type === "auth") {
          if (msg.status === "ok") {
            setWsStatus("connected");
            setInterfaces(msg.interfaces || []);
            if (msg.interfaces?.length > 0 && !selectedIface) {
              setSelectedIface(msg.interfaces[0]);
            }
          } else {
            setError(t("spectrum.authFailed"));
            setWsStatus("disconnected");
          }
        } else if (msg.type === "scan") {
          if (!pausedRef.current) {
            setNetworks(msg.networks || []);
            setScanCount((c) => c + 1);
          }
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      wsRef.current = null;
      setWsStatus("disconnected");
      setScanning(false);
    };

    ws.onerror = () => {
      setError(t("spectrum.wsFailed"));
      wsRef.current = null;
      setWsStatus("disconnected");
    };
  }, [selectedIface, t]);

  const disconnectWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWsStatus("disconnected");
    setScanning(false);
  }, []);

  const startScan = useCallback(() => {
    if (!wsRef.current || !selectedIface) return;
    wsRef.current.send(JSON.stringify({ type: "start", interface: selectedIface }));
    setScanning(true);
    setPaused(false);
  }, [selectedIface]);

  const stopScan = useCallback(() => {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: "stop" }));
    setScanning(false);
  }, []);

  // Connect on mount
  useEffect(() => {
    connectWs();
    return () => disconnectWs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter for current band
  const bandNetworks = networks.filter((n) => freqToBand(n.frequency) === activeBand);
  const count2g = networks.filter((n) => freqToBand(n.frequency) === BAND_2G).length;
  const count5g = networks.filter((n) => freqToBand(n.frequency) === BAND_5G).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
          <Radio className="w-5 h-5 text-emerald-400" />
          {t("spectrum.title")}
        </h1>
        <div className="flex items-center gap-2">
          {/* Status indicator */}
          <span className={cn(
            "w-2 h-2 rounded-full",
            wsStatus === "connected" ? "bg-emerald-500" :
            wsStatus === "connecting" ? "bg-yellow-500 animate-pulse" :
            "bg-red-500"
          )} />
          <span className="text-xs text-zinc-500">
            {wsStatus === "connected" ? `${t("spectrum.connected")}${scanning ? ` · ${t("spectrum.scanNum", { count: scanCount })}` : ""}` :
             wsStatus === "connecting" ? t("spectrum.connecting") : t("spectrum.disconnected")}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 text-sm px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Interface selector */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400">{t("common.interface")}</label>
              <select
                value={selectedIface}
                onChange={(e) => setSelectedIface(e.target.value)}
                disabled={scanning}
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-2 py-1.5 disabled:opacity-50"
              >
                {interfaces.map((iface) => (
                  <option key={iface} value={iface}>{iface}</option>
                ))}
                {interfaces.length === 0 && (
                  <option value="">{t("spectrum.noWifiInterfaces")}</option>
                )}
              </select>
            </div>

            {/* Band toggle */}
            <div className="flex rounded overflow-hidden border border-zinc-700">
              <button
                onClick={() => setActiveBand(BAND_2G)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  activeBand === BAND_2G
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                )}
              >
                2.4 GHz ({count2g})
              </button>
              <button
                onClick={() => setActiveBand(BAND_5G)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  activeBand === BAND_5G
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                )}
              >
                5 GHz ({count5g})
              </button>
            </div>

            {/* Scan controls */}
            <div className="flex items-center gap-2 ml-auto">
              {!scanning ? (
                <Button
                  onClick={startScan}
                  disabled={wsStatus !== "connected" || !selectedIface}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1"
                >
                  <Play className="w-3.5 h-3.5" /> {t("spectrum.startScan")}
                </Button>
              ) : (
                <>
                  <Button
                    onClick={() => setPaused(!paused)}
                    variant="outline"
                    className="text-xs gap-1"
                  >
                    {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    {paused ? t("spectrum.resume") : t("spectrum.pause")}
                  </Button>
                  <Button
                    onClick={stopScan}
                    variant="outline"
                    className="text-xs gap-1 border-red-800 text-red-400 hover:bg-red-900/30"
                  >
                    {t("spectrum.stop")}
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart + Network List */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        {/* Spectrum Chart */}
        <Card>
          <CardContent className="p-3">
            {networks.length > 0 ? (
              <SpectrumChart
                networks={networks}
                band={activeBand}
                highlightBssid={highlightBssid}
              />
            ) : (
              <div className="flex items-center justify-center h-[350px] text-zinc-600 text-sm">
                {scanning ? (
                  <span className="flex items-center gap-2">
                    <Radio className="w-4 h-4 animate-pulse" /> {t("spectrum.scanning")}
                  </span>
                ) : (
                  t("spectrum.startToSee")
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Network List */}
        <Card>
          <CardContent className="p-3">
            <h3 className="text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">
              {t("spectrum.networks", { count: bandNetworks.length })}
            </h3>
            {bandNetworks.length > 0 ? (
              <NetworkList
                networks={bandNetworks}
                highlightBssid={highlightBssid}
                onSelect={setHighlightBssid}
                t={t}
              />
            ) : (
              <p className="text-zinc-600 text-xs">
                {scanning ? t("spectrum.waitingScan") : t("spectrum.noNetworks")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
