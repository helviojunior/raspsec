import React, { useState, useEffect, useCallback, useRef } from "react";
import { Play, Square, Loader2 } from "lucide-react";
import api from "lib/api";
import { Card, CardContent } from "components/ui/card";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { Label } from "components/ui/label";
import { cn } from "lib/utils";

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function PacketCapture() {
  const [interfaces, setInterfaces] = useState([]);
  const [selectedIface, setSelectedIface] = useState("");
  const [filter, setFilter] = useState("");
  const [maxPackets, setMaxPackets] = useState(0);

  const [capturing, setCapturing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  // Fetch interfaces
  const fetchInterfaces = useCallback(async () => {
    try {
      const { data } = await api.get("/api/network/devices/");
      const ifaces = (data.interfaces || []).map((i) => i.name);
      setInterfaces(ifaces);
      if (!selectedIface && ifaces.length > 0) {
        setSelectedIface(ifaces[0]);
      }
    } catch { /* ignore */ }
  }, [selectedIface]);

  // Check if there's an active capture on load
  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get("/api/tools/capture/status/");
      if (data.active) {
        setCapturing(true);
        setStatus(data);
      } else {
        setCapturing(false);
        setStatus(null);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchInterfaces();
    fetchStatus();
  }, [fetchInterfaces, fetchStatus]);

  // Poll status while capturing
  useEffect(() => {
    if (capturing) {
      pollRef.current = setInterval(async () => {
        try {
          const { data } = await api.get("/api/tools/capture/status/");
          if (data.active) {
            setStatus(data);
          } else {
            // Capture ended on its own (max packets reached)
            setCapturing(false);
            setStatus(null);
            clearInterval(pollRef.current);
          }
        } catch { /* ignore */ }
      }, 2000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [capturing]);

  const startCapture = async () => {
    setError("");
    try {
      await api.post("/api/tools/capture/start/", {
        interface: selectedIface,
        filter: filter,
        max_packets: maxPackets,
      });
      setCapturing(true);
      // Immediate status fetch
      setTimeout(fetchStatus, 500);
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao iniciar captura.");
    }
  };

  const stopCapture = async () => {
    setStopping(true);
    setError("");
    try {
      const response = await api.post("/api/tools/capture/stop/", {}, {
        responseType: "blob",
      });

      if (response.status === 204) {
        setError("Captura vazia — nenhum pacote capturado.");
      } else {
        // Trigger download
        const disposition = response.headers["content-disposition"] || "";
        const match = disposition.match(/filename="?([^"]+)"?/);
        const filename = match ? match[1] : `capture_${Date.now()}.pcap`;

        const url = window.URL.createObjectURL(new Blob([response.data]));
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      }
    } catch (err) {
      // If the response is a blob error, try to parse it
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          setError(json.detail || "Erro ao parar captura.");
        } catch {
          setError("Erro ao parar captura.");
        }
      } else {
        setError(err.response?.data?.detail || "Erro ao parar captura.");
      }
    } finally {
      setStopping(false);
      setCapturing(false);
      setStatus(null);
    }
  };

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Packet Capture</h1>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-500 text-sm flex justify-between">
          {error}
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-300">&times;</button>
        </div>
      )}

      {/* Controls */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="w-40">
              <Label>Interface</Label>
              <select
                value={selectedIface}
                onChange={(e) => setSelectedIface(e.target.value)}
                disabled={capturing}
                className="flex h-10 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm disabled:opacity-50"
              >
                {interfaces.map((iface) => (
                  <option key={iface} value={iface}>{iface}</option>
                ))}
                <option value="any">any (todas)</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label>BPF Filter <span className="text-muted-foreground">(opcional)</span></Label>
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="ex: port 80, host 10.0.0.1, tcp and port 443"
                disabled={capturing}
              />
            </div>
            <div className="w-32">
              <Label>Max Packets <span className="text-muted-foreground">(0=ilimitado)</span></Label>
              <Input
                type="number"
                min="0"
                max="100000"
                value={maxPackets}
                onChange={(e) => setMaxPackets(parseInt(e.target.value) || 0)}
                disabled={capturing}
              />
            </div>
            <div className="flex gap-2">
              {!capturing ? (
                <Button onClick={startCapture} disabled={!selectedIface}>
                  <Play className="w-4 h-4" />
                  <span className="ml-1.5">Start</span>
                </Button>
              ) : (
                <Button variant="destructive" onClick={stopCapture} disabled={stopping}>
                  {stopping ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  <span className="ml-1.5">{stopping ? "Stopping..." : "Stop & Download"}</span>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live status */}
      {capturing && status && (
        <Card className="mt-4">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </div>
              <span className="text-sm font-medium text-red-400">Capturando...</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Interface</div>
                <div className="text-sm font-mono text-foreground">{status.interface}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Tempo</div>
                <div className="text-sm font-mono text-foreground">{formatElapsed(status.elapsed)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Tamanho</div>
                <div className="text-sm font-mono text-foreground">{formatBytes(status.pcap_size)}</div>
              </div>
              {status.filter && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Filtro</div>
                  <div className="text-sm font-mono text-foreground truncate">{status.filter}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Help */}
      <Card className="mt-4">
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">BPF Filter Examples</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {[
              ["port 80", "Tráfego HTTP"],
              ["port 443", "Tráfego HTTPS"],
              ["tcp and port 22", "SSH"],
              ["host 10.0.0.1", "Todo tráfego de/para um host"],
              ["net 192.168.1.0/24", "Toda a subnet"],
              ["icmp", "Apenas ICMP (ping)"],
              ["udp and port 53", "DNS queries"],
              ["not port 22", "Tudo exceto SSH"],
            ].map(([filter, desc]) => (
              <button
                key={filter}
                onClick={() => { if (!capturing) setFilter(filter); }}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors",
                  capturing ? "opacity-50 cursor-not-allowed" : "hover:bg-accent cursor-pointer"
                )}
              >
                <code className="text-emerald-400 font-mono">{filter}</code>
                <span className="text-muted-foreground">— {desc}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
