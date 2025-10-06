"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Shield, 
  Search, 
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
  FileText,
  TrendingUp,
  Zap,
  Info
} from "lucide-react";
import { toast } from "sonner";

interface PoolRef {
  dex: string;
  address: string;
  feeBps: number;
  liquidityUsd: number;
}

interface AssetCandidate {
  trace_id: string;
  chainId: number;
  address: string;
  symbol: string;
  decimals: number;
  name: string;
  score: number;
  flags: string[];
  pools: PoolRef[];
  dexes: string[];
}

interface PairPlan {
  trace_id: string;
  token_in: string;
  token_out: string;
  route: string[];
  hops: number;
  est_profit_bps: number;
  atomic: boolean;
  reasons_block?: string[];
}

interface AssetWithValidation extends AssetCandidate {
  validation_status: "pending" | "validating" | "valid" | "rejected";
  validation_reason?: string;
  validation_message?: string;
  validated_at?: number;
  pairs?: PairPlan[];
}

export default function AssetOrchestratorPage() {
  const [assets, setAssets] = useState<AssetWithValidation[]>([]);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<AssetWithValidation | null>(null);
  const [showValidationDetails, setShowValidationDetails] = useState(false);

  const fetchAssets = async () => {
    try {
      setLoading(true);
      const response = await fetch("/cf/engine/state");
      const data = await response.json();
      
      const assetsWithValidation: AssetWithValidation[] = (data.assets || []).map((a: any) => ({
        trace_id: `${a.chainId}:${a.address}`,
        chainId: a.chainId,
        address: a.address,
        symbol: a.symbol,
        decimals: a.decimals || 18,
        name: a.name || a.symbol,
        score: a.riskScore || 0,
        flags: a.riskFlags || [],
        pools: [],
        dexes: [],
        validation_status: "pending"
      }));

      setAssets(assetsWithValidation);
    } catch (error) {
      console.error("Error fetching assets:", error);
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const validateAsset = async (asset: AssetCandidate) => {
    try {
      setValidating(asset.trace_id);
      toast.info(`Validando ${asset.symbol}...`);

      const response = await fetch("/cf/orchestrator/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset })
      });

      const result = await response.json();

      setAssets(prev => prev.map(a => 
        a.trace_id === asset.trace_id 
          ? (result.asset as AssetWithValidation)
          : a
      ));

      if (result.valid) {
        toast.success(`✅ ${asset.symbol} validado - ${result.plans.length} pares atómicos disponibles`);
      } else {
        toast.error(`❌ ${asset.symbol} rechazado: ${result.message}`);
      }

      return result;
    } catch (error) {
      console.error("Validation error:", error);
      toast.error("Error en validación");
      return null;
    } finally {
      setValidating(null);
    }
  };

  const addToTrading = async (asset: AssetWithValidation) => {
    if (!asset.pairs || asset.pairs.length === 0) {
      toast.error("No hay pares para agregar");
      return;
    }

    try {
      const response = await fetch("/cf/orchestrator/add-to-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset, pairs: asset.pairs })
      });

      const result = await response.json();

      if (result.success) {
        toast.success(`✅ ${asset.symbol} agregado a trading con ${asset.pairs.length} pares`);
      } else {
        toast.error("Error al agregar a trading");
      }
    } catch (error) {
      console.error("Add to trading error:", error);
      toast.error("Error al agregar a trading");
    }
  };

  const getStatusBadge = (asset: AssetWithValidation) => {
    switch (asset.validation_status) {
      case "valid":
        return <Badge className="bg-green-500">✅ Listo</Badge>;
      case "rejected":
        return <Badge variant="destructive">❌ {asset.validation_reason}</Badge>;
      case "validating":
        return <Badge variant="outline">⏳ Validando...</Badge>;
      default:
        return <Badge variant="secondary">⚠️ No Configurado</Badge>;
    }
  };

  const getScoreBadge = (score: number) => {
    if (score >= 70) {
      return <Badge className="bg-green-500">Seguro ({score})</Badge>;
    } else if (score >= 40) {
      return <Badge className="bg-yellow-500">Medio ({score})</Badge>;
    } else {
      return <Badge variant="destructive">Alto Riesgo ({score})</Badge>;
    }
  };

  const getChainName = (chainId: number): string => {
    const names: Record<number, string> = {
      1: "Ethereum",
      56: "BSC",
      8453: "Base",
      137: "Polygon",
      42161: "Arbitrum",
      10: "Optimism",
      43114: "Avalanche",
    };
    return names[chainId] || `Chain ${chainId}`;
  };

  const filteredAssets = assets.filter(
    (asset) =>
      asset.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: assets.length,
    valid: assets.filter(a => a.validation_status === "valid").length,
    rejected: assets.filter(a => a.validation_status === "rejected").length,
    pending: assets.filter(a => a.validation_status === "pending").length,
    totalPairs: assets.reduce((acc, a) => acc + (a.pairs?.length || 0), 0)
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Asset & Pair Orchestrator v2.0</h1>
          <p className="text-muted-foreground mt-1">
            Validación estricta end-to-end - Solo lo verificable y ejecutable
          </p>
        </div>
        <Button variant="outline" onClick={fetchAssets} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Recargar
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
            <CardDescription>Assets Totales</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl text-green-500">{stats.valid}</CardTitle>
            <CardDescription>✅ Validados</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl text-red-500">{stats.rejected}</CardTitle>
            <CardDescription>❌ Rechazados</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{stats.totalPairs}</CardTitle>
            <CardDescription>Pares Atómicos</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pipeline de Validación</CardTitle>
              <CardDescription>
                6 reglas obligatorias: Config → Liquidez → Score → Pares → Profit → Atomicidad
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredAssets.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estado</TableHead>
                    <TableHead>Chain</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead>Dirección</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Pares</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssets.map((asset) => (
                    <TableRow key={asset.trace_id}>
                      <TableCell>{getStatusBadge(asset)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{getChainName(asset.chainId)}</Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{asset.symbol}</div>
                          <div className="text-xs text-muted-foreground">
                            {asset.name}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-mono">
                          {asset.address.slice(0, 6)}...{asset.address.slice(-4)}
                        </span>
                      </TableCell>
                      <TableCell>{getScoreBadge(asset.score)}</TableCell>
                      <TableCell>
                        {asset.pairs && asset.pairs.length > 0 ? (
                          <Badge variant="outline">{asset.pairs.length} pares</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {asset.validation_status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => validateAsset(asset)}
                              disabled={validating === asset.trace_id}
                            >
                              {validating === asset.trace_id ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Shield className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          {asset.validation_status === "valid" && (
                            <Button
                              size="sm"
                              onClick={() => addToTrading(asset)}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              Agregar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedAsset(asset);
                              setShowValidationDetails(true);
                            }}
                          >
                            <Info className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {searchTerm ? "No se encontraron assets" : "No hay assets configurados"}
              </h3>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showValidationDetails} onOpenChange={setShowValidationDetails}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Detalles de Validación: {selectedAsset?.symbol}
            </DialogTitle>
            <DialogDescription>
              Trace ID: {selectedAsset?.trace_id}
            </DialogDescription>
          </DialogHeader>

          {selectedAsset && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Estado</h4>
                  {getStatusBadge(selectedAsset)}
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Safety Score</h4>
                  {getScoreBadge(selectedAsset.score)}
                </div>
              </div>

              {selectedAsset.validation_message && (
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-semibold mb-2">Mensaje de Validación</h4>
                  <p className="text-sm">{selectedAsset.validation_message}</p>
                </div>
              )}

              {selectedAsset.flags && selectedAsset.flags.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Flags de Riesgo</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedAsset.flags.map((flag, idx) => (
                      <Badge key={idx} variant="secondary">{flag}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedAsset.pairs && selectedAsset.pairs.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Pares Validados ({selectedAsset.pairs.length})</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ruta</TableHead>
                        <TableHead>Hops</TableHead>
                        <TableHead>Profit (bps)</TableHead>
                        <TableHead>Atómico</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedAsset.pairs.map((pair, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <div className="font-mono text-xs">
                              {pair.token_in} → {pair.token_out}
                              <div className="text-muted-foreground">
                                {pair.route.join(" › ")}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{pair.hops}</TableCell>
                          <TableCell>
                            <Badge variant={pair.est_profit_bps >= 5 ? "default" : "secondary"}>
                              {pair.est_profit_bps.toFixed(2)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {pair.atomic ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
