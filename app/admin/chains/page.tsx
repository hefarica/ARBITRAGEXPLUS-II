"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Network, 
  Activity, 
  Search, 
  Server, 
  Plus, 
  Wifi, 
  WifiOff,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

interface Chain {
  chainId: number;
  name: string;
  isEvm: boolean;
  isActive: boolean;
  rpcCount?: number;
  dexCount?: number;
  healthyRpcs?: number;
  avgLatency?: number;
  dexes?: string[];
}

interface RPC {
  id: number;
  chainId: number;
  url: string;
  isActive: boolean;
  lastLatencyMs: number | null;
  lastOkAt: number | null;
}

interface DexSuggestion {
  name: string;
  slug: string;
  tvl: number;
  change1d: number;
  change7d: number;
  isAdded: boolean;
}

export default function ChainsAdminPage() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const [selectedChain, setSelectedChain] = useState<number | null>(null);
  const [rpcs, setRpcs] = useState<RPC[]>([]);
  const [exporting, setExporting] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [dexSuggestions, setDexSuggestions] = useState<DexSuggestion[]>([]);
  const [selectedDexes, setSelectedDexes] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [addingDexes, setAddingDexes] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [updateLatency, setUpdateLatency] = useState<number>(0);
  const [dexModalOpen, setDexModalOpen] = useState(false);
  const [selectedChainIds, setSelectedChainIds] = useState<number[]>([]);
  const [batchToggling, setBatchToggling] = useState(false);
  const [minTvl, setMinTvl] = useState<number>(100_000_000);
  const [discoverLimit, setDiscoverLimit] = useState<number>(20);

  const fetchChains = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const startTime = Date.now();
      const response = await fetch("/cf/engine/state");
      const data = await response.json();
      const endTime = Date.now();
      
      setUpdateLatency(endTime - startTime);
      setLastUpdate(new Date());
      
      const chainsWithCounts = data.chains.map((chain: any) => ({
        chainId: chain.chainId,
        name: chain.name,
        isEvm: chain.evm,
        isActive: chain.isActive || false,
        rpcCount: chain.rpcs?.length || 0,
        dexCount: chain.dexes?.filter((d: any) => d.isActive).length || 0,
        healthyRpcs: chain.rpcs?.filter((r: any) => r.isActive && r.lastOkAt && r.lastOkAt > Date.now() - 300000).length || 0,
        avgLatency: calculateAvgLatency(chain.rpcs || []),
        dexes: chain.dexes?.filter((d: any) => d.isActive).map((d: any) => d.name) || [],
      }));
      
      setChains(chainsWithCounts);
    } catch (error) {
      console.error("Error fetching chains:", error);
      if (isInitial) toast.error("Error al cargar blockchains");
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  const calculateAvgLatency = (rpcs: any[]) => {
    const validLatencies = rpcs
      .map((r) => r.latencyMs)
      .filter((l): l is number => l !== null && l > 0);
    
    if (validLatencies.length === 0) return null;
    return Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length);
  };

  const runAutoDiscovery = async () => {
    try {
      setDiscovering(true);
      toast.info(`Descubriendo blockchains con TVL > $${(minTvl / 1e9).toFixed(1)}B...`);
      
      const response = await fetch("/cf/engine/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          minTvl: minTvl,
          limit: discoverLimit,
          autoAddDexs: true
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        const msg = [
          `✅ ${data.discovered} chains descubiertas`,
          data.skipped > 0 ? `⏭️ ${data.skipped} ya existían` : "",
          data.errors?.length > 0 ? `❌ ${data.errors.length} errores` : ""
        ].filter(Boolean).join(" | ");
        
        toast.success(msg);
        if (data.chains && data.chains.length > 0) {
          toast.info("Las chains descubiertas están inactivas por defecto. Actívalas para empezar a operar.");
        }
        await fetchChains();
      } else {
        toast.error(data.error || "Error en auto-discovery");
      }
    } catch (error) {
      console.error("Error in auto-discovery:", error);
      toast.error("Error ejecutando auto-discovery");
    } finally {
      setDiscovering(false);
    }
  };

  const toggleChainSelection = (chainId: number) => {
    setSelectedChainIds(prev => 
      prev.includes(chainId) 
        ? prev.filter(id => id !== chainId)
        : [...prev, chainId]
    );
  };

  const selectAllChains = () => {
    setSelectedChainIds(chains.map(c => c.chainId));
  };

  const clearSelection = () => {
    setSelectedChainIds([]);
  };

  const batchToggleChains = async (isActive: boolean) => {
    if (selectedChainIds.length === 0) {
      toast.error("Selecciona al menos una blockchain");
      return;
    }

    try {
      setBatchToggling(true);
      toast.info(`${isActive ? 'Activando' : 'Desactivando'} ${selectedChainIds.length} blockchain(s)...`);
      
      const response = await fetch("/cf/engine/chains/toggle-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          chainIds: selectedChainIds,
          isActive 
        }),
      });
      
      const data = await response.json();
      
      if (data.success || data.processed > 0) {
        toast.success(`${data.processed} blockchain(s) ${isActive ? 'activadas' : 'desactivadas'}. Motor actualizado automáticamente.`);
        if (data.failed > 0) {
          toast.warning(`${data.failed} blockchain(s) fallaron`);
        }
        clearSelection();
        await fetchChains();
      } else {
        toast.error(data.message || "Error en batch toggle");
      }
    } catch (error) {
      console.error("Error batch toggling chains:", error);
      toast.error("Error al cambiar estado de blockchains");
    } finally {
      setBatchToggling(false);
    }
  };

  const toggleChain = async (chainId: number, isActive: boolean) => {
    try {
      const response = await fetch("/cf/engine/chains/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId, isActive }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success(`Blockchain ${isActive ? "activada" : "desactivada"} - Motor actualizado automáticamente`);
        await fetchChains();
      } else {
        toast.error("Error al cambiar estado");
      }
    } catch (error) {
      console.error("Error toggling chain:", error);
      toast.error("Error al cambiar estado de blockchain");
    }
  };

  const autoSaveAndReload = async () => {
    try {
      setExporting(true);
      setReloading(true);
      
      const exportResponse = await fetch("/cf/engine/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      const exportData = await exportResponse.json();
      
      if (!exportData.success) {
        toast.error("Error al exportar configuración");
        return;
      }

      const reloadResponse = await fetch("/cf/engine/reload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      const reloadData = await reloadResponse.json();
      
      if (reloadData.success) {
        toast.success(`✅ Config guardada y motor actualizado (${exportData.config.totalChains} chains, ${exportData.config.totalDexs} DEXs)`);
      } else {
        toast.error("Config exportada pero error al recargar motor");
      }
    } catch (error) {
      console.error("Error in auto-save:", error);
      toast.error("Error guardando configuración");
    } finally {
      setExporting(false);
      setReloading(false);
    }
  };

  const saveConfig = async () => {
    await autoSaveAndReload();
  };

  const runHealthCheck = async (chainId?: number) => {
    try {
      setHealthChecking(true);
      toast.info("Ejecutando health check de RPCs...");
      
      const response = await fetch("/cf/engine/rpcs/healthcheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId, timeout: 8000 }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success(`Health check completado: ${data.healthy}/${data.total} RPCs activos`);
        await fetchChains();
      } else {
        toast.error("Error en health check");
      }
    } catch (error) {
      console.error("Error in health check:", error);
      toast.error("Error ejecutando health check");
    } finally {
      setHealthChecking(false);
    }
  };

  const fetchRpcs = async (chainId: number) => {
    try {
      const response = await fetch("/cf/engine/state");
      const data = await response.json();
      const chain = data.chains.find((c: any) => c.chainId === chainId);
      if (chain && chain.rpcs) {
        const chainRpcs = chain.rpcs.map((rpc: any, idx: number) => ({
          id: idx + 1,
          chainId: chainId,
          url: rpc.url,
          isActive: rpc.lastOkAt && rpc.lastOkAt > Date.now() - 300000,
          lastLatencyMs: rpc.latencyMs || null,
          lastOkAt: rpc.lastOkAt || null,
        }));
        setRpcs(chainRpcs);
      } else {
        setRpcs([]);
      }
    } catch (error) {
      console.error("Error fetching RPCs:", error);
      toast.error("Error al cargar RPCs");
    }
  };

  const fetchDexSuggestions = async (chainId: number) => {
    try {
      setLoadingSuggestions(true);
      const response = await fetch(`/cf/engine/dexes/suggest/${chainId}`);
      const data = await response.json();
      
      if (data.success) {
        setDexSuggestions(data.dexes || []);
        
        const alreadySelected = data.dexes
          .filter((d: DexSuggestion) => d.isAdded)
          .map((d: DexSuggestion) => d.name);
        setSelectedDexes(alreadySelected);
        
        console.log(`📋 Loaded ${data.total} DEXs: ${data.added} added, ${data.available} available`);
      } else {
        toast.error("Error al cargar DEXs");
      }
    } catch (error) {
      console.error("Error fetching DEXs:", error);
      toast.error("Error obteniendo DEXs");
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const saveSelectedDexes = async (chainId: number) => {
    try {
      setAddingDexes(true);
      const response = await fetch("/cf/engine/dexes/set", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId, dexes: selectedDexes }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`✅ ${data.count} DEX(s) guardados para ${data.chainName}`);
        await fetchChains();
        setDexModalOpen(false);
      } else {
        toast.error("Error al guardar DEXs");
      }
    } catch (error) {
      console.error("Error saving DEXs:", error);
      toast.error("Error guardando DEXs");
    } finally {
      setAddingDexes(false);
    }
  };

  const toggleDexSelection = (dexName: string) => {
    setSelectedDexes(prev => 
      prev.includes(dexName) 
        ? prev.filter(d => d !== dexName)
        : [...prev, dexName]
    );
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getSecondsSinceUpdate = () => {
    if (!lastUpdate || !currentTime) return 0;
    return Math.floor((currentTime.getTime() - lastUpdate.getTime()) / 1000);
  };

  useEffect(() => {
    setCurrentTime(new Date());
    
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(clockInterval);
  }, []);

  useEffect(() => {
    const initializeChains = async () => {
      await fetchChains(true);
    };
    
    initializeChains();
    
    const interval = setInterval(() => {
      fetchChains(false);
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedChain) {
      fetchRpcs(selectedChain);
      
      const interval = setInterval(() => {
        fetchRpcs(selectedChain);
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, [selectedChain]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestion de Blockchains</h1>
          <p className="text-muted-foreground mt-1">
            Administra las blockchains, RPCs y DEXs del sistema MEV
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end gap-1 text-sm">
            <div className="font-mono text-lg font-semibold">
              {currentTime ? formatTime(currentTime) : '--:--:--'}
            </div>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span>Latencia: <span className="text-green-500 font-medium">{updateLatency}ms</span></span>
              <span>Última actualización: <span className="text-blue-500 font-medium">{getSecondsSinceUpdate()}s</span></span>
            </div>
          </div>
          <div className="h-10 w-px bg-border" />
          <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => runHealthCheck()}
            disabled={healthChecking}
          >
            {healthChecking ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Activity className="h-4 w-4 mr-2" />
            )}
            Health Check
          </Button>
          <Button onClick={runAutoDiscovery} disabled={discovering} variant="outline">
            {discovering ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            Auto-Discovery
          </Button>
          <Button onClick={saveConfig} disabled={exporting || reloading}>
            {exporting || reloading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Server className="h-4 w-4 mr-2" />
            )}
            Guardar Config
          </Button>
        </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Descubrimiento Masivo de Blockchains</CardTitle>
          <CardDescription>
            Descubre y agrega automáticamente blockchains desde DeFi Llama API
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="minTvl">TVL Mínimo (USD)</Label>
              <Input
                id="minTvl"
                type="number"
                value={minTvl}
                onChange={(e) => setMinTvl(parseInt(e.target.value) || 100_000_000)}
                placeholder="100000000"
              />
              <p className="text-xs text-muted-foreground">
                ${(minTvl / 1e9).toFixed(2)}B
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="limit">Límite de Chains</Label>
              <Input
                id="limit"
                type="number"
                value={discoverLimit}
                onChange={(e) => setDiscoverLimit(parseInt(e.target.value) || 20)}
                placeholder="20"
                max="100"
              />
              <p className="text-xs text-muted-foreground">
                Máx 100 chains
              </p>
            </div>
            <div className="flex items-end">
              <Button
                onClick={runAutoDiscovery}
                disabled={discovering}
                className="w-full"
                size="lg"
              >
                {discovering ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Descubriendo...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Descubrir Chains
                  </>
                )}
              </Button>
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => runHealthCheck()}
                disabled={healthChecking}
                variant="outline"
                className="w-full"
                size="lg"
              >
                {healthChecking ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <Activity className="h-4 w-4 mr-2" />
                    Health Check
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedChainIds.length > 0 && (
        <Card className="border-primary">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Operaciones Batch</CardTitle>
                <CardDescription>
                  {selectedChainIds.length} blockchain(s) seleccionada(s)
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllChains}
                >
                  Seleccionar Todas
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearSelection}
                >
                  Limpiar Selección
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button
                onClick={() => batchToggleChains(true)}
                disabled={batchToggling}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {batchToggling ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Activar Seleccionadas
                  </>
                )}
              </Button>
              <Button
                onClick={() => batchToggleChains(false)}
                disabled={batchToggling}
                variant="destructive"
                className="flex-1"
              >
                {batchToggling ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 mr-2" />
                    Desactivar Seleccionadas
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {chains.map((chain) => (
            <Card 
              key={chain.chainId} 
              className={`hover:shadow-lg transition-shadow ${selectedChainIds.includes(chain.chainId) ? 'ring-2 ring-primary' : ''}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedChainIds.includes(chain.chainId)}
                      onChange={() => toggleChainSelection(chain.chainId)}
                      className="h-4 w-4 cursor-pointer"
                    />
                    <Network className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{chain.name}</CardTitle>
                  </div>
                  <Badge 
                    className={chain.isActive ? "bg-green-500 text-white hover:bg-green-600" : "bg-gray-500 text-white"}
                  >
                    {chain.isActive ? "Activa" : "Inactiva"}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Chain ID: {chain.chainId} • {chain.isEvm ? "EVM" : "Non-EVM"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <span>{chain.rpcCount || 0} RPCs</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(chain.healthyRpcs || 0) > 0 ? (
                      <Wifi className="h-4 w-4 text-green-500" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-red-500" />
                    )}
                    <span>
                      {chain.healthyRpcs || 0}/{chain.rpcCount || 0} OK
                    </span>
                  </div>
                </div>

                {chain.avgLatency && (
                  <div className="flex items-center gap-2 text-sm">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <span>Latencia promedio: {chain.avgLatency}ms</span>
                  </div>
                )}

                {chain.dexes && chain.dexes.length > 0 ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-muted-foreground">
                        DEXs configurados ({chain.dexes.length}):
                      </div>
                      <Dialog 
                        open={dexModalOpen && selectedChain === chain.chainId}
                        onOpenChange={(open) => {
                          setDexModalOpen(open);
                          if (!open) {
                            setSelectedDexes([]);
                            setDexSuggestions([]);
                            setSelectedChain(null);
                          }
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => {
                              setSelectedChain(chain.chainId);
                              fetchDexSuggestions(chain.chainId);
                              setDexModalOpen(true);
                            }}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Gestionar DEXs - {chain.name}</DialogTitle>
                            <DialogDescription>
                              Selecciona los DEXs activos para esta blockchain. Los cambios se aplican de forma completa e inmediata.
                            </DialogDescription>
                          </DialogHeader>

                          {loadingSuggestions ? (
                            <div className="flex items-center justify-center py-8">
                              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                          ) : dexSuggestions.length > 0 ? (
                            <div className="space-y-4">
                              <div className="grid gap-2">
                                {dexSuggestions.map((dex) => (
                                  <div
                                    key={dex.slug}
                                    className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                                      selectedDexes.includes(dex.name)
                                        ? "bg-primary/10 border-primary"
                                        : "hover:bg-muted"
                                    }`}
                                    onClick={() => toggleDexSelection(dex.name)}
                                  >
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <div className="font-medium">{dex.name}</div>
                                        {dex.isAdded && (
                                          <Badge variant="secondary" className="text-xs">
                                            Activo
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="text-sm text-muted-foreground">
                                        TVL: ${(dex.tvl / 1e6).toFixed(2)}M
                                        {dex.change1d && (
                                          <span className={dex.change1d > 0 ? "text-green-500 ml-2" : "text-red-500 ml-2"}>
                                            {dex.change1d > 0 ? "+" : ""}{dex.change1d.toFixed(2)}% 24h
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <input
                                      type="checkbox"
                                      checked={selectedDexes.includes(dex.name)}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        toggleDexSelection(dex.name);
                                      }}
                                      className="h-4 w-4"
                                    />
                                  </div>
                                ))}
                              </div>

                              <div className="flex items-center justify-between pt-4 border-t">
                                <span className="text-sm text-muted-foreground">
                                  {selectedDexes.length} DEX(s) seleccionado(s)
                                </span>
                                <Button
                                  onClick={() => saveSelectedDexes(chain.chainId)}
                                  disabled={addingDexes}
                                >
                                  {addingDexes ? (
                                    <>
                                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                      Guardando...
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="h-4 w-4 mr-2" />
                                      Guardar Configuración
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-8 text-muted-foreground">
                              No hay DEXs disponibles
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {chain.dexes.slice(0, 4).map((dex) => (
                        <Badge key={dex} variant="secondary" className="text-xs">
                          {dex}
                        </Badge>
                      ))}
                      {chain.dexes.length > 4 && (
                        <Badge variant="outline" className="text-xs">
                          +{chain.dexes.length - 4} más
                        </Badge>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-muted-foreground">
                        Sin DEXs configurados
                      </div>
                      <Dialog 
                        open={dexModalOpen && selectedChain === chain.chainId}
                        onOpenChange={(open) => {
                          setDexModalOpen(open);
                          if (!open) {
                            setSelectedDexes([]);
                            setDexSuggestions([]);
                            setSelectedChain(null);
                          }
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedChain(chain.chainId);
                              fetchDexSuggestions(chain.chainId);
                              setDexModalOpen(true);
                            }}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Agregar DEXs
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Gestionar DEXs - {chain.name}</DialogTitle>
                            <DialogDescription>
                              Selecciona los DEXs activos para esta blockchain. Los cambios se aplican de forma completa e inmediata.
                            </DialogDescription>
                          </DialogHeader>

                          {loadingSuggestions ? (
                            <div className="flex items-center justify-center py-8">
                              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                          ) : dexSuggestions.length > 0 ? (
                            <div className="space-y-4">
                              <div className="grid gap-2">
                                {dexSuggestions.map((dex) => (
                                  <div
                                    key={dex.slug}
                                    className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                                      selectedDexes.includes(dex.name)
                                        ? "bg-primary/10 border-primary"
                                        : "hover:bg-muted"
                                    }`}
                                    onClick={() => toggleDexSelection(dex.name)}
                                  >
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <div className="font-medium">{dex.name}</div>
                                        {dex.isAdded && (
                                          <Badge variant="secondary" className="text-xs">
                                            Activo
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="text-sm text-muted-foreground">
                                        TVL: ${(dex.tvl / 1e6).toFixed(2)}M
                                        {dex.change1d && (
                                          <span className={dex.change1d > 0 ? "text-green-500 ml-2" : "text-red-500 ml-2"}>
                                            {dex.change1d > 0 ? "+" : ""}{dex.change1d.toFixed(2)}% 24h
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <input
                                      type="checkbox"
                                      checked={selectedDexes.includes(dex.name)}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        toggleDexSelection(dex.name);
                                      }}
                                      className="h-4 w-4"
                                    />
                                  </div>
                                ))}
                              </div>

                              <div className="flex items-center justify-between pt-4 border-t">
                                <span className="text-sm text-muted-foreground">
                                  {selectedDexes.length} DEX(s) seleccionado(s)
                                </span>
                                <Button
                                  onClick={() => saveSelectedDexes(chain.chainId)}
                                  disabled={addingDexes}
                                >
                                  {addingDexes ? (
                                    <>
                                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                      Guardando...
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="h-4 w-4 mr-2" />
                                      Guardar Configuración
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-8 text-muted-foreground">
                              No hay DEXs disponibles
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={chain.isActive || false}
                      onCheckedChange={(checked) => toggleChain(chain.chainId, checked)}
                      className="data-[state=checked]:bg-green-500"
                    />
                    <Label className="text-sm cursor-pointer" onClick={() => toggleChain(chain.chainId, !chain.isActive)}>
                      {chain.isActive ? "Activa" : "Inactiva"}
                    </Label>
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setSelectedChain(chain.chainId)}
                      >
                        Ver RPCs
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>
                          RPCs de {chain.name}
                        </DialogTitle>
                        <DialogDescription>
                          Chain ID {chain.chainId} • {rpcs.length} RPC endpoints configurados
                        </DialogDescription>
                      </DialogHeader>
                      
                      <div className="space-y-3 mt-4">
                        {rpcs.map((rpc) => (
                          <Card key={rpc.id}>
                            <CardContent className="pt-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-2">
                                    {rpc.isActive ? (
                                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                                    ) : (
                                      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                                    )}
                                    <span className="text-xs font-mono truncate">
                                      {rpc.url}
                                    </span>
                                  </div>
                                  <div className="flex gap-4 text-xs text-muted-foreground">
                                    {rpc.lastLatencyMs !== null && (
                                      <span>Latencia: {rpc.lastLatencyMs}ms</span>
                                    )}
                                    {rpc.lastOkAt !== null && (
                                      <span>
                                        Último OK: {new Date(rpc.lastOkAt).toLocaleTimeString()}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <Badge variant={rpc.isActive ? "default" : "destructive"}>
                                  {rpc.isActive ? "Activo" : "Inactivo"}
                                </Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                        
                        {rpcs.length === 0 && (
                          <p className="text-center text-muted-foreground py-8">
                            No hay RPCs configurados para esta blockchain
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2 mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => runHealthCheck(chain.chainId)}
                          disabled={healthChecking}
                        >
                          {healthChecking ? (
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Activity className="h-4 w-4 mr-2" />
                          )}
                          Health Check
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && chains.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center">
            <Network className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay blockchains configuradas</h3>
            <p className="text-muted-foreground mb-4">
              Ejecuta Auto-Discovery para agregar blockchains automáticamente
            </p>
            <Button onClick={runAutoDiscovery} disabled={discovering}>
              {discovering ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Iniciar Auto-Discovery
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
