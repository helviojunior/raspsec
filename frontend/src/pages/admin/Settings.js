import React, { useState, useEffect, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { Settings as SettingsIcon, Save, Eye, EyeOff, User, Key, Plus, Trash2, Server } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "contexts/AuthContext";
import api, { setToken } from "lib/api";
import { Card, CardContent, CardHeader } from "components/ui/card";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { Label } from "components/ui/label";
import { Toggle } from "components/ui/toggle";
import { cn } from "lib/utils";

const tabs = [
  { id: "system", label: "settings.tabs.system", icon: Server },
  { id: "profile", label: "settings.tabs.profile", icon: User },
  { id: "ssh", label: "settings.tabs.ssh", icon: Key },
];

function SystemTab() {
  const { t } = useTranslation();
  const [hostname, setHostname] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/api/admin/system/");
        setHostname(data.hostname || "");
        setOriginal(data.hostname || "");
      } catch {
        setError(t("settings.system.loadError"));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const { data } = await api.put("/api/admin/system/", { hostname });
      setSuccess(data.detail || t("settings.system.hostnameUpdated"));
      setOriginal(hostname);
    } catch (err) {
      setError(err.response?.data?.detail || t("settings.system.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Server size={18} /> {t("settings.system.title")}
        </h2>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-500 text-sm">{error}</div>
        )}
        {success && (
          <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-sm">{success}</div>
        )}

        <div className="space-y-2 max-w-md">
          <Label>{t("settings.system.hostname")}</Label>
          <Input
            value={hostname}
            onChange={(e) => setHostname(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="raspsec"
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">
            {t("settings.system.hostnameHint")}
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} loading={saving} disabled={hostname === original || !hostname}>
            <Save size={14} /> {t("common.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileTab({ user, loginUser }) {
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [lastName, setLastName] = useState(user?.last_name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSave = async () => {
    setError("");
    setSuccess("");

    if (newPassword && newPassword !== confirmPassword) {
      setError(t("settings.profile.errorMismatch"));
      return;
    }
    if (newPassword && !currentPassword) {
      setError(t("settings.profile.errorCurrentRequired"));
      return;
    }

    setSaving(true);
    try {
      const payload = { first_name: firstName, last_name: lastName };
      if (newPassword) {
        payload.current_password = currentPassword;
        payload.new_password = newPassword;
      }
      const { data } = await api.put("/api/auth/me/", payload);
      if (data.token) setToken(data.token);
      if (data.user) loginUser(data.user, data.token || undefined);
      setSuccess(data.detail || t("settings.profile.updated"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.response?.data?.detail || t("settings.profile.errorUpdate"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <User size={18} /> {t("settings.profile.title")}
        </h2>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-500 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-sm">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("settings.profile.firstName")}</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={t("settings.profile.firstNamePlaceholder")} />
          </div>
          <div className="space-y-2">
            <Label>{t("settings.profile.lastName")}</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder={t("settings.profile.lastNamePlaceholder")} />
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-4">{t("settings.profile.changePassword")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { id: "cur", label: t("settings.profile.currentPassword"), value: currentPassword, set: setCurrentPassword, show: showCurrent, toggle: () => setShowCurrent(!showCurrent) },
              { id: "new", label: t("settings.profile.newPassword"), value: newPassword, set: setNewPassword, show: showNew, toggle: () => setShowNew(!showNew) },
              { id: "conf", label: t("settings.profile.confirmPassword"), value: confirmPassword, set: setConfirmPassword, show: showConfirm, toggle: () => setShowConfirm(!showConfirm) },
            ].map((f) => (
              <div key={f.id} className="space-y-2">
                <Label>{f.label}</Label>
                <div className="relative">
                  <Input type={f.show ? "text" : "password"} value={f.value} onChange={(e) => f.set(e.target.value)} className="pr-10" />
                  <button type="button" onClick={f.toggle} className="btn-icon absolute right-3 top-1/2 -translate-y-1/2 p-0 leading-none text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {f.show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">{t("settings.profile.passwordHint")}</p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} loading={saving}><Save size={14} /> {t("common.save")}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SSHKeysTab() {
  const { t } = useTranslation();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/api/admin/ssh-keys/");
      setKeys(data.keys || []);
    } catch {
      setError(t("settings.ssh.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(""), 4000); return () => clearTimeout(t); } }, [success]);

  const addKey = async () => {
    setError("");
    setSaving(true);
    try {
      const { data } = await api.post("/api/admin/ssh-keys/", { name, key: keyValue });
      setSuccess(data.detail);
      setName("");
      setKeyValue("");
      fetchKeys();
    } catch (err) {
      setError(err.response?.data?.detail || t("settings.ssh.addError"));
    } finally {
      setSaving(false);
    }
  };

  const toggleKey = async (index, enabled) => {
    await api.put("/api/admin/ssh-keys/", { index, enabled });
    fetchKeys();
  };

  const deleteKey = async (index) => {
    if (!window.confirm(t("settings.ssh.deleteConfirm"))) return;
    try {
      const { data } = await api.delete("/api/admin/ssh-keys/", { data: { index } });
      setSuccess(data.detail);
      fetchKeys();
    } catch (err) {
      setError(err.response?.data?.detail || t("settings.ssh.deleteError"));
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-500 text-sm flex justify-between">
          {error}
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-300">&times;</button>
        </div>
      )}
      {success && (
        <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-sm">
          {success}
        </div>
      )}

      {/* Add key form */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Plus size={18} /> {t("settings.ssh.addTitle")}
          </h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label>{t("settings.ssh.name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("settings.ssh.namePlaceholder")} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>{t("settings.ssh.publicKey")}</Label>
              <Input value={keyValue} onChange={(e) => setKeyValue(e.target.value)} placeholder={t("settings.ssh.publicKeyPlaceholder")} className="font-mono text-xs" />
            </div>
            <Button onClick={addKey} loading={saving} disabled={!name || !keyValue}>
              <Plus size={14} /> {t("settings.ssh.add")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Key list */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Key size={18} /> {t("settings.ssh.registeredTitle")}
          </h2>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm py-4 text-center">{t("settings.ssh.loading")}</p>
          ) : keys.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">{t("settings.ssh.empty")}</p>
          ) : (
            <div className="space-y-2">
              {keys.map((k, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-md border border-border",
                    !k.enabled && "opacity-40"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground">{k.name}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                      {k.key?.substring(0, 80)}...
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Toggle checked={k.enabled} onChange={() => toggleKey(i, !k.enabled)} />
                    <button
                      onClick={() => deleteKey(i)}
                      className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                      title={t("settings.ssh.remove")}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Settings() {
  const { t } = useTranslation();
  const { user, loginUser } = useAuth();
  const [activeTab, setActiveTab] = useState("system");

  if (!user?.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("settings.title")}</h1>
        <p className="text-muted-foreground mt-2 flex items-center gap-2">
          <SettingsIcon className="w-4 h-4" />
          {t("settings.subtitle")}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon size={16} />
            {t(tab.label)}
          </button>
        ))}
      </div>

      {activeTab === "system" && <SystemTab />}
      {activeTab === "profile" && <ProfileTab user={user} loginUser={loginUser} />}
      {activeTab === "ssh" && <SSHKeysTab />}
    </div>
  );
}
