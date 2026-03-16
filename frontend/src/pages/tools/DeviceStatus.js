import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import api from "lib/api";
import { Card, CardContent } from "components/ui/card";
import { Button } from "components/ui/button";

export default function DeviceStatus() {
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/api/tools/device-status/");
      setOutput(data.output || "");
    } catch {
      setOutput("Erro ao carregar status do dispositivo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Device Status</h1>
        <Button variant="outline" size="sm" onClick={fetchStatus} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <pre className="p-4 text-xs font-mono text-foreground bg-black/30 rounded-lg overflow-x-auto whitespace-pre leading-relaxed max-h-[75vh] overflow-y-auto">
            {loading ? "Carregando..." : output}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
