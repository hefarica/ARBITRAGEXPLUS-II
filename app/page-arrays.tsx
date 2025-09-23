// app/page-arrays.tsx - Ejemplo actualizado usando arrays sin hardcodeo
"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchOpportunities } from "@/lib/api-arrays";
import type { Opportunity } from "@/lib/schemas";

export default function Page() {
  const { data, isLoading, error } = useQuery<Opportunity[]>({
    queryKey: ["opportunities"],
    queryFn: fetchOpportunities,
    refetchInterval: 5_000,
  });

  if (isLoading) return <div>Cargando…</div>;
  if (error) return <div className="text-red-600">Error con datos reales.</div>;
  if (!Array.isArray(data) || data.length === 0) return <div>Sin datos.</div>;

  return (
    <div className="grid gap-4">
      {data.map((op) => (
        <div key={op.id} className="rounded-xl border p-4">
          <div className="text-sm opacity-60">Chain {op.chainId}</div>
          <div className="font-semibold">{op.dexIn} → {op.dexOut}</div>
          <div>Profit: ${op.estProfitUsd.toFixed(2)} | Gas: ${op.gasUsd.toFixed(2)}</div>
        </div>
      ))}
    </div>
  );
}
