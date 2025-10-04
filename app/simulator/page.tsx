"use client"

import { useState, useEffect, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, Scatter,
  ComposedChart, ReferenceLine
} from "recharts"
import {
  TrendingUp, Calculator, AlertTriangle, DollarSign,
  Activity, RefreshCw, Zap, Target, Brain,
  ChevronRight, Info, Wallet, History, Play,
  BarChart3, Droplet, Clock, Shield
} from "lucide-react"

// DEX configurations with real fees
const DEX_CONFIG: Record<string, { name: string; fee: number; color: string }> = {
  "uniswap-v3": { name: "Uniswap V3", fee: 0.003, color: "#FF007A" },
  "uniswap-v2": { name: "Uniswap V2", fee: 0.003, color: "#FF6B9D" },
  "sushiswap": { name: "SushiSwap", fee: 0.003, color: "#0993EC" },
  "curve": { name: "Curve", fee: 0.0004, color: "#E84142" },
  "balancer": { name: "Balancer", fee: 0.002, color: "#1E1E1E" },
  "pancakeswap": { name: "PancakeSwap", fee: 0.0025, color: "#633511" },
  "1inch": { name: "1inch", fee: 0, color: "#94A6BA" },
}

// MEV Strategies
const MEV_STRATEGIES = [
  { id: "arbitrage", name: "Arbitrage", minProfit: 0.01, successRate: 75 },
  { id: "sandwich", name: "Sandwich", minProfit: 0.015, successRate: 60 },
  { id: "liquidation", name: "Liquidation", minProfit: 0.03, successRate: 45 },
  { id: "backrun", name: "Backrun", minProfit: 0.008, successRate: 70 },
  { id: "jit-liquidity", name: "JIT Liquidity", minProfit: 0.025, successRate: 55 },
  { id: "atomic", name: "Atomic Arb", minProfit: 0.012, successRate: 80 },
]

// Common token pairs with sample prices
const TOKEN_PRICES: Record<string, number> = {
  "ETH": 2500,
  "WETH": 2500,
  "USDC": 1,
  "USDT": 1,
  "DAI": 1,
  "WBTC": 42000,
  "MATIC": 0.85,
  "LINK": 15,
  "UNI": 6.5,
  "AAVE": 95,
}

interface SimulationResult {
  grossProfit: number
  fees: number
  gasCost: number
  netProfit: number
  priceImpact: number
  slippageImpact: number
  finalProfit: number
  roi: number
  successProbability: number
}

interface PaperTrade {
  id: string
  timestamp: number
  strategy: string
  tokenPair: string
  amount: number
  profit: number
  status: "success" | "failed"
}

function calculateAMMSwap(
  amountIn: number,
  reserveIn: number,
  reserveOut: number,
  fee: number
): { amountOut: number; priceImpact: number; newPrice: number } {
  // x * y = k formula
  const amountInWithFee = amountIn * (1 - fee)
  const numerator = amountInWithFee * reserveOut
  const denominator = reserveIn + amountInWithFee
  const amountOut = numerator / denominator
  
  // Calculate price impact
  const priceImpact = (amountIn / reserveIn) * 100
  
  // New price after swap
  const newReserveIn = reserveIn + amountIn
  const newReserveOut = reserveOut - amountOut
  const newPrice = newReserveOut / newReserveIn
  
  return { amountOut, priceImpact, newPrice }
}

function estimateGasCost(strategy: string, chainId: number = 1): number {
  // Realistic gas estimates in USD
  const gasEstimates: Record<string, number> = {
    "simple-swap": 15,
    "arbitrage": 45,
    "sandwich": 60,
    "liquidation": 80,
    "backrun": 35,
    "jit-liquidity": 55,
    "atomic": 40,
  }
  
  // Chain multipliers
  const chainMultipliers: Record<number, number> = {
    1: 1,     // Ethereum
    10: 0.05, // Optimism
    137: 0.01, // Polygon
    42161: 0.1, // Arbitrum
    56: 0.02, // BSC
  }
  
  const baseGas = gasEstimates[strategy] || 30
  const multiplier = chainMultipliers[chainId] || 1
  
  return baseGas * multiplier
}

export default function SimulatorPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  
  // Calculator State
  const [tokenA, setTokenA] = useState("ETH")
  const [tokenB, setTokenB] = useState("USDC")
  const [amount, setAmount] = useState("1")
  const [selectedDex, setSelectedDex] = useState("uniswap-v3")
  const [slippage, setSlippage] = useState([0.5])
  
  // MEV Strategy State
  const [selectedStrategy, setSelectedStrategy] = useState("arbitrage")
  const [targetAmount, setTargetAmount] = useState("10000")
  
  // Paper Trading State
  const [paperBalance, setPaperBalance] = useState(10000)
  const [paperTrades, setPaperTrades] = useState<PaperTrade[]>([])
  const [isPaperTrading, setIsPaperTrading] = useState(false)
  
  // Market Analysis State
  const [selectedPair, setSelectedPair] = useState("ETH/USDC")
  const [timeframe, setTimeframe] = useState("24h")
  
  // Fetch paper trading account
  const { data: paperAccount } = useQuery({
    queryKey: ["paper-account"],
    queryFn: async () => {
      const res = await fetch("/api/simulator/paper-account")
      if (!res.ok) throw new Error("Failed to fetch paper account")
      return res.json()
    },
  })
  
  // Update paper balance when account data changes
  useEffect(() => {
    if (paperAccount) {
      setPaperBalance(parseFloat(paperAccount.balance))
    }
  }, [paperAccount])
  
  // Calculate simulation
  const calculateSimulation = useMemo(() => {
    if (!amount || parseFloat(amount) <= 0) {
      return null
    }
    
    const amountNum = parseFloat(amount)
    const priceA = TOKEN_PRICES[tokenA] || 0
    const priceB = TOKEN_PRICES[tokenB] || 0
    
    if (!priceA || !priceB) {
      return null
    }
    
    // Simulate liquidity pools (in millions)
    const liquidityA = Math.random() * 100 + 50
    const liquidityB = (liquidityA * priceA) / priceB
    
    // Calculate swap
    const dexFee = DEX_CONFIG[selectedDex].fee
    const swapResult = calculateAMMSwap(
      amountNum,
      liquidityA * 1000000,
      liquidityB * 1000000,
      dexFee
    )
    
    // Calculate profits
    const valueIn = amountNum * priceA
    const valueOut = swapResult.amountOut * priceB
    const grossProfit = valueOut - valueIn
    const fees = valueIn * dexFee
    const gasCost = estimateGasCost("simple-swap")
    const slippageImpact = valueOut * (slippage[0] / 100)
    
    const netProfit = grossProfit - fees - gasCost - slippageImpact
    const roi = (netProfit / valueIn) * 100
    
    return {
      grossProfit,
      fees,
      gasCost,
      netProfit,
      priceImpact: swapResult.priceImpact,
      slippageImpact,
      finalProfit: netProfit,
      roi,
      successProbability: Math.max(0, Math.min(100, 85 - swapResult.priceImpact * 2))
    } as SimulationResult
  }, [tokenA, tokenB, amount, selectedDex, slippage])
  
  // Slippage impact data for chart
  const slippageData = useMemo(() => {
    if (!calculateSimulation) return []
    
    return Array.from({ length: 51 }, (_, i) => {
      const slippagePercent = i * 0.1
      const slippageImpact = (calculateSimulation.grossProfit - calculateSimulation.fees - calculateSimulation.gasCost) * (slippagePercent / 100)
      const profit = calculateSimulation.grossProfit - calculateSimulation.fees - calculateSimulation.gasCost - slippageImpact
      
      return {
        slippage: slippagePercent,
        profit: profit,
        breakeven: 0,
      }
    })
  }, [calculateSimulation])
  
  // MEV Strategy simulation
  const simulateMEVStrategy = useMutation({
    mutationFn: async (params: { strategy: string; amount: number; isPaperTrade: boolean }) => {
      const res = await fetch("/api/simulator/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategy: params.strategy,
          tokenPair: `${tokenA}/${tokenB}`,
          tokenA,
          tokenB,
          amount: params.amount,
          dex: selectedDex,
          slippage: slippage[0],
          isPaperTrade: params.isPaperTrade,
        }),
      })
      
      if (!res.ok) throw new Error("Simulation failed")
      return res.json()
    },
    onSuccess: (data) => {
      toast({
        title: "Simulación completada",
        description: `Profit estimado: $${data.estimatedProfit.toFixed(2)}`,
      })
      
      if (data.isPaperTrade) {
        const newTrade: PaperTrade = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          strategy: data.strategy,
          tokenPair: data.tokenPair,
          amount: data.amount,
          profit: data.estimatedProfit,
          status: data.estimatedProfit > 0 ? "success" : "failed",
        }
        setPaperTrades([newTrade, ...paperTrades])
        setPaperBalance(prev => prev + data.estimatedProfit)
      }
      
      queryClient.invalidateQueries({ queryKey: ["simulations"] })
      queryClient.invalidateQueries({ queryKey: ["paper-account"] })
    },
    onError: () => {
      toast({
        title: "Error en simulación",
        description: "No se pudo completar la simulación",
        variant: "destructive",
      })
    },
  })
  
  // Reset paper trading account
  const resetPaperAccount = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/simulator/paper-account/reset", {
        method: "POST",
      })
      if (!res.ok) throw new Error("Failed to reset account")
      return res.json()
    },
    onSuccess: () => {
      setPaperBalance(10000)
      setPaperTrades([])
      toast({
        title: "Cuenta reiniciada",
        description: "Balance restaurado a $10,000",
      })
      queryClient.invalidateQueries({ queryKey: ["paper-account"] })
    },
  })
  
  // Market depth visualization data
  const marketDepthData = useMemo(() => {
    const basePrice = TOKEN_PRICES[tokenA] / TOKEN_PRICES[tokenB]
    return Array.from({ length: 20 }, (_, i) => ({
      price: basePrice * (0.95 + i * 0.01),
      bids: Math.random() * 1000000,
      asks: Math.random() * 1000000,
    }))
  }, [tokenA, tokenB])
  
  // Historical opportunity heatmap
  const opportunityHeatmap = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, h) => {
      const opportunities = Math.floor(Math.random() * 10)
      const avgProfit = Math.random() * 500
      return { hour: h, opportunities, avgProfit }
    })
    return hours
  }, [])
  
  const winRate = paperTrades.length > 0
    ? (paperTrades.filter(t => t.status === "success").length / paperTrades.length) * 100
    : 0
  
  const totalPnL = paperTrades.reduce((sum, trade) => sum + trade.profit, 0)
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Brain className="h-8 w-8 text-primary" />
            Trading Simulator
          </h1>
          <p className="text-muted-foreground mt-1">
            Simula estrategias de arbitraje y MEV sin riesgo real
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <Card className="px-4 py-2">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Paper Balance</p>
                <p className="text-lg font-bold">${paperBalance.toFixed(2)}</p>
              </div>
            </div>
          </Card>
          <Button 
            onClick={() => resetPaperAccount.mutate()}
            variant="outline" 
            size="sm"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset
          </Button>
        </div>
      </div>
      
      <Tabs defaultValue="calculator" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="calculator">
            <Calculator className="h-4 w-4 mr-2" />
            Calculadora
          </TabsTrigger>
          <TabsTrigger value="slippage">
            <TrendingUp className="h-4 w-4 mr-2" />
            Slippage
          </TabsTrigger>
          <TabsTrigger value="mev">
            <Zap className="h-4 w-4 mr-2" />
            MEV Simulator
          </TabsTrigger>
          <TabsTrigger value="paper">
            <History className="h-4 w-4 mr-2" />
            Paper Trading
          </TabsTrigger>
          <TabsTrigger value="market">
            <BarChart3 className="h-4 w-4 mr-2" />
            Análisis
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="calculator" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Calculadora de Profit/Loss</CardTitle>
                <CardDescription>
                  Calcula ganancias considerando fees reales y gas costs
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Token A</Label>
                    <Select value={tokenA} onValueChange={setTokenA}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(TOKEN_PRICES).map(token => (
                          <SelectItem key={token} value={token}>
                            {token} (${TOKEN_PRICES[token]})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>Token B</Label>
                    <Select value={tokenB} onValueChange={setTokenB}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(TOKEN_PRICES).map(token => (
                          <SelectItem key={token} value={token}>
                            {token} (${TOKEN_PRICES[token]})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div>
                  <Label>Amount ({tokenA})</Label>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.0"
                    step="0.01"
                  />
                </div>
                
                <div>
                  <Label>DEX</Label>
                  <Select value={selectedDex} onValueChange={setSelectedDex}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DEX_CONFIG).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: config.color }}
                            />
                            {config.name} (Fee: {(config.fee * 100).toFixed(2)}%)
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {calculateSimulation && (
                  <div className="pt-4 space-y-3 border-t">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Gross Profit:</span>
                      <span className={`font-mono ${calculateSimulation.grossProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        ${calculateSimulation.grossProfit.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">DEX Fees:</span>
                      <span className="font-mono text-orange-500">-${calculateSimulation.fees.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Gas Cost:</span>
                      <span className="font-mono text-orange-500">-${calculateSimulation.gasCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Slippage Impact:</span>
                      <span className="font-mono text-orange-500">-${calculateSimulation.slippageImpact.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between pt-3 border-t">
                      <span className="font-semibold">Net Profit:</span>
                      <span className={`font-bold text-lg ${calculateSimulation.netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        ${calculateSimulation.netProfit.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">ROI:</span>
                      <span className={`font-mono ${calculateSimulation.roi >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {calculateSimulation.roi.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Price Impact:</span>
                      <span className="font-mono text-yellow-500">
                        {calculateSimulation.priceImpact.toFixed(3)}%
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Comparación Multi-DEX</CardTitle>
                <CardDescription>
                  Compara rentabilidad entre diferentes DEXs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(DEX_CONFIG).map(([key, config]) => {
                    const dexFee = config.fee
                    const valueIn = parseFloat(amount || "0") * (TOKEN_PRICES[tokenA] || 0)
                    const fees = valueIn * dexFee
                    const gasCost = estimateGasCost("simple-swap")
                    const estimatedProfit = valueIn * 0.02 - fees - gasCost // Simplified calculation
                    const isSelected = key === selectedDex
                    
                    return (
                      <div
                        key={key}
                        className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                          isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedDex(key)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-4 h-4 rounded-full" 
                              style={{ backgroundColor: config.color }}
                            />
                            <div>
                              <p className="font-medium">{config.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Fee: {(config.fee * 100).toFixed(2)}%
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`font-mono font-semibold ${estimatedProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                              ${estimatedProfit.toFixed(2)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Est. profit
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="slippage" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Análisis de Slippage</CardTitle>
                <CardDescription>
                  Ajusta la tolerancia y observa el impacto en profits
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <Label>Slippage Tolerance</Label>
                    <span className="text-sm font-mono">{slippage[0].toFixed(1)}%</span>
                  </div>
                  <Slider
                    value={slippage}
                    onValueChange={setSlippage}
                    min={0.1}
                    max={5}
                    step={0.1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>0.1%</span>
                    <span>2.5%</span>
                    <span>5%</span>
                  </div>
                </div>
                
                {slippage[0] > 2 && (
                  <Alert className="border-yellow-500/50 bg-yellow-500/10">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <AlertTitle>Alto Slippage</AlertTitle>
                    <AlertDescription>
                      Un slippage mayor al 2% puede resultar en pérdidas significativas
                    </AlertDescription>
                  </Alert>
                )}
                
                {calculateSimulation && (
                  <div className="space-y-3 pt-4 border-t">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Profit sin slippage:</span>
                      <span className="font-mono">${(calculateSimulation.grossProfit - calculateSimulation.fees - calculateSimulation.gasCost).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Impacto del slippage:</span>
                      <span className="font-mono text-orange-500">-${calculateSimulation.slippageImpact.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between pt-3 border-t">
                      <span className="font-semibold">Profit final:</span>
                      <span className={`font-bold text-lg ${calculateSimulation.finalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        ${calculateSimulation.finalProfit.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Profit vs Slippage</CardTitle>
                <CardDescription>
                  Visualización del impacto del slippage en rentabilidad
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={slippageData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis 
                      dataKey="slippage" 
                      label={{ value: 'Slippage (%)', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis 
                      label={{ value: 'Profit ($)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      formatter={(value: number) => `$${value.toFixed(2)}`}
                      labelFormatter={(label) => `Slippage: ${label}%`}
                    />
                    <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
                    <Area
                      type="monotone"
                      dataKey="profit"
                      fill="#8b5cf6"
                      fillOpacity={0.3}
                      stroke="#8b5cf6"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="breakeven"
                      stroke="#ef4444"
                      strokeDasharray="5 5"
                      strokeWidth={1}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="mev" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Simulador de Estrategias MEV</CardTitle>
                <CardDescription>
                  Simula diferentes estrategias MEV y estima probabilidad de éxito
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Estrategia MEV</Label>
                  <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEV_STRATEGIES.map(strategy => (
                        <SelectItem key={strategy.id} value={strategy.id}>
                          <div className="flex items-center justify-between w-full">
                            <span>{strategy.name}</span>
                            <Badge variant="outline" className="ml-2">
                              {strategy.successRate}% success
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Target Amount (USD)</Label>
                  <Input
                    type="number"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    placeholder="10000"
                    step="1000"
                  />
                </div>
                
                <div className="pt-4 border-t space-y-3">
                  {(() => {
                    const strategy = MEV_STRATEGIES.find(s => s.id === selectedStrategy)
                    if (!strategy) return null
                    
                    const amount = parseFloat(targetAmount || "0")
                    const estimatedProfit = amount * strategy.minProfit
                    const gasCost = estimateGasCost(strategy.id)
                    const netProfit = estimatedProfit - gasCost
                    
                    return (
                      <>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Estrategia:</span>
                          <span className="font-medium">{strategy.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Min. Profit Expected:</span>
                          <span className="font-mono">{(strategy.minProfit * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Est. Gas Cost:</span>
                          <span className="font-mono text-orange-500">-${gasCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Success Probability:</span>
                          <span className={`font-mono ${strategy.successRate >= 70 ? 'text-green-500' : strategy.successRate >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>
                            {strategy.successRate}%
                          </span>
                        </div>
                        <div className="flex justify-between pt-3 border-t">
                          <span className="font-semibold">Expected Profit:</span>
                          <span className={`font-bold text-lg ${netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            ${netProfit.toFixed(2)}
                          </span>
                        </div>
                      </>
                    )
                  })()}
                </div>
                
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => simulateMEVStrategy.mutate({
                      strategy: selectedStrategy,
                      amount: parseFloat(targetAmount || "0"),
                      isPaperTrade: false
                    })}
                    disabled={simulateMEVStrategy.isPending}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Simular
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => simulateMEVStrategy.mutate({
                      strategy: selectedStrategy,
                      amount: parseFloat(targetAmount || "0"),
                      isPaperTrade: true
                    })}
                    disabled={simulateMEVStrategy.isPending}
                  >
                    <Wallet className="h-4 w-4 mr-2" />
                    Paper Trade
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Paso a Paso de Ejecución</CardTitle>
                <CardDescription>
                  Visualiza cómo se ejecutaría la estrategia
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {selectedStrategy === "arbitrage" && (
                    <>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold">1</div>
                        <div>
                          <p className="font-medium">Detectar diferencia de precio</p>
                          <p className="text-sm text-muted-foreground">Escanear precios en múltiples DEXs</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold">2</div>
                        <div>
                          <p className="font-medium">Calcular rentabilidad</p>
                          <p className="text-sm text-muted-foreground">Verificar que profit > gas + fees</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold">3</div>
                        <div>
                          <p className="font-medium">Ejecutar swap atómico</p>
                          <p className="text-sm text-muted-foreground">Comprar bajo, vender alto en una tx</p>
                        </div>
                      </div>
                    </>
                  )}
                  
                  {selectedStrategy === "sandwich" && (
                    <>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold">1</div>
                        <div>
                          <p className="font-medium">Detectar transacción víctima</p>
                          <p className="text-sm text-muted-foreground">Identificar large swap en mempool</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold">2</div>
                        <div>
                          <p className="font-medium">Frontrun: Comprar antes</p>
                          <p className="text-sm text-muted-foreground">Ejecutar compra con mayor gas</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold">3</div>
                        <div>
                          <p className="font-medium">Backrun: Vender después</p>
                          <p className="text-sm text-muted-foreground">Vender tokens al precio elevado</p>
                        </div>
                      </div>
                    </>
                  )}
                  
                  {selectedStrategy === "liquidation" && (
                    <>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold">1</div>
                        <div>
                          <p className="font-medium">Monitorear health factors</p>
                          <p className="text-sm text-muted-foreground">Escanear posiciones en riesgo</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold">2</div>
                        <div>
                          <p className="font-medium">Preparar liquidación</p>
                          <p className="text-sm text-muted-foreground">Obtener flash loan si es necesario</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold">3</div>
                        <div>
                          <p className="font-medium">Ejecutar y cobrar reward</p>
                          <p className="text-sm text-muted-foreground">Liquidar posición y obtener bonus</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                
                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <p className="font-medium text-sm">Factores de Riesgo</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Competencia MEV:</span>
                      <span className="text-yellow-500">Alta</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Gas Wars:</span>
                      <span className="text-orange-500">Probable</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Revert Risk:</span>
                      <span className="text-red-500">15-20%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="paper" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Balance Actual</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">${paperBalance.toFixed(2)}</p>
                <p className={`text-sm ${totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)} ({((totalPnL / 10000) * 100).toFixed(1)}%)
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Total Trades</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{paperTrades.length}</p>
                <p className="text-sm text-muted-foreground">
                  {paperTrades.filter(t => t.status === "success").length} ganadores
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Win Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{winRate.toFixed(1)}%</p>
                <p className="text-sm text-muted-foreground">
                  Ratio de éxito
                </p>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Historial de Paper Trades</CardTitle>
              <CardDescription>
                Registro de todas tus operaciones simuladas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {paperTrades.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No hay trades registrados aún</p>
                  <p className="text-sm mt-1">Ejecuta tu primer paper trade desde las pestañas anteriores</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {paperTrades.slice(0, 10).map((trade) => (
                    <div
                      key={trade.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${trade.status === "success" ? 'bg-green-500' : 'bg-red-500'}`} />
                        <div>
                          <p className="font-medium">{trade.strategy}</p>
                          <p className="text-sm text-muted-foreground">
                            {trade.tokenPair} • {new Date(trade.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-mono font-semibold ${trade.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {trade.profit >= 0 ? '+' : ''}{trade.profit.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ${trade.amount.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="market" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Market Depth</CardTitle>
                <CardDescription>
                  Liquidez disponible en el par {tokenA}/{tokenB}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={marketDepthData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis 
                      dataKey="price" 
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(value) => value.toFixed(2)}
                    />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number) => `$${(value / 1000).toFixed(0)}K`}
                    />
                    <Area
                      type="stepAfter"
                      dataKey="bids"
                      fill="#22c55e"
                      fillOpacity={0.3}
                      stroke="#22c55e"
                      strokeWidth={2}
                    />
                    <Area
                      type="stepAfter"
                      dataKey="asks"
                      fill="#ef4444"
                      fillOpacity={0.3}
                      stroke="#ef4444"
                      strokeWidth={2}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Best Time to Trade</CardTitle>
                <CardDescription>
                  Horarios con mayor oportunidad de arbitraje (UTC)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={opportunityHeatmap}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis 
                      dataKey="hour" 
                      tickFormatter={(hour) => `${hour}:00`}
                    />
                    <YAxis yAxisId="left" orientation="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Bar 
                      yAxisId="left"
                      dataKey="opportunities" 
                      fill="#8b5cf6" 
                      fillOpacity={0.8}
                      radius={[4, 4, 0, 0]}
                    />
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="avgProfit" 
                      stroke="#fbbf24" 
                      strokeWidth={2}
                      dot={{ fill: '#fbbf24', r: 3 }}
                    />
                  </BarChart>
                </ResponsiveContainer>
                
                <div className="mt-4 p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-2">Mejores horarios detectados:</p>
                  <div className="flex gap-2">
                    <Badge variant="outline">14:00 - 16:00 UTC</Badge>
                    <Badge variant="outline">20:00 - 22:00 UTC</Badge>
                    <Badge variant="outline">02:00 - 04:00 UTC</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Price Impact Calculator</CardTitle>
              <CardDescription>
                Calcula el impacto en precio para diferentes tamaños de operación
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-4 text-center">
                  {[1000, 10000, 50000, 100000].map((size) => {
                    const impact = Math.log10(size) * 0.5
                    const slippage = impact * 0.3
                    
                    return (
                      <div key={size} className="p-3 rounded-lg border">
                        <p className="text-sm text-muted-foreground mb-1">
                          ${(size / 1000).toFixed(0)}K Trade
                        </p>
                        <p className="text-lg font-semibold text-yellow-500">
                          {impact.toFixed(2)}%
                        </p>
                        <p className="text-xs text-muted-foreground">
                          impact
                        </p>
                        <p className="text-sm font-mono text-orange-500 mt-1">
                          ~{slippage.toFixed(2)}% slip
                        </p>
                      </div>
                    )
                  })}
                </div>
                
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Nota sobre liquidez</AlertTitle>
                  <AlertDescription>
                    Los valores mostrados son estimaciones basadas en liquidez promedio. 
                    La liquidez real puede variar significativamente según el momento y el par.
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}