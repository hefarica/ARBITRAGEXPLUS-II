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
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ArrowUpRight,
  Clock,
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react"

interface Execution {
  id: string;
  status: "PENDING" | "SENT" | "MINED" | "REVERTED" | "FAILED";
  txHash?: string;
  chainId: number;
  profitUsd?: number;
  gasUsd?: number;
  createdAt: number;
  updatedAt: number;
}

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  42161: "Arbitrum",
  8453: "Base",
  137: "Polygon",
  43114: "Avalanche"
}

function getExplorerUrl(chainId: number, txHash: string): string {
  switch(chainId) {
    case 1:
      return `https://etherscan.io/tx/${txHash}`;
    case 10:
      return `https://optimistic.etherscan.io/tx/${txHash}`;
    case 42161:
      return `https://arbiscan.io/tx/${txHash}`;
    case 8453:
      return `https://basescan.org/tx/${txHash}`;
    case 137:
      return `https://polygonscan.com/tx/${txHash}`;
    case 43114:
      return `https://snowtrace.io/tx/${txHash}`;
    default:
      return `https://etherscan.io/tx/${txHash}`;
  }
}

function StatusBadge({ status }: { status: Execution["status"] }) {
  const variants: Record<Execution["status"], { className: string; icon: React.ReactNode }> = {
    PENDING: { className: "bg-yellow-500", icon: <Clock className="h-3 w-3 mr-1" /> },
    SENT: { className: "bg-blue-500", icon: <ArrowUpRight className="h-3 w-3 mr-1" /> },
    MINED: { className: "bg-green-500", icon: <CheckCircle className="h-3 w-3 mr-1" /> },
    REVERTED: { className: "bg-red-500", icon: <XCircle className="h-3 w-3 mr-1" /> },
    FAILED: { className: "bg-red-600", icon: <AlertCircle className="h-3 w-3 mr-1" /> },
  }
  
  const { className, icon } = variants[status]
  
  return (
    <Badge className={className}>
      {icon}
      {status}
    </Badge>
  )
}

export default function ExecutionsPage() {
  const [chainFilter, setChainFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  
  const { data: executions, isLoading } = useQuery({
    queryKey: ["executions", chainFilter, statusFilter],
    queryFn: () => apiGet<Execution[]>(`/api/executions?chainId=${chainFilter !== "all" ? chainFilter : ""}&status=${statusFilter !== "all" ? statusFilter : ""}`),
    staleTime: 30000,
  })
  
  const filteredExecutions = executions?.filter(exec => 
    exec.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (exec.txHash && exec.txHash.toLowerCase().includes(searchQuery.toLowerCase()))
  )
  
  const minedExecutions = executions?.filter(e => e.status === "MINED") || []
  const failedExecutions = executions?.filter(e => e.status === "FAILED" || e.status === "REVERTED") || []
  const totalProfit = minedExecutions.reduce((sum, e) => sum + (e.profitUsd || 0), 0)
  const totalGas = minedExecutions.reduce((sum, e) => sum + (e.gasUsd || 0), 0)
  
  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Ejecuciones</h1>
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
        <h1 className="text-2xl font-semibold">Ejecuciones</h1>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Ejecuciones</CardDescription>
            <CardTitle>{executions?.length || 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              {minedExecutions.length} exitosas
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Beneficio Total</CardDescription>
            <CardTitle className="text-green-500">
              ${totalProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              De {minedExecutions.length} ejecuciones
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Gas Total</CardDescription>
            <CardTitle className="text-amber-500">
              ${totalGas.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              Costo acumulado
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tasa de Éxito</CardDescription>
            <CardTitle>
              {executions && executions.length > 0
                ? ((minedExecutions.length / executions.length) * 100).toFixed(1)
                : 0}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              {failedExecutions.length} fallidas
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <div className="relative flex-grow">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por ID o hash de transacción"
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
          <Select
            value={statusFilter}
            onValueChange={setStatusFilter}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="PENDING">PENDING</SelectItem>
              <SelectItem value="SENT">SENT</SelectItem>
              <SelectItem value="MINED">MINED</SelectItem>
              <SelectItem value="REVERTED">REVERTED</SelectItem>
              <SelectItem value="FAILED">FAILED</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Chain</TableHead>
                <TableHead>Profit (USD)</TableHead>
                <TableHead>Gas (USD)</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExecutions && filteredExecutions.length > 0 ? (
                filteredExecutions.map((exec) => (
                  <TableRow key={exec.id}>
                    <TableCell className="font-mono text-xs">
                      <div className="flex flex-col">
                        <span>{exec.id.slice(0, 8)}...</span>
                        {exec.txHash && (
                          <a 
                            href={getExplorerUrl(exec.chainId, exec.txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline flex items-center"
                          >
                            {exec.txHash.slice(0, 6)}...
                            <ArrowUpRight className="h-3 w-3 ml-1" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={exec.status} />
                    </TableCell>
                    <TableCell>
                      {CHAIN_NAMES[exec.chainId] || `Chain #${exec.chainId}`}
                    </TableCell>
                    <TableCell>
                      {exec.profitUsd !== undefined ? (
                        <span className={exec.profitUsd >= 0 ? "text-green-500" : "text-red-500"}>
                          ${exec.profitUsd.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {exec.gasUsd !== undefined ? (
                        `$${exec.gasUsd.toFixed(2)}`
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-xs">
                          {new Date(exec.createdAt).toLocaleTimeString()}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(exec.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                    No se encontraron ejecuciones
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  )
}
