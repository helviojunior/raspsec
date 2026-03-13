import React from "react";
import { Card, CardHeader, CardContent } from "components/ui/card";

export default function Dashboard() {
  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Dashboard</h1>
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Bem-vindo ao StrataAP</h2>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Selecione uma opção no menu lateral para começar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
