"use client"
import { useQuery } from "@tanstack/react-query"
import { apiGet } from "@/lib/api"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { TrendingUp, TrendingDown, Activity, Info } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

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
  const [newOpportunities, setNewOpportunities] = useState<Set<string>>(new Set())
  const [previousProfit, setPreviousProfit] = useState<number>(0)
  const [previousROI, setPreviousROI] = useState<number>(0)
  const previousDataRef = useRef<Opportunity[]>([])
  
  const { data } = useQuery({
    queryKey: ["opportunities"],
    queryFn: () => apiGet<Opportunity[]>("/cf/opportunities"),
    refetchInterval: 2000,
  })

  const { data: scannerStatus } = useQuery({
    queryKey: ["mev-scanner-status"],
    queryFn: () => apiGet<{ isActive: boolean; lastScanTime: number; scanCount: number }>("/api/mev-scanner/status"),
    refetchInterval: 2000,
  })

  const { data: scannerDetails } = useQuery({
    queryKey: ["mev-scanner-details"],
    queryFn: () => apiGet<{
      pairs: Array<{ name: string; chain: string; chainId: number; dexs: string[] }>;
      scanInterval: string;
      threshold: string;
      totalChains: number;
      totalPairs: number;
      totalDexs: number;
    }>("/api/mev-scanner/details"),
    refetchInterval: 5000,
  })

  // Track new opportunities
  useEffect(() => {
    if (data && data.length > 0) {
      const currentIds = new Set(data.map(o => o.id))
      const previousIds = new Set(previousDataRef.current.map(o => o.id))
      
      const newIds = new Set<string>()
      currentIds.forEach(id => {
        if (!previousIds.has(id)) {
          newIds.add(id)
        }
      })
      
      setNewOpportunities(newIds)
      previousDataRef.current = data
      
      // Remove "new" badge after 5 seconds
      if (newIds.size > 0) {
        setTimeout(() => {
          setNewOpportunities(new Set())
        }, 5000)
      }
    }
  }, [data])

  const calculateROI = (opp: Opportunity) => {
    const amountInUsd = parseFloat(opp.amountIn);
    if (amountInUsd === 0) return 0;
    return Math.round((opp.estProfitUsd / amountInUsd) * 10000);
  }

  const totalProfit = data?.reduce((a,b) => a + b.estProfitUsd, 0) ?? 0
  
  const avgROI = data && data.length 
    ? Math.round(data.reduce((a,b) => a + calculateROI(b), 0) / data.length) 
    : 0;

  const avgEV = data && data.length
    ? Math.round(data.reduce((a,b) => a + b.estProfitUsd, 0) / data.length)
    : 0;

  // Track changes for glow effect
  useEffect(() => {
    if (totalProfit !== previousProfit) {
      setPreviousProfit(totalProfit)
    }
    if (avgROI !== previousROI) {
      setPreviousROI(avgROI)
    }
  }, [totalProfit, avgROI, previousProfit, previousROI])

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: 0.5,
        ease: [0.4, 0, 0.2, 1]
      }
    }
  }

  const rowVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { 
      opacity: 1, 
      x: 0,
      transition: {
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1]
      }
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Responsive Grid - Stack on mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
        >
          <Card className="p-4 metric-card hover:shadow-lg transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs sm:text-sm text-muted-foreground">Opportunities</div>
                <div className="text-xl sm:text-2xl font-semibold flex items-center gap-2 mt-1">
                  {data?.length ?? 0}
                  {data && data.length > 0 && (
                    <Activity className="h-4 w-4 text-green-500 animate-pulse" />
                  )}
                </div>
              </div>
              <div className="text-3xl opacity-10">
                <Activity />
              </div>
            </div>
          </Card>
        </motion.div>
        
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
        >
          <Card className="p-4 metric-card hover:shadow-lg transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs sm:text-sm text-muted-foreground">Avg ROI (bps)</div>
                <div className={`text-xl sm:text-2xl font-semibold mt-1 ${avgROI > previousROI ? 'animate-glow-green' : avgROI < previousROI ? 'animate-glow-red' : ''}`}>
                  {avgROI}
                  {avgROI > previousROI ? (
                    <TrendingUp className="inline ml-2 h-4 w-4 text-green-500" />
                  ) : avgROI < previousROI ? (
                    <TrendingDown className="inline ml-2 h-4 w-4 text-red-500" />
                  ) : null}
                </div>
              </div>
              <div className="text-3xl opacity-10">
                <TrendingUp />
              </div>
            </div>
          </Card>
        </motion.div>
        
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.2 }}
        >
          <Card className="p-4 metric-card hover:shadow-lg transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs sm:text-sm text-muted-foreground">Avg EV (USD)</div>
                <div className={`text-xl sm:text-2xl font-semibold mt-1 ${totalProfit > previousProfit ? 'animate-glow-green' : totalProfit < previousProfit ? 'animate-glow-red' : ''}`}>
                  ${avgEV.toLocaleString()}
                </div>
              </div>
              <div className="text-3xl opacity-10">
                $
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
      
      {/* Table with animations and responsive design */}
      <Card className="p-3 md:p-4">
        <div className="text-sm mb-3 font-medium flex items-center justify-between flex-wrap gap-2">
          <span>Oportunidades (tiempo real)</span>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {scannerStatus && (
              <>
                <Dialog>
                  <DialogTrigger asChild>
                    <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                      <span>Motor MEV:</span>
                      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${scannerStatus.isActive ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${scannerStatus.isActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                        <span className="font-medium">{scannerStatus.isActive ? 'ACTIVO' : 'INACTIVO'}</span>
                      </div>
                      <Info className="w-3.5 h-3.5 opacity-50" />
                    </div>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Detalles del Motor MEV</DialogTitle>
                      <DialogDescription>
                        Configuración y cobertura del sistema de escaneo en tiempo real
                      </DialogDescription>
                    </DialogHeader>
                    {scannerDetails && (
                      <div className="space-y-4 mt-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <Card className="p-3">
                            <div className="text-sm text-muted-foreground">Blockchains</div>
                            <div className="text-2xl font-bold">{scannerDetails.totalChains}</div>
                          </Card>
                          <Card className="p-3">
                            <div className="text-sm text-muted-foreground">Pares</div>
                            <div className="text-2xl font-bold">{scannerDetails.totalPairs}</div>
                          </Card>
                          <Card className="p-3">
                            <div className="text-sm text-muted-foreground">DEXs</div>
                            <div className="text-2xl font-bold">{scannerDetails.totalDexs}</div>
                          </Card>
                          <Card className="p-3">
                            <div className="text-sm text-muted-foreground">Intervalo</div>
                            <div className="text-lg font-bold">{scannerDetails.scanInterval}</div>
                          </Card>
                        </div>
                        
                        <div>
                          <h3 className="font-semibold mb-2">Parámetros de Detección</h3>
                          <p className="text-sm text-muted-foreground">Threshold mínimo: {scannerDetails.threshold}</p>
                        </div>

                        <div>
                          <h3 className="font-semibold mb-3">Pares y DEXs Monitoreados</h3>
                          <div className="space-y-2">
                            {scannerDetails.pairs.map((pair, idx) => (
                              <Card key={idx} className="p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div>
                                    <span className="font-semibold">{pair.name}</span>
                                    <span className="text-xs text-muted-foreground ml-2">
                                      {pair.chain} (Chain {pair.chainId})
                                    </span>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {pair.dexs.map((dex, dexIdx) => (
                                    <Badge key={dexIdx} variant="outline" className="text-xs">
                                      {dex}
                                    </Badge>
                                  ))}
                                </div>
                              </Card>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
                {scannerStatus.lastScanTime > 0 && (
                  <div className="hidden sm:block">
                    Último escaneo: {new Date(scannerStatus.lastScanTime).toLocaleTimeString('es-ES')}
                  </div>
                )}
              </>
            )}
            {newOpportunities.size > 0 && (
              <span className="new-badge">
                {newOpportunities.size} NUEVO{newOpportunities.size > 1 ? 'S' : ''}
              </span>
            )}
          </div>
        </div>
        
        {/* Mobile-optimized table with horizontal scroll */}
        <div className="table-container">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 px-1 sm:px-2">ID</th>
                <th className="hidden sm:table-cell">Chain</th>
                <th className="px-1 sm:px-2">Estrategia</th>
                <th className="px-1 sm:px-2">ROI</th>
                <th className="px-1 sm:px-2">EV</th>
                <th className="hidden md:table-cell">Time</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {data && data.length > 0 ? data.slice(0, 10).map((o, index) => {
                  const isNew = newOpportunities.has(o.id)
                  return (
                    <motion.tr 
                      key={o.id}
                      variants={rowVariants}
                      initial="hidden"
                      animate="visible"
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ delay: index * 0.05 }}
                      className={`border-t ${isNew ? 'animate-pulse-opportunity' : ''}`}
                    >
                      <td className="py-2 px-1 sm:px-2">
                        <div className="flex items-center gap-1">
                          {isNew && <span className="new-badge text-[10px]">NEW</span>}
                          <span className="font-mono">{String(o.id).slice(0,6)}...</span>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell">{o.chainId}</td>
                      <td className="px-1 sm:px-2">
                        <Badge variant="secondary" className="text-[10px] sm:text-xs">
                          {o.dexIn}→{o.dexOut}
                        </Badge>
                      </td>
                      <td className={`px-1 sm:px-2 font-medium ${calculateROI(o) > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {calculateROI(o)}
                      </td>
                      <td className={`px-1 sm:px-2 font-medium ${o.estProfitUsd > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        ${Math.round(o.estProfitUsd).toLocaleString()}
                      </td>
                      <td className="hidden md:table-cell text-muted-foreground text-xs">
                        {new Date(o.ts).toLocaleTimeString()}
                      </td>
                    </motion.tr>
                  )
                }) : (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5 }}
                      >
                        Sin datos aún
                      </motion.div>
                    </td>
                  </tr>
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </Card>
      
      {/* Mobile-only Quick Actions */}
      <div className="block md:hidden">
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4 touch-target text-center hover:bg-accent cursor-pointer transition-colors">
            <Activity className="h-6 w-6 mx-auto mb-2" />
            <span className="text-xs">Auto Trade</span>
          </Card>
          <Card className="p-4 touch-target text-center hover:bg-accent cursor-pointer transition-colors">
            <TrendingUp className="h-6 w-6 mx-auto mb-2" />
            <span className="text-xs">Analytics</span>
          </Card>
        </div>
      </div>
    </div>
  )
}