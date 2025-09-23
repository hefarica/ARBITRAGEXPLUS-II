"use client"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiGet } from "@/lib/api"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  ShieldCheck, 
  ShieldAlert, 
  InfoIcon,
  Clock 
} from "lucide-react"

// Tipos para los datos de seguridad de activos
interface AssetSafety {
  id: number;
  token_addr: string;
  chain_id: number;
  symbol: string;
  name: string;
  decimals: number;
  age_days: number;
  has_oracle: boolean;
  is_fee_on_transfer: boolean;
  has_blacklist_function: boolean;
  has_whitelist_function: boolean;
  is_mintable: boolean;
  is_pausable: boolean;
  has_proxy: boolean;
  is_verified_source: boolean;
  owner_addr: string;
  has_owner_powers: boolean;
  owner_powers_level: number;
  liq_depth_at_5bps: number;
  liquidity_score: number;
  safety_score: number;
  reasons: string[];
  scanned_at: string;
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

// Componente para mostrar el nivel de seguridad
function SafetyBadge({ score }: { score: number }) {
  if (score >= 80) {
    return <Badge className="bg-green-500 hover:bg-green-600">Seguro ({score})</Badge>
  } else if (score >= 60) {
    return <Badge className="bg-yellow-500 hover:bg-yellow-600">Precaución ({score})</Badge>
  } else {
    return <Badge variant="destructive">Riesgoso ({score})</Badge>
  }
}

// Página principal de Asset Safety
export default function AssetSafetyPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [chainFilter, setChainFilter] = useState<string>("all")
  const [minSafetyScore, setMinSafetyScore] = useState<number>(0)

  // Consulta para obtener los datos de seguridad de activos
  const { 
    data: assets, 
    isLoading, 
    error 
  } = useQuery({
    queryKey: ["assetSafety"],
    queryFn: () => apiGet<AssetSafety[]>("/api/assets/safety"),
    staleTime: 60000, // 1 minuto
  })

  // Filtrar activos según los criterios
  const filteredAssets = assets?.filter(asset => {
    const matchesSearch = 
      asset.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.token_addr.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesChain = chainFilter === "all" || asset.chain_id.toString() === chainFilter
    const matchesSafetyScore = asset.safety_score >= minSafetyScore
    
    return matchesSearch && matchesChain && matchesSafetyScore
  })

  // Componente para mostrar razones de seguridad
  const RenderReasons = ({ reasons }: { reasons: string[] }) => {
    if (!reasons || reasons.length === 0) return <span className="text-green-500">Sin alertas</span>
    
    return (
      <div className="space-y-1">
        {reasons.slice(0, 2).map((reason, index) => (
          <div key={index} className="text-xs flex items-center">
            <AlertTriangle className="h-3 w-3 text-amber-500 mr-1" />
            <span>{reason}</span>
          </div>
        ))}
        {reasons.length > 2 && (
          <div className="text-xs text-muted-foreground">
            + {reasons.length - 2} más
          </div>
        )}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Asset Safety (Anti-Rugpull)</h1>
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </div>
        <Skeleton className="h-[500px] w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Asset Safety (Anti-Rugpull)</h1>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            No se pudieron cargar los datos de seguridad de activos. Por favor, intente nuevamente.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Asset Safety (Anti-Rugpull)</h1>
        <Badge variant="outline" className="flex items-center">
          <Clock className="mr-1 h-4 w-4" />
          Actualizado: {new Date().toLocaleTimeString()}
        </Badge>
      </div>
      
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Tokens Analizados</div>
          <div className="text-2xl font-semibold">{assets?.length || 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Tokens Seguros (≥80)</div>
          <div className="text-2xl font-semibold text-green-500">
            {assets?.filter(a => a.safety_score >= 80).length || 0}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Tokens Riesgosos (&lt;60)</div>
          <div className="text-2xl font-semibold text-red-500">
            {assets?.filter(a => a.safety_score < 60).length || 0}
          </div>
        </Card>
      </div>
      
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-grow relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por símbolo, nombre o dirección"
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select
            value={chainFilter}
            onValueChange={(value) => setChainFilter(value)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtrar por cadena" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las cadenas</SelectItem>
              <SelectItem value="1">Ethereum</SelectItem>
              <SelectItem value="42161">Arbitrum</SelectItem>
              <SelectItem value="10">Optimism</SelectItem>
              <SelectItem value="8453">Base</SelectItem>
              <SelectItem value="137">Polygon</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={minSafetyScore.toString()}
            onValueChange={(value) => setMinSafetyScore(parseInt(value))}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Mínimo Safety Score" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Todos los tokens</SelectItem>
              <SelectItem value="50">Mínimo 50 (Básico)</SelectItem>
              <SelectItem value="70">Mínimo 70 (Recomendado)</SelectItem>
              <SelectItem value="80">Mínimo 80 (Seguro)</SelectItem>
              <SelectItem value="90">Mínimo 90 (Ultra seguro)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Token</TableHead>
                <TableHead>Chain</TableHead>
                <TableHead>Edad</TableHead>
                <TableHead className="hidden md:table-cell">Liquidez (5bps)</TableHead>
                <TableHead className="hidden md:table-cell">Alertas</TableHead>
                <TableHead>Safety Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAssets?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                    No se encontraron resultados para su búsqueda
                  </TableCell>
                </TableRow>
              ) : (
                filteredAssets?.map((asset) => (
                  <TableRow key={`${asset.chain_id}-${asset.token_addr}`}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <div className="flex items-center">
                          <span className="font-bold">{asset.symbol}</span>
                          {asset.is_fee_on_transfer && (
                            <Badge variant="outline" className="ml-2 text-amber-500">FOT</Badge>
                          )}
                          {asset.is_mintable && (
                            <Badge variant="outline" className="ml-2 text-amber-500">Mint</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {asset.name}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {CHAIN_NAMES[asset.chain_id] || `Chain #${asset.chain_id}`}
                    </TableCell>
                    <TableCell>
                      {asset.age_days < 30 ? (
                        <Badge variant="outline" className="text-amber-500">
                          {asset.age_days} días
                        </Badge>
                      ) : (
                        <span>{asset.age_days} días</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      ${asset.liq_depth_at_5bps?.toLocaleString() || "N/A"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <RenderReasons reasons={asset.reasons} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <SafetyBadge score={asset.safety_score} />
                        <Progress
                          value={asset.safety_score}
                          max={100}
                          className="h-2"
                          style={{
                            background: "#333",
                            '--progress-background': asset.safety_score >= 80 ? 'rgb(34, 197, 94)' : 
                              asset.safety_score >= 60 ? 'rgb(234, 179, 8)' : 'rgb(239, 68, 68)'
                          } as React.CSSProperties}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
        
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <InfoIcon className="h-4 w-4" />
          <span>
            El Asset Safety Score evalúa el riesgo de tokens mediante análisis on-chain. 
            Score ≥70 recomendado para operaciones.
          </span>
        </div>
      </div>
    </div>
  )
}
