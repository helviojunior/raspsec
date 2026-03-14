import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Save, RefreshCw, Shield, ArrowRightLeft } from "lucide-react";
import api from "lib/api";
import { Card, CardContent, CardHeader } from "components/ui/card";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { Label } from "components/ui/label";
import { Toggle } from "components/ui/toggle";
import { cn } from "lib/utils";

const CHAINS = ["internal", "implant", "outside"];
const PROTOCOLS = ["any", "tcp", "udp", "icmp"];
const ACTIONS = ["allow", "deny"];
const NAT_TYPES = ["masquerade", "snat", "dnat"];

const chainColor = {
  internal: "text-emerald-400",
  implant: "text-amber-400",
  outside: "text-red-400",
};

const actionColor = {
  allow: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  deny: "bg-red-500/15 text-red-400 border-red-500/30",
};

const RulesIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
    <path d="M480-80q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Zm0-84q97-30 162-118.5T718-480H480v-315l-240 90v207q0 7 2 18h238v336Z"/>
  </svg>
);

const NatIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
    <path d="M280-120v-80h160v-124q-49-11-87.5-41.5T296-442q-75-9-125.5-65.5T120-640v-40q0-33 23.5-56.5T200-760h80v-80h400v80h80q33 0 56.5 23.5T840-680v40q0 76-50.5 132.5T664-442q-18 46-56.5 76.5T520-324v124h160v80H280Zm0-408v-152h-80v40q0 38 22 68t58 44Zm400 0q36-14 58-44t22-68v-40h-80v152Z"/>
  </svg>
);

export default function Firewall() {
  const [activeTab, setActiveTab] = useState("rules");

  const tabs = [
    { id: "rules", label: "Regras", icon: RulesIcon },
    { id: "nat", label: "NAT", icon: NatIcon },
  ];

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold mb-6">Firewall</h1>

      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "rules" && <RulesTab />}
      {activeTab === "nat" && <NatTab />}
    </div>
  );
}

// ── Rules Tab ──

function RulesTab() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editRule, setEditRule] = useState(null);

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/api/firewall/");
      setRules(data.rules || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const deleteRule = async (id) => {
    await api.delete("/api/firewall/rule/", { data: { id } });
    fetchRules();
  };

  const toggleRule = async (rule) => {
    await api.put("/api/firewall/rule/", { ...rule, enabled: !rule.enabled });
    fetchRules();
  };

  const onSaved = () => {
    setShowForm(false);
    setEditRule(null);
    fetchRules();
  };

  const grouped = CHAINS.map((chain) => ({
    chain,
    rules: rules.filter((r) => r.chain === chain),
  }));

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={fetchRules} loading={loading}>
          <RefreshCw size={14} /> Refresh
        </Button>
        <Button size="sm" onClick={() => { setEditRule(null); setShowForm(true); }}>
          <Plus size={14} /> Nova Regra
        </Button>
      </div>

      {showForm && (
        <RuleForm
          rule={editRule}
          onSave={onSaved}
          onCancel={() => { setShowForm(false); setEditRule(null); }}
        />
      )}

      {grouped.map(({ chain, rules: chainRules }) => (
        <Card key={chain}>
          <CardHeader>
            <h2 className={cn("text-lg font-semibold capitalize", chainColor[chain])}>
              Chain {chain}
            </h2>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">Protocol</th>
                  <th className="text-left py-2 px-3 font-medium">Port</th>
                  <th className="text-left py-2 px-3 font-medium">Source</th>
                  <th className="text-center py-2 px-3 font-medium">Action</th>
                  <th className="text-left py-2 px-3 font-medium">Description</th>
                  <th className="text-center py-2 px-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {chainRules.map((rule) => (
                  <tr
                    key={rule.id}
                    className={cn(
                      "border-b border-border/50 hover:bg-muted/20 transition-colors",
                      !rule.enabled && "opacity-40"
                    )}
                  >
                    <td className="py-2 px-3 text-foreground uppercase">{rule.protocol}</td>
                    <td className="py-2 px-3 text-foreground font-mono">{rule.port || "ALL"}</td>
                    <td className="py-2 px-3 text-foreground font-mono">{rule.source_ip || "ANY"}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={cn("px-2 py-0.5 rounded text-xs font-medium border", actionColor[rule.action])}>
                        {rule.action.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">{rule.description}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center justify-center gap-1">
                        <Toggle
                          checked={rule.enabled}
                          onChange={() => toggleRule(rule)}
                          className="scale-75"
                        />
                        <button
                          onClick={() => { setEditRule(rule); setShowForm(true); }}
                          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                          title="Editar"
                        >
                          <Save size={13} />
                        </button>
                        <button
                          onClick={() => deleteRule(rule.id)}
                          className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                          title="Remover"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {chainRules.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-muted-foreground text-xs">
                      Nenhuma regra nesta chain.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RuleForm({ rule, onSave, onCancel }) {
  const [form, setForm] = useState({
    chain: rule?.chain || "internal",
    protocol: rule?.protocol || "any",
    port: rule?.port || "",
    source_ip: rule?.source_ip || "",
    action: rule?.action || "allow",
    priority: rule?.priority ?? 100,
    description: rule?.description || "",
    id: rule?.id || null,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (form.id) {
        await api.put("/api/firewall/rule/", form);
      } else {
        await api.post("/api/firewall/rule/", form);
      }
      onSave();
    } catch {
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Chain</Label>
            <select
              value={form.chain}
              onChange={(e) => setForm({ ...form, chain: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm"
            >
              {CHAINS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Protocol</Label>
            <select
              value={form.protocol}
              onChange={(e) => setForm({ ...form, protocol: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm"
            >
              {PROTOCOLS.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Port</Label>
            <Input
              value={form.port}
              onChange={(e) => setForm({ ...form, port: e.target.value })}
              placeholder="All"
            />
          </div>
          <div className="space-y-2">
            <Label>Action</Label>
            <select
              value={form.action}
              onChange={(e) => setForm({ ...form, action: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm"
            >
              {ACTIONS.map((a) => <option key={a} value={a}>{a.toUpperCase()}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Source IP</Label>
            <Input
              value={form.source_ip}
              onChange={(e) => setForm({ ...form, source_ip: e.target.value })}
              placeholder="Any"
            />
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Input
              type="number"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button onClick={handleSave} loading={saving} size="sm">
            <Save size={14} /> {form.id ? "Atualizar" : "Criar"}
          </Button>
          <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── NAT Tab ──

function NatTab() {
  const [natRules, setNatRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editRule, setEditRule] = useState(null);

  const fetchNat = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/api/firewall/");
      setNatRules(data.nat_rules || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNat(); }, [fetchNat]);

  const deleteRule = async (id) => {
    await api.delete("/api/firewall/nat/", { data: { id } });
    fetchNat();
  };

  const toggleRule = async (rule) => {
    await api.put("/api/firewall/nat/", { ...rule, enabled: !rule.enabled });
    fetchNat();
  };

  const onSaved = () => {
    setShowForm(false);
    setEditRule(null);
    fetchNat();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={fetchNat} loading={loading}>
          <RefreshCw size={14} /> Refresh
        </Button>
        <Button size="sm" onClick={() => { setEditRule(null); setShowForm(true); }}>
          <Plus size={14} /> Nova Regra NAT
        </Button>
      </div>

      {showForm && (
        <NatForm
          rule={editRule}
          onSave={onSaved}
          onCancel={() => { setShowForm(false); setEditRule(null); }}
        />
      )}

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">NAT Rules</h2>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 px-3 font-medium">Source</th>
                <th className="text-center py-2 px-3 font-medium"></th>
                <th className="text-left py-2 px-3 font-medium">Destination</th>
                <th className="text-left py-2 px-3 font-medium">Type</th>
                <th className="text-left py-2 px-3 font-medium">Protocol</th>
                <th className="text-left py-2 px-3 font-medium">Port</th>
                <th className="text-left py-2 px-3 font-medium">Description</th>
                <th className="text-center py-2 px-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {natRules.map((rule) => (
                <tr
                  key={rule.id}
                  className={cn(
                    "border-b border-border/50 hover:bg-muted/20 transition-colors",
                    !rule.enabled && "opacity-40"
                  )}
                >
                  <td className={cn("py-2 px-3 font-medium capitalize", chainColor[rule.source_chain])}>
                    {rule.source_chain}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground text-center">
                    <ArrowRightLeft size={14} className="inline" />
                  </td>
                  <td className={cn("py-2 px-3 font-medium capitalize", chainColor[rule.dest_chain])}>
                    {rule.dest_chain}
                  </td>
                  <td className="py-2 px-3 text-foreground uppercase text-xs">{rule.nat_type}</td>
                  <td className="py-2 px-3 text-foreground uppercase">{rule.protocol}</td>
                  <td className="py-2 px-3 text-foreground font-mono">{rule.port || "ALL"}</td>
                  <td className="py-2 px-3 text-muted-foreground">{rule.description}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center justify-center gap-1">
                      <Toggle
                        checked={rule.enabled}
                        onChange={() => toggleRule(rule)}
                        className="scale-75"
                      />
                      <button
                        onClick={() => { setEditRule(rule); setShowForm(true); }}
                        className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Save size={13} />
                      </button>
                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {natRules.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-muted-foreground">
                    Nenhuma regra NAT configurada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function NatForm({ rule, onSave, onCancel }) {
  const [form, setForm] = useState({
    source_chain: rule?.source_chain || "implant",
    dest_chain: rule?.dest_chain || "outside",
    nat_type: rule?.nat_type || "masquerade",
    protocol: rule?.protocol || "any",
    port: rule?.port || "",
    dest_ip: rule?.dest_ip || "",
    dest_port: rule?.dest_port || "",
    priority: rule?.priority ?? 100,
    description: rule?.description || "",
    id: rule?.id || null,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (form.id) {
        await api.put("/api/firewall/nat/", form);
      } else {
        await api.post("/api/firewall/nat/", form);
      }
      onSave();
    } catch {
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Source Chain</Label>
            <select
              value={form.source_chain}
              onChange={(e) => setForm({ ...form, source_chain: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm"
            >
              {CHAINS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Dest Chain</Label>
            <select
              value={form.dest_chain}
              onChange={(e) => setForm({ ...form, dest_chain: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm"
            >
              {CHAINS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>NAT Type</Label>
            <select
              value={form.nat_type}
              onChange={(e) => setForm({ ...form, nat_type: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm"
            >
              {NAT_TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Protocol</Label>
            <select
              value={form.protocol}
              onChange={(e) => setForm({ ...form, protocol: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm"
            >
              {["any", "tcp", "udp"].map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Port</Label>
            <Input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder="All" />
          </div>
          {form.nat_type === "dnat" && (
            <>
              <div className="space-y-2">
                <Label>Dest IP</Label>
                <Input value={form.dest_ip} onChange={(e) => setForm({ ...form, dest_ip: e.target.value })} placeholder="192.168.1.100" />
              </div>
              <div className="space-y-2">
                <Label>Dest Port</Label>
                <Input value={form.dest_port} onChange={(e) => setForm({ ...form, dest_port: e.target.value })} placeholder="8080" />
              </div>
            </>
          )}
          <div className="space-y-2 col-span-2">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button onClick={handleSave} loading={saving} size="sm">
            <Save size={14} /> {form.id ? "Atualizar" : "Criar"}
          </Button>
          <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
        </div>
      </CardContent>
    </Card>
  );
}
