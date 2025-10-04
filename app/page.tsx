"use client"
import { useQuery } from "@tanstack/react-query"
import { apiGet } from "@/lib/api"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type Opportunity = {
  id: string;
  chainId: number;
  dexIn: string;
  dexOut: string;
  baseToken: string;
  quoteToken: string;
  amountIn: string;
  estProfitUsd: number;
  gasUsd: number;
  ts: number;
}

export default function Page(){
  const { data } = useQuery({
    queryKey: ["opportunities"],
    queryFn: () => apiGet<Opportunity[]>("/cf/opportunities"),
    refetchInterval: 2000,
  })

  const calculateROI = (opp: Opportunity) => {
    const amountInUsd = parseFloat(opp.amountIn);
    if (amountInUsd === 0) return 0;
    return Math.round((opp.estProfitUsd / amountInUsd) * 10000);
  }

  const avgROI = data && data.length 
    ? Math.round(data.reduce((a,b) => a + calculateROI(b), 0) / data.length) 
    : 0;

  const avgEV = data && data.length
    ? Math.round(data.reduce((a,b) => a + b.estProfitUsd, 0) / data.length)
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Opportunities</div>
          <div className="text-2xl font-semibold">{data?.length ?? 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Avg ROI (bps)</div>
          <div className="text-2xl font-semibold">{avgROI}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Avg EV (USD)</div>
          <div className="text-2xl font-semibold">{avgEV}</div>
        </Card>
      </div>
      <Card className="p-4">
        <div className="text-sm mb-3 font-medium">Oportunidades (tiempo real)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2">ID</th>
                <th>Chain ID</th>
                <th>Estrategia</th>
                <th>ROI (bps)</th>
                <th>EV (USD)</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {data && data.length > 0 ? data.map(o => (
                <tr key={o.id} className="border-t">
                  <td className="py-2">{String(o.id).slice(0,8)}…</td>
                  <td>{o.chainId}</td>
                  <td><Badge variant="secondary">{o.dexIn}→{o.dexOut}</Badge></td>
                  <td>{calculateROI(o)}</td>
                  <td>{Math.round(o.estProfitUsd).toLocaleString()}</td>
                  <td>{new Date(o.ts).toLocaleTimeString()}</td>
                </tr>
              )) : <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Sin datos aún</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
