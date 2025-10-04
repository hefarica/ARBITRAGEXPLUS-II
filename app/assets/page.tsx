"use client"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiGet } from "@/lib/api"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  InfoIcon,
  Clock 
} from "lucide-react"

interface CheckItem {
  id: string;
  passed: boolean;
  weight: number;
  note?: string;
}

interface AssetSafety {
  address: string;
  score: number;
  checks: CheckItem[];
  updatedAt: number;
}

function SafetyBadge({ score }: { score: number }) {
  if (score >= 80) {
    return <Badge className="bg-green-500 hover:bg-green-600">Seguro ({score})</Badge>
  } else if (score >= 60) {
    return <Badge className="bg-yellow-500 hover:bg-yellow-600">Precaución ({score})</Badge>
  } else {
    return <Badge variant="destructive">Riesgoso ({score})</Badge>
  }
}

export default function AssetSafetyPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [minSafetyScore, setMinSafetyScore] = useState<number>(0)

  const { 
    data: assets, 
    isLoading, 
    error 
  } = useQuery({
    queryKey: ["assetSafety"],
    queryFn: () => apiGet<AssetSafety[]>("/api/assets/safety"),
    staleTime: 60000,
  })

  const filteredAssets = assets?.filter(asset => {
    const matchesSearch = asset.address.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesSafetyScore = asset.score >= minSafetyScore
    return matchesSearch && matchesSafetyScore
  })

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
            {assets?.filter(a => a.score >= 80).length || 0}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Tokens Riesgosos (&lt;60)</div>
          <div className="text-2xl font-semibold text-red-500">
            {assets?.filter(a => a.score < 60).length || 0}
          </div>
        </Card>
      </div>
      
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-grow relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por dirección"
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setMinSafetyScore(0)}
              className={`px-3 py-2 text-sm rounded ${minSafetyScore === 0 ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
            >
              Todos
            </button>
            <button
              onClick={() => setMinSafetyScore(70)}
              className={`px-3 py-2 text-sm rounded ${minSafetyScore === 70 ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
            >
              ≥70
            </button>
            <button
              onClick={() => setMinSafetyScore(80)}
              className={`px-3 py-2 text-sm rounded ${minSafetyScore === 80 ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
            >
              ≥80
            </button>
          </div>
        </div>
        
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Checks Passed</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAssets?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                    No se encontraron resultados para su búsqueda
                  </TableCell>
                </TableRow>
              ) : (
                filteredAssets?.map((asset) => {
                  const passedChecks = asset.checks.filter(c => c.passed).length;
                  const totalChecks = asset.checks.length;
                  
                  return (
                    <TableRow key={asset.address}>
                      <TableCell className="font-mono text-xs">
                        {asset.address.slice(0, 6)}...{asset.address.slice(-4)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <SafetyBadge score={asset.score} />
                          <Progress
                            value={asset.score}
                            max={100}
                            className="h-2"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {passedChecks === totalChecks ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          )}
                          <span>{passedChecks}/{totalChecks}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(asset.updatedAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  )
                })
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
