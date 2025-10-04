"use client"

import { useState, useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Area, AreaChart, ComposedChart, RadarChart, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Radar, Treemap, Sankey, ZAxis
} from "recharts"
import {
  ArrowUpIcon, ArrowDownIcon, TrendingUp, TrendingDown,
  Activity, DollarSign, Zap, Clock, Award, Flame, Download,
  AlertCircle, BarChart3, PieChartIcon, Calendar, RefreshCw,
  Network, Droplets, Users, Target, GitBranch, Layers, History
} from "lucide-react"
import { format, subDays, startOfDay, endOfDay } from "date-fns"

const CHAIN_COLORS: Record<number, string> = {
  1: "#627EEA",     // Ethereum
  10: "#FF0420",    // Optimism
  56: "#F0B90B",    // BSC
  137: "#8247E5",   // Polygon
  42161: "#28A0F0", // Arbitrum
  43114: "#E84142", // Avalanche
  8453: "#0052FF",  // Base
}

const DEX_COLORS: Record<string, string> = {
  "uniswap-v3": "#FF007A",
  "sushiswap": "#FA52A0",
  "curve": "#F0DC4E",
  "balancer": "#1E1E1E",
  "pancakeswap": "#D1884F",
  "quickswap": "#4B4B4B",
}

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  56: "BSC",
  137: "Polygon",
  42161: "Arbitrum",
  43114: "Avalanche",
  8453: "Base",
}

type DateRange = "24h" | "7d" | "30d" | "all"

interface AnalyticsData {
  chainMetrics: {
    chainId: number
    chainName: string
    volume24h: number
    transactions: number
    avgGasPrice: number
    totalProfit: number
    totalLoss: number
    netProfit: number
    successRate: number
    opportunities: number
  }[]
  dexComparison: {
    dex: string
    volume: number
    tvl: number
    avgFees: number
    avgSlippage: number
    opportunities: number
    successRate: number
    marketShare: number
  }[]
  liquidityPools: {
    poolAddress: string
    dex: string
    tokenA: string
    tokenB: string
    liquidity: number
    volume24h: number
    apr: number
    impermanentLoss: number
  }[]
  mevCompetition: {
    activeSearchers: number
    strategies: {
      strategy: string
      successRate: number
      totalProfit: number
      avgProfit: number
      count: number
    }[]
    heatmap: {
      hour: number
      day: number
      competition: number
      profit: number
    }[]
    profitDistribution: {
      searcher: string
      profit: number
      percentage: number
    }[]
  }
  performanceKPIs: {
    totalVolume: number
    totalProfit: number
    winRate: number
    avgGas: number
    trend: "up" | "down" | "stable"
    volumeTrend: number[]
    profitTrend: number[]
    bestStrategies: {
      strategy: string
      profit: number
      roi: number
      executions: number
    }[]
    worstPairs: {
      pair: string
      losses: number
      failureRate: number
      avgLoss: number
    }[]
  }
  crossChainAnalytics: {
    flows: {
      source: string
      target: string
      value: number
    }[]
    bridgeOpportunities: {
      sourceChain: string
      targetChain: string
      token: string
      profitEstimate: number
      gasTotal: number
    }[]
    arbitrageProfitability: {
      chainPair: string
      avgProfit: number
      opportunities: number
      successRate: number
    }[]
    gasComparison: {
      chain: string
      avgGas: number
      minGas: number
      maxGas: number
      trend: number
    }[]
  }
  historicalAnalysis: {
    backtesting: {
      strategy: string
      period: string
      totalReturn: number
      sharpeRatio: number
      maxDrawdown: number
      winRate: number
    }[]
    seasonalPatterns: {
      period: string
      avgVolume: number
      avgProfit: number
      pattern: string
    }[]
    eventImpact: {
      event: string
      date: string
      impactOnVolume: number
      impactOnProfit: number
      duration: string
    }[]
    correlationMatrix: {
      tokenA: string
      tokenB: string
      correlation: number
    }[]
  }
}

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<DateRange>("7d")
  const [selectedChain, setSelectedChain] = useState<string>("all")
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [impermanentLossCalc, setImpermanentLossCalc] = useState({
    priceChangeA: 0,
    priceChangeB: 0,
    result: 0
  })

  // Fetch analytics data
  const { data: analytics, isLoading, refetch } = useQuery<AnalyticsData>({
    queryKey: ["analytics", dateRange, selectedChain],
    queryFn: async () => {
      const params = new URLSearchParams({
        dateRange,
        ...(selectedChain !== "all" && { chainId: selectedChain })
      })
      const res = await fetch(`/api/analytics?${params}`)
      if (!res.ok) throw new Error("Failed to fetch analytics")
      return res.json()
    },
    refetchInterval: autoRefresh ? 30000 : false
  })

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        refetch()
      }, 30000)
      return () => clearInterval(interval)
    }
  }, [autoRefresh, refetch])

  // Calculate impermanent loss
  const calculateImpermanentLoss = () => {
    const priceRatioChange = 
      (1 + impermanentLossCalc.priceChangeA / 100) / 
      (1 + impermanentLossCalc.priceChangeB / 100)
    
    const impermanentLoss = 
      2 * Math.sqrt(priceRatioChange) / (1 + priceRatioChange) - 1
    
    setImpermanentLossCalc(prev => ({
      ...prev,
      result: impermanentLoss * 100
    }))
  }

  // Export to CSV
  const exportToCSV = (data: any, filename: string) => {
    if (!data) return

    const headers = Object.keys(data[0] || {})
    const csvContent = [
      headers.join(","),
      ...data.map((row: any) => 
        headers.map(header => {
          const value = row[header]
          return typeof value === "object" ? JSON.stringify(value) : value
        }).join(",")
      )
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${filename}_${new Date().toISOString()}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardHeader className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-32" />
              </CardHeader>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map(i => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // No data state
  if (!analytics) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <AlertCircle className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-2xl font-semibold">No hay datos disponibles</h2>
        <p className="text-muted-foreground text-center max-w-md">
          No se encontraron datos de analytics en el período seleccionado. 
          Los datos aparecerán aquí cuando el sistema comience a procesar transacciones.
        </p>
        <Button onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Reintentar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
          <p className="text-muted-foreground">Métricas avanzadas por cadena y estrategia</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">24 horas</SelectItem>
              <SelectItem value="7d">7 días</SelectItem>
              <SelectItem value="30d">30 días</SelectItem>
              <SelectItem value="all">Todo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedChain} onValueChange={setSelectedChain}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las chains</SelectItem>
              {Object.entries(CHAIN_NAMES).map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="icon"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 ${autoRefresh ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => refetch()} size="icon" variant="outline">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="blockchain" className="space-y-4">
        <TabsList className="grid grid-cols-3 lg:grid-cols-7 w-full">
          <TabsTrigger value="blockchain">Blockchain</TabsTrigger>
          <TabsTrigger value="dex">DEXs</TabsTrigger>
          <TabsTrigger value="liquidity">Liquidez</TabsTrigger>
          <TabsTrigger value="mev">MEV</TabsTrigger>
          <TabsTrigger value="performance">Rendimiento</TabsTrigger>
          <TabsTrigger value="crosschain">Cross-chain</TabsTrigger>
          <TabsTrigger value="historical">Histórico</TabsTrigger>
        </TabsList>

        {/* 1. Blockchain Metrics */}
        <TabsContent value="blockchain" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {analytics.chainMetrics?.map(chain => (
              <Card key={chain.chainId} className="relative overflow-hidden">
                <div 
                  className="absolute inset-0 opacity-5"
                  style={{ backgroundColor: CHAIN_COLORS[chain.chainId] }}
                />
                <CardHeader className="relative">
                  <CardTitle className="flex items-center justify-between">
                    <span>{chain.chainName}</span>
                    <Badge variant={chain.netProfit > 0 ? "default" : "destructive"}>
                      {chain.netProfit > 0 ? "+" : ""}{chain.netProfit.toFixed(2)} USD
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="relative space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Volumen 24h</span>
                    <span className="font-medium">${chain.volume24h.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Transacciones</span>
                    <span className="font-medium">{chain.transactions.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Gas promedio</span>
                    <span className="font-medium">${chain.avgGasPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Success rate</span>
                    <span className="font-medium">{chain.successRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Oportunidades</span>
                    <span className="font-medium">{chain.opportunities}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Comparación de Profit/Loss por Blockchain</CardTitle>
              <Button
                size="sm"
                variant="outline"
                className="absolute top-4 right-4"
                onClick={() => exportToCSV(analytics.chainMetrics, "chain_metrics")}
              >
                <Download className="h-4 w-4 mr-1" />
                CSV
              </Button>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={analytics.chainMetrics}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="chainName" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }}
                  />
                  <Legend />
                  <Bar dataKey="totalProfit" fill="#10b981" name="Profit" />
                  <Bar dataKey="totalLoss" fill="#ef4444" name="Loss" />
                  <Bar dataKey="netProfit" fill="#3b82f6" name="Net Profit" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. DEX Comparison */}
        <TabsContent value="dex" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Comparación de DEXs</CardTitle>
              <CardDescription>Métricas de rendimiento por exchange descentralizado</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DEX</TableHead>
                    <TableHead className="text-right">Volumen</TableHead>
                    <TableHead className="text-right">TVL</TableHead>
                    <TableHead className="text-right">Fees Promedio</TableHead>
                    <TableHead className="text-right">Slippage</TableHead>
                    <TableHead className="text-right">Oportunidades</TableHead>
                    <TableHead className="text-right">Success Rate</TableHead>
                    <TableHead className="text-right">Market Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.dexComparison?.map(dex => (
                    <TableRow key={dex.dex}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: DEX_COLORS[dex.dex] || "#666" }}
                          />
                          {dex.dex}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        ${dex.volume.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        ${dex.tvl.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {dex.avgFees.toFixed(3)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {dex.avgSlippage.toFixed(3)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {dex.opportunities}
                      </TableCell>
                      <TableCell className="text-right">
                        {dex.successRate.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {dex.marketShare.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Market Share por DEX</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={analytics.dexComparison}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.dex}: ${entry.marketShare.toFixed(1)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="marketShare"
                    >
                      {analytics.dexComparison?.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={DEX_COLORS[entry.dex] || CHAIN_COLORS[index % CHAIN_COLORS.length]} 
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Oportunidades por DEX</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analytics.dexComparison} layout="horizontal">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis type="category" dataKey="dex" className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="opportunities" fill="#8b5cf6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 3. Liquidity Analysis */}
        <TabsContent value="liquidity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top 20 Pools por Liquidez</CardTitle>
              <CardDescription>Análisis de los pools más líquidos</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    type="number"
                    dataKey="liquidity"
                    name="Liquidez"
                    unit="$"
                    className="text-xs"
                  />
                  <YAxis
                    type="number"
                    dataKey="volume24h"
                    name="Volumen 24h"
                    unit="$"
                    className="text-xs"
                  />
                  <ZAxis
                    type="number"
                    dataKey="apr"
                    range={[100, 1000]}
                    name="APR"
                  />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter
                    name="Pools"
                    data={analytics.liquidityPools?.slice(0, 20)}
                    fill="#8884d8"
                  >
                    {analytics.liquidityPools?.slice(0, 20).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHAIN_COLORS[index % CHAIN_COLORS.length]} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Concentración de Liquidez por Token</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <Treemap
                    data={analytics.liquidityPools?.map(pool => ({
                      name: `${pool.tokenA}/${pool.tokenB}`,
                      size: pool.liquidity,
                      fill: DEX_COLORS[pool.dex] || "#8884d8"
                    }))}
                    dataKey="size"
                    aspectRatio={4 / 3}
                    stroke="#fff"
                    fill="#8884d8"
                  />
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Calculadora de Impermanent Loss</CardTitle>
                <CardDescription>Estima la pérdida impermanente en pools de liquidez</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Cambio de precio Token A (%)</Label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[impermanentLossCalc.priceChangeA]}
                      onValueChange={([v]) => setImpermanentLossCalc(prev => ({...prev, priceChangeA: v}))}
                      min={-90}
                      max={500}
                      step={1}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={impermanentLossCalc.priceChangeA}
                      onChange={(e) => setImpermanentLossCalc(prev => ({
                        ...prev,
                        priceChangeA: parseFloat(e.target.value) || 0
                      }))}
                      className="w-20"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cambio de precio Token B (%)</Label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[impermanentLossCalc.priceChangeB]}
                      onValueChange={([v]) => setImpermanentLossCalc(prev => ({...prev, priceChangeB: v}))}
                      min={-90}
                      max={500}
                      step={1}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={impermanentLossCalc.priceChangeB}
                      onChange={(e) => setImpermanentLossCalc(prev => ({
                        ...prev,
                        priceChangeB: parseFloat(e.target.value) || 0
                      }))}
                      className="w-20"
                    />
                  </div>
                </div>
                <Button onClick={calculateImpermanentLoss} className="w-full">
                  Calcular
                </Button>
                {impermanentLossCalc.result !== 0 && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Impermanent Loss</p>
                    <p className={`text-2xl font-bold ${impermanentLossCalc.result < 0 ? "text-destructive" : "text-primary"}`}>
                      {impermanentLossCalc.result.toFixed(2)}%
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 4. MEV Competition Analysis */}
        <TabsContent value="mev" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Searchers Activos</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analytics.mevCompetition?.activeSearchers || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Competidores en las últimas 24h
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Success Rate por Estrategia</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={analytics.mevCompetition?.strategies}>
                  <PolarGrid strokeDasharray="3 3" className="stroke-muted" />
                  <PolarAngleAxis dataKey="strategy" className="text-xs" />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} />
                  <Radar
                    name="Success Rate"
                    dataKey="successRate"
                    stroke="#8b5cf6"
                    fill="#8b5cf6"
                    fillOpacity={0.6}
                  />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Competition Heatmap</CardTitle>
                <CardDescription>Intensidad de competencia por hora y día</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-24 gap-1">
                  {analytics.mevCompetition?.heatmap?.map((cell, index) => (
                    <div
                      key={index}
                      className="aspect-square rounded-sm relative group"
                      style={{
                        backgroundColor: `rgba(139, 92, 246, ${cell.competition / 100})`,
                      }}
                    >
                      <div className="opacity-0 group-hover:opacity-100 absolute inset-0 flex items-center justify-center bg-background/90 rounded-sm transition-opacity">
                        <span className="text-xs">{cell.competition}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>00:00</span>
                  <span>12:00</span>
                  <span>23:59</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Distribución de Profit</CardTitle>
                <CardDescription>Top searchers por ganancias</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={analytics.mevCompetition?.profitDistribution?.slice(0, 10)}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      fill="#8884d8"
                      paddingAngle={5}
                      dataKey="profit"
                    >
                      {analytics.mevCompetition?.profitDistribution?.slice(0, 10).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHAIN_COLORS[index % CHAIN_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 5. Performance Dashboard */}
        <TabsContent value="performance" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Volume</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${analytics.performanceKPIs?.totalVolume?.toLocaleString() || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {analytics.performanceKPIs?.trend === "up" ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> Tendencia alcista
                    </span>
                  ) : analytics.performanceKPIs?.trend === "down" ? (
                    <span className="text-red-600 flex items-center gap-1">
                      <TrendingDown className="h-3 w-3" /> Tendencia bajista
                    </span>
                  ) : (
                    <span>Estable</span>
                  )}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
                <Award className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  ${analytics.performanceKPIs?.totalProfit?.toLocaleString() || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Ganancias acumuladas
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analytics.performanceKPIs?.winRate?.toFixed(1) || 0}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Tasa de éxito
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Gas</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${analytics.performanceKPIs?.avgGas?.toFixed(2) || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Gas promedio por tx
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Best Performing Strategies</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analytics.performanceKPIs?.bestStrategies?.map((strategy, index) => (
                    <div key={strategy.strategy} className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{strategy.strategy}</span>
                          <Badge variant="outline">
                            ROI: {strategy.roi.toFixed(2)}%
                          </Badge>
                        </div>
                        <div className="flex justify-between text-sm text-muted-foreground mt-1">
                          <span>${strategy.profit.toLocaleString()}</span>
                          <span>{strategy.executions} ejecuciones</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Worst Performing Pairs</CardTitle>
                <CardDescription>Pares a evitar por alto ratio de pérdidas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analytics.performanceKPIs?.worstPairs?.map(pair => (
                    <div key={pair.pair} className="flex items-center justify-between p-2 border rounded-lg">
                      <div>
                        <p className="font-medium">{pair.pair}</p>
                        <p className="text-xs text-muted-foreground">
                          Avg Loss: ${pair.avgLoss.toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant="destructive">
                          {pair.failureRate.toFixed(1)}% fail
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          -${pair.losses.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Trend Analysis</CardTitle>
              <CardDescription>Evolución de volumen y profit</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={analytics.performanceKPIs?.volumeTrend?.map((v, i) => ({
                  index: i,
                  volume: v,
                  profit: analytics.performanceKPIs?.profitTrend?.[i] || 0
                }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="index" className="text-xs" />
                  <YAxis yAxisId="left" className="text-xs" />
                  <YAxis yAxisId="right" orientation="right" className="text-xs" />
                  <Tooltip />
                  <Legend />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="volume"
                    fill="#8b5cf6"
                    stroke="#8b5cf6"
                    fillOpacity={0.3}
                    name="Volume"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="profit"
                    stroke="#10b981"
                    strokeWidth={2}
                    name="Profit"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 6. Cross-chain Analytics */}
        <TabsContent value="crosschain" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Flujo de Fondos entre Chains</CardTitle>
              <CardDescription>Visualización del movimiento de capital entre blockchains</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <Sankey
                  data={{
                    nodes: [
                      ...Object.values(CHAIN_NAMES).map(name => ({ name }))
                    ],
                    links: analytics.crossChainAnalytics?.flows || []
                  }}
                  margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                  link={{ stroke: "#8b5cf6" }}
                  nodeWidth={15}
                  nodeGap={15}
                  nodePadding={10}
                />
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bridge Opportunities</CardTitle>
              <CardDescription>Oportunidades de arbitraje detectadas entre chains</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source Chain</TableHead>
                    <TableHead>Target Chain</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead className="text-right">Profit Estimate</TableHead>
                    <TableHead className="text-right">Gas Total</TableHead>
                    <TableHead className="text-right">Net Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.crossChainAnalytics?.bridgeOpportunities?.map((opp, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{opp.sourceChain}</TableCell>
                      <TableCell>{opp.targetChain}</TableCell>
                      <TableCell className="font-medium">{opp.token}</TableCell>
                      <TableCell className="text-right text-green-600">
                        ${opp.profitEstimate.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        ${opp.gasTotal.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        ${(opp.profitEstimate - opp.gasTotal).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Cross-chain Arbitrage Profitability</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analytics.crossChainAnalytics?.arbitrageProfitability}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="chainPair" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="avgProfit" fill="#10b981" name="Avg Profit" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Gas Cost Comparison</CardTitle>
                <CardDescription>Comparación de costos de gas entre chains</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analytics.crossChainAnalytics?.gasComparison}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="chain" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="avgGas"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      name="Avg Gas"
                    />
                    <Line
                      type="monotone"
                      dataKey="minGas"
                      stroke="#10b981"
                      strokeDasharray="5 5"
                      name="Min Gas"
                    />
                    <Line
                      type="monotone"
                      dataKey="maxGas"
                      stroke="#ef4444"
                      strokeDasharray="5 5"
                      name="Max Gas"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 7. Historical Analysis */}
        <TabsContent value="historical" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Backtesting Results</CardTitle>
              <CardDescription>Resultados históricos de estrategias</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Strategy</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Total Return</TableHead>
                    <TableHead className="text-right">Sharpe Ratio</TableHead>
                    <TableHead className="text-right">Max Drawdown</TableHead>
                    <TableHead className="text-right">Win Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.historicalAnalysis?.backtesting?.map(test => (
                    <TableRow key={`${test.strategy}-${test.period}`}>
                      <TableCell className="font-medium">{test.strategy}</TableCell>
                      <TableCell>{test.period}</TableCell>
                      <TableCell className="text-right">
                        <span className={test.totalReturn > 0 ? "text-green-600" : "text-red-600"}>
                          {test.totalReturn > 0 ? "+" : ""}{test.totalReturn.toFixed(2)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{test.sharpeRatio.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-red-600">
                        {test.maxDrawdown.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right">{test.winRate.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Seasonal Patterns</CardTitle>
                <CardDescription>Patrones estacionales detectados</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analytics.historicalAnalysis?.seasonalPatterns}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="period" className="text-xs" />
                    <YAxis yAxisId="left" className="text-xs" />
                    <YAxis yAxisId="right" orientation="right" className="text-xs" />
                    <Tooltip />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="avgVolume"
                      stroke="#8b5cf6"
                      name="Avg Volume"
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="avgProfit"
                      stroke="#10b981"
                      name="Avg Profit"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Event Impact Analysis</CardTitle>
                <CardDescription>Impacto de eventos importantes en el mercado</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analytics.historicalAnalysis?.eventImpact?.map(event => (
                    <div key={event.event} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-semibold">{event.event}</h4>
                          <p className="text-sm text-muted-foreground">{event.date}</p>
                        </div>
                        <Badge variant="outline">{event.duration}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mt-2">
                        <div>
                          <p className="text-xs text-muted-foreground">Impacto en Volumen</p>
                          <p className={`font-semibold ${event.impactOnVolume > 0 ? "text-green-600" : "text-red-600"}`}>
                            {event.impactOnVolume > 0 ? "+" : ""}{event.impactOnVolume.toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Impacto en Profit</p>
                          <p className={`font-semibold ${event.impactOnProfit > 0 ? "text-green-600" : "text-red-600"}`}>
                            {event.impactOnProfit > 0 ? "+" : ""}{event.impactOnProfit.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Token Correlation Matrix</CardTitle>
              <CardDescription>Correlación entre diferentes tokens</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <div className="grid grid-cols-6 gap-2 min-w-[500px]">
                  {analytics.historicalAnalysis?.correlationMatrix?.map((corr, idx) => (
                    <div
                      key={idx}
                      className="aspect-square flex items-center justify-center rounded text-xs font-medium"
                      style={{
                        backgroundColor: `rgba(139, 92, 246, ${Math.abs(corr.correlation)})`,
                        color: Math.abs(corr.correlation) > 0.5 ? "white" : "inherit"
                      }}
                    >
                      {corr.correlation.toFixed(2)}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}