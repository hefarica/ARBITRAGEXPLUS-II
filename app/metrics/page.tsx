"use client"
import { useState, useMemo } from "react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Area, AreaChart, ComposedChart,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from "recharts"
import {
  ArrowUpIcon, ArrowDownIcon, TrendingUp, TrendingDown,
  Activity, DollarSign, Zap, Clock, Award, Flame,
  AlertCircle, BarChart3, PieChartIcon, Calendar
} from "lucide-react"

interface MetricsData {
  dailyProfits: Array<{
    date: string
    profit: number
    gas: number
    net: number
    executions: number
  }>
  strategyProfits: Array<{
    strategy: string
    profit: number
    count: number
    avgProfit: number
  }>
  chainDistribution: Array<{
    chain: string
    value: number
    percentage: number
  }>
  opportunityHeatmap: Array<{
    hour: number
    day: number
    value: number
    count: number
  }>
  gasAnalysis: {
    hourly: Array<{
      hour: number
      avgGas: number
      avgProfit: number
      roi: number
    }>
    profitVsGas: Array<{
      execution: string
      profit: number
      gas: number
      net: number
    }>
  }
  topPerformers: {
    strategies: Array<{
      name: string
      profit: number
      roi: number
      executions: number
    }>
    tokens: Array<{
      symbol: string
      volume: number
      profit: number
      trades: number
    }>
    timeSlots: Array<{
      timeRange: string
      avgProfit: number
      opportunities: number
    }>
  }
  summary: {
    totalProfit: number
    totalGas: number
    netProfit: number
    totalExecutions: number
    successRate: number
    avgRoi: number
    trend: "up" | "down" | "stable"
  }
}

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16']

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  42161: "Arbitrum",
  8453: "Base",
  137: "Polygon",
  43114: "Avalanche",
  56: "BSC"
}

const DAYS_OF_WEEK = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function TrendIndicator({ value, prevValue, format = "number" }: { 
  value: number, 
  prevValue?: number,
  format?: "number" | "percent" | "currency"
}) {
  const change = prevValue ? ((value - prevValue) / prevValue) * 100 : 0
  const isUp = change > 0
  
  const formatValue = (val: number) => {
    switch (format) {
      case "percent":
        return `${val.toFixed(1)}%`
      case "currency":
        return `$${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      default:
        return val.toLocaleString(undefined, { maximumFractionDigits: 2 })
    }
  }
  
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xl font-bold">{formatValue(value)}</span>
      {prevValue !== undefined && change !== 0 && (
        <div className={`flex items-center text-sm ${isUp ? 'text-green-500' : 'text-red-500'}`}>
          {isUp ? <ArrowUpIcon className="h-3 w-3" /> : <ArrowDownIcon className="h-3 w-3" />}
          <span>{Math.abs(change).toFixed(1)}%</span>
        </div>
      )}
    </div>
  )
}

function HeatmapGrid({ data }: { data: MetricsData['opportunityHeatmap'] }) {
  const maxValue = Math.max(...data.map(d => d.value), 1)
  
  const getColor = (value: number) => {
    const intensity = value / maxValue
    if (intensity === 0) return 'rgb(31, 41, 55)' // gray-800
    if (intensity < 0.2) return 'rgb(34, 197, 94, 0.2)' // green-500 20%
    if (intensity < 0.4) return 'rgb(34, 197, 94, 0.4)' // green-500 40%
    if (intensity < 0.6) return 'rgb(34, 197, 94, 0.6)' // green-500 60%
    if (intensity < 0.8) return 'rgb(34, 197, 94, 0.8)' // green-500 80%
    return 'rgb(34, 197, 94)' // green-500
  }
  
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-25 gap-1 text-xs text-muted-foreground">
        <div className="w-12"></div>
        {Array.from({ length: 24 }, (_, i) => (
          <div key={i} className="w-8 text-center">{i}h</div>
        ))}
      </div>
      {DAYS_OF_WEEK.map((day, dayIdx) => (
        <div key={dayIdx} className="grid grid-cols-25 gap-1 items-center">
          <div className="w-12 text-xs text-muted-foreground">{day}</div>
          {Array.from({ length: 24 }, (_, hourIdx) => {
            const cell = data.find(d => d.day === dayIdx && d.hour === hourIdx) || { value: 0, count: 0 }
            return (
              <div
                key={`${dayIdx}-${hourIdx}`}
                className="w-8 h-8 rounded cursor-pointer transition-all hover:scale-110 relative group"
                style={{ backgroundColor: getColor(cell.value) }}
              >
                {cell.count > 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
                    {cell.count}
                  </div>
                )}
                <div className="absolute z-10 invisible group-hover:visible bg-background border rounded p-2 -top-16 left-0 text-xs whitespace-nowrap">
                  <div>{day} {hourIdx}:00</div>
                  <div className="font-bold">${cell.value.toFixed(2)}</div>
                  <div>{cell.count} oportunidades</div>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default function MetricsPage() {
  const [selectedTab, setSelectedTab] = useState("overview")
  
  const { data: metrics, isLoading, error } = useQuery<MetricsData>({
    queryKey: ["metrics", selectedTab],
    queryFn: () => apiGet<MetricsData>("/api/metrics/dashboard"),
    refetchInterval: 5000, // Actualización cada 5 segundos
    staleTime: 4000,
  })
  
  const { data: prevMetrics } = useQuery<MetricsData>({
    queryKey: ["metrics-prev", selectedTab],
    queryFn: () => apiGet<MetricsData>("/api/metrics/dashboard?prev=true"),
    staleTime: 60000,
  })
  
  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Métricas Avanzadas</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-96" />
          ))}
        </div>
      </div>
    )
  }
  
  if (error || !metrics) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-semibold">Error al cargar métricas</h2>
        <p className="text-muted-foreground">No se pudieron obtener los datos. Intenta de nuevo.</p>
      </div>
    )
  }
  
  const hasData = metrics.summary.totalExecutions > 0
  
  if (!hasData) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <BarChart3 className="h-8 w-8" />
          Métricas Avanzadas
        </h1>
        <Card className="p-8">
          <div className="flex flex-col items-center justify-center space-y-4">
            <Activity className="h-16 w-16 text-muted-foreground animate-pulse" />
            <h2 className="text-xl font-semibold">Esperando datos...</h2>
            <p className="text-muted-foreground text-center max-w-md">
              El sistema está funcionando pero aún no hay suficientes datos para mostrar métricas.
              Los gráficos aparecerán automáticamente cuando se ejecuten transacciones.
            </p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              Actualizando cada 5 segundos
            </div>
          </div>
        </Card>
      </div>
    )
  }
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <BarChart3 className="h-8 w-8" />
          Métricas Avanzadas
        </h1>
        <div className="flex items-center gap-2 text-sm">
          <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-muted-foreground">Actualización en tiempo real</span>
        </div>
      </div>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="relative overflow-hidden">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Profit Total
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrendIndicator 
              value={metrics.summary.totalProfit} 
              prevValue={prevMetrics?.summary.totalProfit}
              format="currency"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Últimas 24 horas
            </p>
          </CardContent>
          {metrics.summary.trend === 'up' && (
            <TrendingUp className="absolute top-2 right-2 h-4 w-4 text-green-500" />
          )}
        </Card>
        
        <Card className="relative overflow-hidden">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Flame className="h-4 w-4" />
              Gas Usado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrendIndicator 
              value={metrics.summary.totalGas} 
              prevValue={prevMetrics?.summary.totalGas}
              format="currency"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Costo total de gas
            </p>
          </CardContent>
        </Card>
        
        <Card className="relative overflow-hidden">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Award className="h-4 w-4" />
              ROI Promedio
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrendIndicator 
              value={metrics.summary.avgRoi} 
              prevValue={prevMetrics?.summary.avgRoi}
              format="percent"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Retorno sobre inversión
            </p>
          </CardContent>
        </Card>
        
        <Card className="relative overflow-hidden">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Tasa de Éxito
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrendIndicator 
              value={metrics.summary.successRate} 
              prevValue={prevMetrics?.summary.successRate}
              format="percent"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.summary.totalExecutions} ejecuciones
            </p>
          </CardContent>
        </Card>
      </div>
      
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">General</TabsTrigger>
          <TabsTrigger value="profit">Profit/Loss</TabsTrigger>
          <TabsTrigger value="gas">Gas Analysis</TabsTrigger>
          <TabsTrigger value="performance">Top Performers</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6">
          {/* Profit Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Profit Diario - Últimos 30 días</CardTitle>
              <CardDescription>Evolución de ganancias, gastos y profit neto</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={metrics.dailyProfits}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" stroke="#666" />
                  <YAxis stroke="#666" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
                    labelStyle={{ color: '#9ca3af' }}
                  />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="profit" 
                    stackId="1"
                    stroke="#8b5cf6" 
                    fill="#8b5cf6" 
                    fillOpacity={0.6}
                    name="Profit Bruto"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="gas" 
                    stackId="2"
                    stroke="#ef4444" 
                    fill="#ef4444" 
                    fillOpacity={0.6}
                    name="Gas"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="net" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    name="Profit Neto"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          
          {/* Opportunities Heatmap */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Heatmap de Oportunidades
              </CardTitle>
              <CardDescription>
                Intensidad de oportunidades por hora y día de la semana
              </CardDescription>
            </CardHeader>
            <CardContent>
              <HeatmapGrid data={metrics.opportunityHeatmap} />
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="profit" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Strategy Profits */}
            <Card>
              <CardHeader>
                <CardTitle>Profit por Estrategia MEV</CardTitle>
                <CardDescription>Comparación de rentabilidad por estrategia</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={metrics.strategyProfits}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="strategy" angle={-45} textAnchor="end" height={80} stroke="#666" />
                    <YAxis stroke="#666" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
                      formatter={(value: number) => `$${value.toFixed(2)}`}
                    />
                    <Bar dataKey="profit" fill="#8b5cf6">
                      {metrics.strategyProfits.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            
            {/* Chain Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Distribución por Blockchain</CardTitle>
                <CardDescription>Porcentaje de ganancias por cadena</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={metrics.chainDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ chain, percentage }) => `${chain} ${percentage}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {metrics.chainDistribution.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
                      formatter={(value: number) => `$${value.toFixed(2)}`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="gas" className="space-y-6">
          {/* Gas vs Profit Analysis */}
          <Card>
            <CardHeader>
              <CardTitle>Análisis Gas vs Profit</CardTitle>
              <CardDescription>Comparación de costos de gas contra ganancias</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={metrics.gasAnalysis.profitVsGas.slice(0, 50)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="execution" display="none" />
                  <YAxis stroke="#666" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
                    formatter={(value: number) => `$${value.toFixed(2)}`}
                  />
                  <Legend />
                  <Bar dataKey="profit" fill="#10b981" name="Profit" />
                  <Bar dataKey="gas" fill="#ef4444" name="Gas" />
                  <Line type="monotone" dataKey="net" stroke="#8b5cf6" strokeWidth={2} name="Neto" />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          
          {/* Hourly Gas Trends */}
          <Card>
            <CardHeader>
              <CardTitle>Tendencia de Gas por Hora</CardTitle>
              <CardDescription>Costo promedio de gas y ROI por hora del día</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={metrics.gasAnalysis.hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="hour" stroke="#666" />
                  <YAxis yAxisId="left" stroke="#666" />
                  <YAxis yAxisId="right" orientation="right" stroke="#666" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
                  />
                  <Legend />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="avgGas" 
                    stroke="#ef4444" 
                    name="Gas Promedio ($)"
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="roi" 
                    stroke="#10b981" 
                    name="ROI (%)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top Strategies */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  Top 10 Estrategias
                </CardTitle>
                <CardDescription>Más rentables</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {metrics.topPerformers.strategies.slice(0, 10).map((strategy, idx) => (
                    <div key={strategy.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-muted-foreground">#{idx + 1}</span>
                        <span className="text-sm font-medium">{strategy.name}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-bold text-green-500">
                          ${strategy.profit.toFixed(2)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ROI: {strategy.roi.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            {/* Top Tokens */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-blue-500" />
                  Top 5 Tokens
                </CardTitle>
                <CardDescription>Más tradados</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {metrics.topPerformers.tokens.slice(0, 5).map((token, idx) => (
                    <div key={token.symbol} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-muted-foreground">#{idx + 1}</span>
                        <Badge variant="outline">{token.symbol}</Badge>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-bold">
                          ${(token.volume / 1000).toFixed(1)}k
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {token.trades} trades
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            {/* Best Time Slots */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-purple-500" />
                  Mejores Horarios
                </CardTitle>
                <CardDescription>Para trading</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {metrics.topPerformers.timeSlots.map((slot, idx) => (
                    <div key={slot.timeRange} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-muted-foreground">#{idx + 1}</span>
                        <span className="text-sm font-medium">{slot.timeRange}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-bold text-green-500">
                          ${slot.avgProfit.toFixed(2)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {slot.opportunities} oport.
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Add Trophy icon import at the top
import { Trophy } from "lucide-react"