import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, Network, Cable, Globe, Router } from "lucide-react";
import { useTranslation } from "react-i18next";
import api from "lib/api";
import { Card, CardContent } from "components/ui/card";
import { Button } from "components/ui/button";

const PRE_CLASSES =
  "p-4 text-xs font-mono text-foreground bg-black/30 rounded-lg overflow-x-auto whitespace-pre leading-relaxed max-h-[75vh] overflow-y-auto";

export default function NetworkStatusPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("ifconfig");

  const tabs = [
    { id: "ifconfig", label: "Ifconfig", icon: Network },
    { id: "ethtool", label: "EthTool", icon: Cable },
    { id: "arp", label: t("deviceStatus.arpTable"), icon: Globe },
    { id: "route", label: t("deviceStatus.routeTable"), icon: Router },
  ];

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold tracking-tight mb-6">{t("deviceStatus.title")}</h1>

      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto scrollbar-thin">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "ifconfig" && <IfconfigTab />}
      {activeTab === "ethtool" && <EthtoolTab />}
      {activeTab === "arp" && <ArpTab />}
      {activeTab === "route" && <RouteTab />}
    </div>
  );
}

// ── Ifconfig Tab ──

function IfconfigTab() {
  const { t } = useTranslation();
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/api/tools/device-status/");
      setOutput(data.output || "");
    } catch {
      setOutput(t("deviceStatus.errorIfconfig"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex justify-end p-2">
          <Button variant="ghost" size="sm" onClick={fetch_} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <pre className={PRE_CLASSES}>{loading ? t("common.loading") : output}</pre>
      </CardContent>
    </Card>
  );
}

// ── EthTool Tab ──

function EthtoolTab() {
  const { t } = useTranslation();
  const [interfaces, setInterfaces] = useState({});
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/api/tools/ethtool/");
      setInterfaces(data.interfaces || {});
    } catch {
      setInterfaces({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const ifaces = Object.entries(interfaces);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={fetch_} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {loading ? (
        <Card><CardContent className="p-0"><pre className={PRE_CLASSES}>{t("common.loading")}</pre></CardContent></Card>
      ) : ifaces.length === 0 ? (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">{t("deviceStatus.noInterfaces")}</CardContent></Card>
      ) : (
        ifaces.map(([name, output]) => (
          <Card key={name}>
            <CardContent className="p-0">
              <div className="px-4 py-2 border-b border-border text-sm font-semibold">{name}</div>
              <pre className={PRE_CLASSES}>{output || t("deviceStatus.noData")}</pre>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// ── ARP Tab ──

function ArpTab() {
  const { t } = useTranslation();
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/api/tools/arp/");
      setOutput(data.output || "");
    } catch {
      setOutput(t("deviceStatus.errorArp"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex justify-end p-2">
          <Button variant="ghost" size="sm" onClick={fetch_} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <pre className={PRE_CLASSES}>{loading ? t("common.loading") : output}</pre>
      </CardContent>
    </Card>
  );
}

// ── Route Tab ──

function RouteTab() {
  const { t } = useTranslation();
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/api/tools/route/");
      setOutput(data.output || "");
    } catch {
      setOutput(t("deviceStatus.errorRoute"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex justify-end p-2">
          <Button variant="ghost" size="sm" onClick={fetch_} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <pre className={PRE_CLASSES}>{loading ? t("common.loading") : output}</pre>
      </CardContent>
    </Card>
  );
}
