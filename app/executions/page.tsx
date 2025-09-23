"use client"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiGet } from "@/lib/api"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Search,
  AlertTriangle,
  CheckCircle,
  Wallet,
  LineChart,
} from "lucide-react"

// Tipo para ejecuciones exitosas
interface Fill {
  id: number;
  opportunity_id: string;
  chain_id: number;
  tx_hash: string;
  block_number: number;
  strategy: string;
  executed_at: string;
  flash_loan_amount_usd: number;
  ev_estimated_usd: number;
  ev_real_usd: number;
  gas_used: string;
  gas_price_gwei: number;
  gas_cost_eth: number;
  gas_cost_usd: number;
  fee_lender_usd: number;
  slippage_usd: number;
  profit_usd: number;
  profit_eth: number;
  roi_bps: number;
  executor_address: string;
  treasury_address: string;
  relay_used: string;
  execution_time_ms: number;
  route: string[];
}

// Tipo para ejecuciones fallidas
interface Fail {
  id: number;
  opportunity_id: string;
  chain_id: number;
  tx_hash: string | null;
  strategy: string;
  detected_at: string;
  error_type: string;
  error_message: string;
  flash_loan_amount_usd: number;
  ev_estimated_usd: number;
  executor_address: string;
}

// Tipo para métricas diarias
interface PnlDaily {
  id: number;
  date: string;
  chain_id: number;
  total_profit_usd: number;
  total_profit_eth: number;
  num_fills: number;
  avg_roi_bps: number;
  total_gas_cost_usd: number;
  total_fee_lender_usd: number;
  num_fails: number;
  fail_rate_percent: number;
  total_volume_usd: number;
}

// Mapeo de cadenas a nombres
const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  42161: "Arbitrum",
  8453: "Base",
  137: "Polygon",
  43114: "Avalanche"
}

// Obtener URL de explorador de bloques según la cadena
function getExplorerUrl(chain_id: number, tx_hash: string): string {
  switch(chain_id) {
    case 1:
      return `https://etherscan.io/tx/${tx_hash}`;
    case 10:
      return `https://optimistic.etherscan.io/tx/${tx_hash}`;
    case 42161:
      return `https://arbiscan.io/tx/${tx_hash}`;
    case 8453:
      return `https://basescan.org/tx/${tx_hash}`;
    case 137:
      return `https://polygonscan.com/tx/${tx_hash}`;
    case 43114:
      return `https://snowtrace.io/tx/${tx_hash}`;
    default:
      return `https://etherscan.io/tx/${tx_hash}`;
  }
}

// Página principal de ejecuciones
export default function ExecutionsPage() {
  const [chainFilter, setChainFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [dateRange, setDateRange] = useState<string>("7d")
  
  // Consulta para obtener ejecuciones exitosas
  const { data: fills, isLoading: isLoadingFills } = useQuery({
    queryKey: ["fills", chainFilter, dateRange],
    queryFn: () => apiGet<Fill[]>(`/api/executions/fills?chainId=${chainFilter !== "all" ? chainFilter : ""}&dateRange=${dateRange}`),
    staleTime: 30000,
  })
  
  // Consulta para obtener ejecuciones fallidas
  const { data: fails, isLoading: isLoadingFails } = useQuery({
    queryKey: ["fails", chainFilter, dateRange],
    queryFn: () => apiGet<Fail[]>(`/api/executions/fails?chainId=${chainFilter !== "all" ? chainFilter : ""}&dateRange=${dateRange}`),
    staleTime: 30000,
  })
  
  // Consulta para obtener métricas diarias
  const { data: metrics, isLoading: isLoadingMetrics } = useQuery({
    queryKey: ["metrics", dateRange],
    queryFn: () => apiGet<PnlDaily[]>(`/api/executions/metrics?dateRange=${dateRange}`),
    staleTime: 60000,
  })
  
  // Filtrar ejecuciones por búsqueda
  const filteredFills = fills?.filter(fill => 
    fill.opportunity_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    fill.tx_hash.toLowerCase().includes(searchQuery.toLowerCase()) ||
    fill.strategy.toLowerCase().includes(searchQuery.toLowerCase())
  )
  
  const filteredFails = fails?.filter(fail => 
    fail.opportunity_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (fail.tx_hash && fail.tx_hash.toLowerCase().includes(searchQuery.toLowerCase())) ||
    fail.strategy.toLowerCase().includes(searchQuery.toLowerCase()) ||
    fail.error_type.toLowerCase().includes(searchQuery.toLowerCase())
  )
  
  // Calcular métricas totales
  const totalProfitUsd = metrics?.reduce((sum, day) => sum + day.total_profit_usd, 0) || 0
  const totalGasUsd = metrics?.reduce((sum, day) => sum + day.total_gas_cost_usd, 0) || 0
  const totalFees = metrics?.reduce((sum, day) => sum + day.total_fee_lender_usd, 0) || 0
  const totalVolume = metrics?.reduce((sum, day) => sum + day.total_volume_usd, 0) || 0
  const avgRoi = metrics && metrics.length > 0 
    ? metrics.reduce((sum, day) => sum + (day.avg_roi_bps * day.num_fills), 0) / metrics.reduce((sum, day) => sum + day.num_fills, 0) 
    : 0
  const failRate = metrics && metrics.length > 0
    ? (metrics.reduce((sum, day) => sum + day.num_fails, 0) / 
      (metrics.reduce((sum, day) => sum + day.num_fills, 0) + metrics.reduce((sum, day) => sum + day.num_fails, 0))) * 100
    : 0
  
  if (isLoadingFills || isLoadingFails || isLoadingMetrics) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Ejecuciones y Métricas</h1>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-[120px]" />
          <Skeleton className="h-[120px]" />
          <Skeleton className="h-[120px]" />
          <Skeleton className="h-[120px]" />
        </div>
        <Skeleton className="h-[450px]" />
      </div>
    )
  }
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Ejecuciones y Métricas</h1>
        <div className="space-x-2">
          <Select
            value={dateRange}
            onValueChange={setDateRange}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Periodo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">Último día</SelectItem>
              <SelectItem value="7d">Últimos 7 días</SelectItem>
              <SelectItem value="30d">Últimos 30 días</SelectItem>
              <SelectItem value="all">Todo el historial</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Tarjetas de métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Beneficio Total</CardDescription>
            <CardTitle className="text-green-500">
              ${totalProfitUsd.toLocaleString('es-ES', { maximumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground flex items-center">
              <LineChart className="h-4 w-4 mr-1" />
              ROI promedio: {avgRoi.toFixed(2)} bps
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Volumen Total</CardDescription>
            <CardTitle>
              ${totalVolume.toLocaleString('es-ES', { maximumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground flex items-center">
              <ArrowUpRight className="h-4 w-4 mr-1" />
              {fills?.length || 0} ejecuciones exitosas
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Gastos Totales</CardDescription>
            <CardTitle className="text-amber-500">
              ${(totalGasUsd + totalFees).toLocaleString('es-ES', { maximumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground flex items-center">
              <ArrowDownRight className="h-4 w-4 mr-1" />
              Gas: ${totalGasUsd.toFixed(2)}, Fees: ${totalFees.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tasa de Éxito</CardDescription>
            <CardTitle>
              {(100 - failRate).toFixed(1)}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground flex items-center">
              <AlertTriangle className="h-4 w-4 mr-1" />
              {fails?.length || 0} operaciones fallidas
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Tabs para ejecuciones exitosas/fallidas */}
      <Tabs defaultValue="fills">
        <TabsList>
          <TabsTrigger value="fills">Ejecuciones Exitosas</TabsTrigger>
          <TabsTrigger value="fails">Ejecuciones Fallidas</TabsTrigger>
        </TabsList>
        
        <div className="flex items-center space-x-2 my-4">
          <div className="relative flex-grow">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por ID, hash o estrategia"
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select
            value={chainFilter}
            onValueChange={setChainFilter}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar por chain" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las cadenas</SelectItem>
              <SelectItem value="1">Ethereum</SelectItem>
              <SelectItem value="42161">Arbitrum</SelectItem>
              <SelectItem value="10">Optimism</SelectItem>
              <SelectItem value="8453">Base</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <TabsContent value="fills" className="space-y-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID / Tx Hash</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead>Estrategia</TableHead>
                  <TableHead>Flash Loan</TableHead>
                  <TableHead>Beneficio</TableHead>
                  <TableHead className="hidden md:table-cell">ROI (bps)</TableHead>
                  <TableHead className="hidden md:table-cell">Gas (USD)</TableHead>
                  <TableHead className="text-right">Ejecutado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFills && filteredFills.length > 0 ? (
                  filteredFills.map((fill) => (
                    <TableRow key={fill.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <div className="text-xs text-muted-foreground">
                            {fill.opportunity_id.slice(0, 10)}...
                          </div>
                          <a 
                            href={getExplorerUrl(fill.chain_id, fill.tx_hash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline flex items-center"
                          >
                            {fill.tx_hash.slice(0, 7)}...{fill.tx_hash.slice(-5)}
                            <ArrowUpRight className="h-3 w-3 ml-1" />
                          </a>
                        </div>
                      </TableCell>
                      <TableCell>
                        {CHAIN_NAMES[fill.chain_id] || `Chain #${fill.chain_id}`}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{fill.strategy}</Badge>
                      </TableCell>
                      <TableCell>
                        ${fill.flash_loan_amount_usd.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <span className="text-green-500 font-medium">
                          ${fill.profit_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {fill.roi_bps}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        ${fill.gas_cost_usd.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <div className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            <span>
                              {new Date(fill.executed_at).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(fill.executed_at).toLocaleDateString()}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                      No se encontraron ejecuciones exitosas
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
        
        <TabsContent value="fails" className="space-y-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead>Estrategia</TableHead>
                  <TableHead>Tipo de Error</TableHead>
                  <TableHead className="hidden md:table-cell">Mensaje</TableHead>
                  <TableHead className="hidden md:table-cell">EV Estimado</TableHead>
                  <TableHead className="text-right">Detectado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFails && filteredFails.length > 0 ? (
                  filteredFails.map((fail) => (
                    <TableRow key={fail.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <div className="text-xs">
                            {fail.opportunity_id.slice(0, 10)}...
                          </div>
                          {fail.tx_hash && (
                            <a 
                              href={getExplorerUrl(fail.chain_id, fail.tx_hash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline flex items-center text-xs"
                            >
                              {fail.tx_hash.slice(0, 7)}...
                              <ArrowUpRight className="h-3 w-3 ml-1" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {CHAIN_NAMES[fail.chain_id] || `Chain #${fail.chain_id}`}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{fail.strategy}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive">{fail.error_type}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="max-w-[200px] truncate">
                          {fail.error_message}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        ${fail.ev_estimated_usd.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <div className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            <span>
                              {new Date(fail.detected_at).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(fail.detected_at).toLocaleDateString()}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                      No se encontraron ejecuciones fallidas
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
