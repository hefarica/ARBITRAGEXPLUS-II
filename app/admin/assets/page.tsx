"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Link as LinkIcon,
} from "lucide-react";
import { toast } from "sonner";

interface Asset {
  chainId: number;
  address: string;
  symbol: string;
  decimals: number;
  name: string;
  riskScore: number;
  riskFlags: string[];
}

interface Pair {
  chainId: number;
  base: string;
  quote: string;
  enabled: boolean;
}

export default function AssetsAdminPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch("/cf/engine/state");
      const data = await response.json();
      
      setAssets(data.assets || []);
      setPairs(data.pairs || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const scanAssets = async () => {
    try {
      setScanning(true);
      toast.info("Escaneando assets para riesgos...");
      
      // Group assets by chain
      const assetsByChain = assets.reduce((acc, asset) => {
        if (!acc[asset.chainId]) acc[asset.chainId] = [];
        acc[asset.chainId].push(asset.address);
        return acc;
      }, {} as Record<number, string[]>);

      let totalScanned = 0;
      
      for (const [chainId, addresses] of Object.entries(assetsByChain)) {
        const response = await fetch("/cf/engine/assets/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chainId: Number(chainId), addresses }),
        });
        
        const data = await response.json();
        if (data.success) {
          totalScanned += data.scanned;
        }
      }
      
      toast.success(`${totalScanned} assets escaneados exitosamente`);
      await fetchData();
    } catch (error) {
      console.error("Error scanning assets:", error);
      toast.error("Error escaneando assets");
    } finally {
      setScanning(false);
    }
  };

  const generatePairs = async () => {
    try {
      setGenerating(true);
      toast.info("Generando pares de trading...");
      
      const response = await fetch("/cf/engine/pairs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy_key: "default_risk" }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success(`${data.generated} pares generados automáticamente`);
        await fetchData();
      } else {
        toast.error("Error generando pares");
      }
    } catch (error) {
      console.error("Error generating pairs:", error);
      toast.error("Error generando pares");
    } finally {
      setGenerating(false);
    }
  };

  const getRiskBadge = (score: number) => {
    if (score >= 70) {
      return <Badge className="bg-green-500">Seguro ({score})</Badge>;
    } else if (score >= 40) {
      return <Badge className="bg-yellow-500">Medio ({score})</Badge>;
    } else {
      return <Badge variant="destructive">Alto Riesgo ({score})</Badge>;
    }
  };

  const getRiskIcon = (score: number) => {
    if (score >= 70) {
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    } else if (score >= 40) {
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    } else {
      return <XCircle className="h-5 w-5 text-red-500" />;
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

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Assets y Pares</h1>
          <p className="text-muted-foreground mt-1">
            Administra tokens y pares de trading con scoring anti-rugpull
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={scanAssets}
            disabled={scanning || assets.length === 0}
          >
            {scanning ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Shield className="h-4 w-4 mr-2" />
            )}
            Escanear Assets
          </Button>
          <Button onClick={generatePairs} disabled={generating}>
            {generating ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <LinkIcon className="h-4 w-4 mr-2" />
            )}
            Generar Pares
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{assets.length}</CardTitle>
            <CardDescription>Assets Totales</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">
              {assets.filter((a) => a.riskScore >= 70).length}
            </CardTitle>
            <CardDescription>Assets Seguros (Score ≥70)</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{pairs.length}</CardTitle>
            <CardDescription>Pares de Trading</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Assets Configurados</CardTitle>
              <CardDescription>
                Tokens con scoring de seguridad anti-rugpull
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por símbolo, nombre o dirección..."
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
                    <TableHead>Chain</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead>Dirección</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Flags de Riesgo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssets.map((asset) => (
                    <TableRow key={`${asset.chainId}-${asset.address}`}>
                      <TableCell>
                        <Badge variant="outline">{getChainName(asset.chainId)}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getRiskIcon(asset.riskScore)}
                          <div>
                            <div className="font-medium">{asset.symbol}</div>
                            <div className="text-xs text-muted-foreground">
                              {asset.name}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-mono">
                          {asset.address.slice(0, 6)}...{asset.address.slice(-4)}
                        </span>
                      </TableCell>
                      <TableCell>{getRiskBadge(asset.riskScore)}</TableCell>
                      <TableCell>
                        {asset.riskFlags && asset.riskFlags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {asset.riskFlags.slice(0, 3).map((flag, idx) => (
                              <Badge
                                key={idx}
                                variant="secondary"
                                className="text-xs"
                              >
                                {flag}
                              </Badge>
                            ))}
                            {asset.riskFlags.length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{asset.riskFlags.length - 3}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Sin flags
                          </span>
                        )}
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
              <p className="text-muted-foreground">
                {searchTerm
                  ? "Intenta con otro término de búsqueda"
                  : "Agrega assets usando el Engine API"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pares de Trading Activos</CardTitle>
          <CardDescription>
            Pares configurados para detección de oportunidades MEV
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pairs.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {pairs.map((pair, idx) => {
                const baseAsset = assets.find(
                  (a) => a.chainId === pair.chainId && a.address === pair.base
                );
                const quoteAsset = assets.find(
                  (a) => a.chainId === pair.chainId && a.address === pair.quote
                );

                return (
                  <Card key={idx}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline">{getChainName(pair.chainId)}</Badge>
                        <Badge variant={pair.enabled ? "default" : "secondary"}>
                          {pair.enabled ? "Activo" : "Inactivo"}
                        </Badge>
                      </div>
                      <div className="text-lg font-semibold">
                        {baseAsset?.symbol || "???"} / {quoteAsset?.symbol || "???"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {baseAsset?.name || "Unknown"} / {quoteAsset?.name || "Unknown"}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <LinkIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No hay pares configurados</h3>
              <p className="text-muted-foreground mb-4">
                Genera pares automáticamente basados en assets seguros
              </p>
              <Button onClick={generatePairs} disabled={generating}>
                {generating ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <LinkIcon className="h-4 w-4 mr-2" />
                )}
                Generar Pares
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
