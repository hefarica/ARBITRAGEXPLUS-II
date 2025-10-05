"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
}

interface RPC {
  id: number;
  chainId: number;
  url: string;
  isActive: boolean;
  lastLatencyMs: number | null;
  lastOkAt: number | null;
}

export default function ChainsAdminPage() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const [selectedChain, setSelectedChain] = useState<number | null>(null);
  const [rpcs, setRpcs] = useState<RPC[]>([]);

  const fetchChains = async () => {
    try {
      setLoading(true);
      const response = await fetch("/cf/engine/state");
      const data = await response.json();
      
      const chainsWithCounts = data.chains.map((chain: any) => ({
        chainId: chain.chainId,
        name: chain.name,
        isEvm: chain.evm,
        isActive: true,
        rpcCount: chain.rpcs?.length || 0,
        dexCount: chain.dexes?.length || 0,
        healthyRpcs: chain.rpcs?.filter((r: any) => r.lastOkAt && r.lastOkAt > Date.now() - 300000).length || 0,
        avgLatency: calculateAvgLatency(chain.rpcs || []),
      }));
      
      setChains(chainsWithCounts);
    } catch (error) {
      console.error("Error fetching chains:", error);
      toast.error("Error al cargar blockchains");
    } finally {
      setLoading(false);
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
      toast.info("Iniciando auto-discovery de blockchains...");
      
      const response = await fetch("/cf/engine/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tvlThreshold: 1000000000 }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success(`${data.added} blockchains agregadas automáticamente`);
        await fetchChains();
      } else {
        toast.error("Error en auto-discovery");
      }
    } catch (error) {
      console.error("Error in auto-discovery:", error);
      toast.error("Error ejecutando auto-discovery");
    } finally {
      setDiscovering(false);
    }
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

  useEffect(() => {
    fetchChains();
  }, []);

  useEffect(() => {
    if (selectedChain) {
      fetchRpcs(selectedChain);
    }
  }, [selectedChain]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Blockchains</h1>
          <p className="text-muted-foreground mt-1">
            Administra las blockchains, RPCs y DEXs del sistema MEV
          </p>
        </div>
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
          <Button onClick={runAutoDiscovery} disabled={discovering}>
            {discovering ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            Auto-Discovery
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {chains.map((chain) => (
            <Card key={chain.chainId} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Network className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{chain.name}</CardTitle>
                  </div>
                  <Badge variant={chain.isActive ? "default" : "secondary"}>
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

                <div className="flex gap-2 pt-2">
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
