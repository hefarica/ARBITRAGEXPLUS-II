"use client"
import { useQuery } from "@tanstack/react-query"
import { apiGet } from "@/lib/api"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type Opportunity = {
  id: string; chain_id: string; strategy: string; ev_usd: number; roi_bps: number; risk: number; route: string[]; detected_at: string
}
export default function Page(){
  const { data } = useQuery({
    queryKey: ["opportunities"],
    queryFn: () => apiGet<Opportunity[]>("/cf/opportunities"),
    refetchInterval: 2000,
  })
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-4"><div className="text-sm text-muted-foreground">Opportunities</div><div className="text-2xl font-semibold">{data?.length ?? 0}</div></Card>
        <Card className="p-4"><div className="text-sm text-muted-foreground">Avg ROI (bps)</div><div className="text-2xl font-semibold">{data&&data.length?Math.round(data.reduce((a,b)=>a+b.roi_bps,0)/data.length):0}</div></Card>
        <Card className="p-4"><div className="text-sm text-muted-foreground">Avg EV (USD)</div><div className="text-2xl font-semibold">{data&&data.length?Math.round(data.reduce((a,b)=>a+b.ev_usd,0)/data.length):0}</div></Card>
      </div>
      <Card className="p-4">
        <div className="text-sm mb-3 font-medium">Oportunidades (tiempo real)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th className="py-2">ID</th><th>Chain</th><th>Strategy</th><th>ROI (bps)</th><th>EV (USD)</th><th>Risk</th><th>Route</th><th>When</th></tr></thead>
            <tbody>
              {data?.map(o=>(
                <tr key={o.id} className="border-t">
                  <td className="py-2">{o.id.slice(0,8)}…</td>
                  <td>{o.chain_id}</td>
                  <td><Badge variant="secondary">{o.strategy}</Badge></td>
                  <td>{o.roi_bps}</td>
                  <td>{Math.round(o.ev_usd).toLocaleString()}</td>
                  <td>{o.risk}</td>
                  <td className="max-w-[280px] truncate">{o.route.join(" → ")}</td>
                  <td>{new Date(o.detected_at).toLocaleTimeString()}</td>
                </tr>
              )) ?? <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Sin datos aún</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
