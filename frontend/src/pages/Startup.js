import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "contexts/AuthContext";
import { Card, CardContent } from "components/ui/card";

const POLL_MS = 500;

const statusColor = {
  healthy: "bg-emerald-500",
  unhealthy: "bg-red-500",
  degraded: "bg-amber-500",
  stopped: "bg-gray-500",
};

const statusLabel = {
  healthy: "Saudável",
  unhealthy: "Indisponível",
  degraded: "Degradado",
  stopped: "Parado",
};

export default function Startup() {
  const [services, setServices] = useState([]);
  const navigate = useNavigate();
  const { checkHealth } = useAuth();

  const fetchHealth = useCallback(async () => {
    try {
      const { data } = await axios.get("/api/health/");
      setServices(data.services || []);
      if (data.ready) {
        // Update the context's servicesReady state before navigating
        await checkHealth();
        navigate("/dashboard", { replace: true });
      }
    } catch {
      // backend not ready yet
    }
  }, [navigate, checkHealth]);

  useEffect(() => {
    fetchHealth();
    const timer = setInterval(fetchHealth, POLL_MS);
    return () => clearInterval(timer);
  }, [fetchHealth]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-4xl animate-fade-in">
        {/* Header */}
        <div className="text-center mb-10">
          <img
            src="/assets/stratasec_light.png"
            alt="RaspSec"
            className="h-12 mx-auto mb-6 drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]"
          />
          <h1 className="text-2xl font-bold text-foreground">
            RaspSec estará disponível em breve
          </h1>
        </div>

        {/* Info card */}
        <Card className="mb-10">
          <CardContent className="py-6 text-center">
            <p className="text-foreground font-semibold mb-1">
              Isso pode levar alguns minutos
            </p>
            <p className="text-sm text-primary">
              Verificando status dos serviços...
            </p>
          </CardContent>
        </Card>

        {/* Service cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {services.map((svc) => (
            <Card key={svc.slug}>
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="text-base font-semibold text-foreground">
                    {svc.friendly_name}
                  </h3>
                  <span
                    className={`inline-block w-3 h-3 rounded-full ${
                      statusColor[svc.status] || "bg-gray-500"
                    }`}
                  />
                </div>

                <div className="border-t border-border pt-3 space-y-3">
                  <div>
                    <span className="text-sm font-medium text-foreground">Status: </span>
                    <span className="text-sm text-muted-foreground">
                      {statusLabel[svc.status] || svc.status}
                    </span>
                  </div>

                  {svc.message && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-1">Mensagem</p>
                      <p className="text-sm text-muted-foreground break-words">
                        {svc.message}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
