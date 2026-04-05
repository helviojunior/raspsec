import React, { useState, useEffect } from "react";
import { Play, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import api from "lib/api";
import { Card, CardContent } from "components/ui/card";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { Label } from "components/ui/label";
import { cn } from "lib/utils";

const PingIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

const DnsTabIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M2 12h20" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const HttpIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const TraceIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
  </svg>
);

const DNS_TYPES = ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "SOA", "PTR", "SRV"];

export default function ConnectivityChecker() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("ping");

  const tabs = [
    { id: "ping", label: "Ping", icon: PingIcon },
    { id: "dns", label: t("connectivity.dnsCheck"), icon: DnsTabIcon },
    { id: "http", label: t("connectivity.httpCheck"), icon: HttpIcon },
    { id: "traceroute", label: "Traceroute", icon: TraceIcon },
  ];

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold tracking-tight mb-6">{t("connectivity.title")}</h1>

      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto scrollbar-thin">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "ping" && <PingTab />}
      {activeTab === "dns" && <DnsCheckTab />}
      {activeTab === "http" && <HttpCheckTab />}
      {activeTab === "traceroute" && <TracerouteTab />}
    </div>
  );
}


// ── Output display ──

function OutputBox({ output, running, runningLabel }) {
  if (!output && !running) return null;
  return (
    <Card className="mt-4">
      <CardContent className="p-0">
        <pre className="p-4 text-xs font-mono text-foreground bg-black/30 rounded-lg overflow-x-auto whitespace-pre leading-relaxed max-h-[50vh] overflow-y-auto">
          {running && !output ? runningLabel : output}
        </pre>
      </CardContent>
    </Card>
  );
}


// ── Ping ──

function PingTab() {
  const { t } = useTranslation();
  const [host, setHost] = useState("8.8.8.8");
  const [count, setCount] = useState(4);
  const [iface, setIface] = useState("");
  const [interfaces, setInterfaces] = useState([]);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api.get("/api/network/devices/").then(({ data }) => {
      setInterfaces((data.interfaces || []).map(i => i.name));
    }).catch(() => {});
  }, []);

  const run = async () => {
    setRunning(true);
    setOutput("");
    try {
      const payload = { host, count };
      if (iface) payload.interface = iface;
      const { data } = await api.post("/api/tools/ping/", payload);
      setOutput(data.output || t("connectivity.noResponse"));
    } catch (err) {
      setOutput(err.response?.data?.output || t("connectivity.errorPing"));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Label>{t("connectivity.hostIp")}</Label>
              <Input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder={t("connectivity.hostPlaceholder")}
                onKeyDown={(e) => e.key === "Enter" && run()}
              />
            </div>
            <div className="w-full sm:w-24">
              <Label>{t("connectivity.count")}</Label>
              <Input
                type="number" min="1" max="20"
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value) || 4)}
              />
            </div>
            <div className="w-full sm:w-32">
              <Label>{t("common.interface")} <span className="text-muted-foreground">({t("common.optional")})</span></Label>
              <select
                value={iface}
                onChange={(e) => setIface(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm"
              >
                <option value="">Auto</option>
                {interfaces.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <Button onClick={run} disabled={running || !host}>
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span className="ml-1.5">Ping</span>
            </Button>
          </div>
        </CardContent>
      </Card>
      <OutputBox output={output} running={running} runningLabel={t("connectivity.running")} />
    </div>
  );
}


// ── DNS Check ──

function DnsCheckTab() {
  const { t } = useTranslation();
  const [host, setHost] = useState("google.com");
  const [type, setType] = useState("A");
  const [server, setServer] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setOutput("");
    try {
      const { data } = await api.post("/api/tools/dns-check/", { host, type, server });
      setOutput(data.output || t("connectivity.noResponse"));
    } catch (err) {
      setOutput(err.response?.data?.output || t("connectivity.errorDns"));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Label>{t("connectivity.host")}</Label>
              <Input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="google.com"
                onKeyDown={(e) => e.key === "Enter" && run()}
              />
            </div>
            <div className="w-full sm:w-28">
              <Label>{t("connectivity.type")}</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm"
              >
                {DNS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="w-full sm:w-40">
              <Label>{t("connectivity.dnsServer")} <span className="text-muted-foreground">({t("common.optional")})</span></Label>
              <Input
                value={server}
                onChange={(e) => setServer(e.target.value)}
                placeholder="8.8.8.8"
              />
            </div>
            <Button onClick={run} disabled={running || !host}>
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span className="ml-1.5">Lookup</span>
            </Button>
          </div>
        </CardContent>
      </Card>
      <OutputBox output={output} running={running} runningLabel={t("connectivity.running")} />
    </div>
  );
}


// ── HTTP Check ──

function HttpCheckTab() {
  const { t } = useTranslation();
  const [url, setUrl] = useState("https://www.google.com");
  const [method, setMethod] = useState("GET");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setOutput("");
    try {
      const { data } = await api.post("/api/tools/http-check/", { url, method });
      setOutput(data.output || t("connectivity.noResponse"));
    } catch (err) {
      setOutput(err.response?.data?.output || t("connectivity.errorHttp"));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-[250px]">
              <Label>{t("connectivity.url")}</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.google.com"
                onKeyDown={(e) => e.key === "Enter" && run()}
              />
            </div>
            <div className="w-full sm:w-28">
              <Label>{t("connectivity.method")}</Label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm"
              >
                <option value="GET">GET</option>
                <option value="HEAD">HEAD</option>
              </select>
            </div>
            <Button onClick={run} disabled={running || !url}>
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span className="ml-1.5">Check</span>
            </Button>
          </div>
        </CardContent>
      </Card>
      <OutputBox output={output} running={running} runningLabel={t("connectivity.running")} />
    </div>
  );
}


// ── Traceroute ──

function TracerouteTab() {
  const { t } = useTranslation();
  const [host, setHost] = useState("8.8.8.8");
  const [maxHops, setMaxHops] = useState(20);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setOutput("");
    try {
      const { data } = await api.post("/api/tools/traceroute/", { host, max_hops: maxHops });
      setOutput(data.output || t("connectivity.noResponse"));
    } catch (err) {
      setOutput(err.response?.data?.output || t("connectivity.errorTraceroute"));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Label>{t("connectivity.hostIp")}</Label>
              <Input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder={t("connectivity.hostPlaceholder")}
                onKeyDown={(e) => e.key === "Enter" && run()}
              />
            </div>
            <div className="w-full sm:w-28">
              <Label>{t("connectivity.maxHops")}</Label>
              <Input
                type="number" min="1" max="30"
                value={maxHops}
                onChange={(e) => setMaxHops(parseInt(e.target.value) || 20)}
              />
            </div>
            <Button onClick={run} disabled={running || !host}>
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span className="ml-1.5">Trace</span>
            </Button>
          </div>
        </CardContent>
      </Card>
      <OutputBox output={output} running={running} runningLabel={t("connectivity.running")} />
    </div>
  );
}
