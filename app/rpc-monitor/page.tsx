"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { Activity, AlertCircle, CheckCircle, Network, Pause, Play, RefreshCcw, Server, TrendingDown, TrendingUp, XCircle } from "lucide-react";

interface RpcData {
  id: string;
  url: string;
  chainId: number;
  status: 'healthy' | 'degraded' | 'quarantined';
  healthScore: number;
  latencyP50: number;
  latencyP95: number;
  errorRate: number;
  lastCheck: number;
  totalRequests: number;
  failedRequests: number;
}

interface RpcHealthResponse {
  rpcs: RpcData[];
  summary: {
    totalRpcs: number;
    healthyCount: number;
    degradedCount: number;
    quarantinedCount: number;
    averageLatency: number;
    averageErrorRate: number;
  };
}

interface RpcStats {
  totalRpcs: number;
  activeRpcs: number;
  totalRequestsToday: number;
  totalRequestsHour: number;
  averageResponseTime: number;
  successRate: number;
  chainDistribution: Record<string, number>;
  statusDistribution: Record<string, number>;
  topPerformers: Array<{ id: string; score: number; latency: number }>;
  poorPerformers: Array<{ id: string; score: number; latency: number }>;
}

const chainNames: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  56: "BSC",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum",
  11155111: "Sepolia",
  80001: "Mumbai",
  421614: "Arb Sepolia",
  420: "OP Goerli",
};

export default function RpcMonitorPage() {
  const [rpcHealth, setRpcHealth] = useState<RpcHealthResponse | null>(null);
  const [rpcStats, setRpcStats] = useState<RpcStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [chainFilter, setChainFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const { toast } = useToast();

  const fetchRpcHealth = async () => {
    try {
      const response = await fetch("/api/rpc/health");
      if (!response.ok) throw new Error("Failed to fetch RPC health");
      const data = await response.json();
      setRpcHealth(data);
    } catch (error) {
      console.error("Error fetching RPC health:", error);
      toast({
        title: "Error",
        description: "Failed to fetch RPC health data",
        variant: "destructive",
      });
    }
  };

  const fetchRpcStats = async () => {
    try {
      const response = await fetch("/api/rpc/stats");
      if (!response.ok) throw new Error("Failed to fetch RPC stats");
      const data = await response.json();
      setRpcStats(data);
    } catch (error) {
      console.error("Error fetching RPC stats:", error);
    }
  };

  const toggleRpc = async (rpcId: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/rpc/toggle/${rpcId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      
      if (!response.ok) throw new Error("Failed to toggle RPC");
      
      toast({
        title: "Success",
        description: `RPC ${rpcId} ${enabled ? 'enabled' : 'disabled'}`,
      });
      
      fetchRpcHealth();
    } catch (error) {
      console.error("Error toggling RPC:", error);
      toast({
        title: "Error",
        description: "Failed to toggle RPC",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([fetchRpcHealth(), fetchRpcStats()]);
      setLoading(false);
    };

    fetchData();

    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchRpcHealth();
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'degraded':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'quarantined':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      healthy: "default",
      degraded: "secondary",
      quarantined: "destructive",
    };
    
    return (
      <Badge variant={variants[status] || "outline"} className="flex items-center gap-1">
        {getStatusIcon(status)}
        {status}
      </Badge>
    );
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const formatLatency = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const filteredRpcs = rpcHealth?.rpcs?.filter(rpc => {
    if (searchFilter && !rpc.url.toLowerCase().includes(searchFilter.toLowerCase()) && 
        !rpc.id.toLowerCase().includes(searchFilter.toLowerCase())) {
      return false;
    }
    if (chainFilter !== "all" && rpc.chainId.toString() !== chainFilter) {
      return false;
    }
    if (statusFilter !== "all" && rpc.status !== statusFilter) {
      return false;
    }
    return true;
  }) || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center space-y-4">
          <RefreshCcw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading RPC infrastructure...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">RPC Infrastructure Monitor</h1>
          <p className="text-muted-foreground">
            Real-time monitoring of 100+ free RPC endpoints across multiple chains
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
            {autoRefresh ? "Pause" : "Resume"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchRpcHealth();
              fetchRpcStats();
            }}
          >
            <RefreshCcw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total RPCs</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rpcHealth?.summary.totalRpcs || 0}</div>
            <p className="text-xs text-muted-foreground">
              {rpcStats?.activeRpcs || 0} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Health Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {((rpcHealth?.summary.healthyCount || 0) / (rpcHealth?.summary.totalRpcs || 1) * 100).toFixed(0)}%
            </div>
            <div className="flex gap-2 mt-1">
              <span className="text-xs text-green-600">
                {rpcHealth?.summary.healthyCount || 0} healthy
              </span>
              <span className="text-xs text-yellow-600">
                {rpcHealth?.summary.degradedCount || 0} degraded
              </span>
              <span className="text-xs text-red-600">
                {rpcHealth?.summary.quarantinedCount || 0} quarantined
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatLatency(rpcHealth?.summary.averageLatency || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Error rate: {((rpcHealth?.summary.averageErrorRate || 0) * 100).toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(rpcStats?.totalRequestsToday || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(rpcStats?.totalRequestsHour || 0)}/hour
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="monitor" className="space-y-4">
        <TabsList>
          <TabsTrigger value="monitor">Monitor</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="distribution">Distribution</TabsTrigger>
        </TabsList>

        <TabsContent value="monitor" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>RPC Endpoints</CardTitle>
              <CardDescription>
                Monitor and manage individual RPC endpoint health
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Search by URL or ID..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="max-w-xs"
                />
                <Select value={chainFilter} onValueChange={setChainFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by chain" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Chains</SelectItem>
                    <SelectItem value="1">Ethereum</SelectItem>
                    <SelectItem value="10">Optimism</SelectItem>
                    <SelectItem value="56">BSC</SelectItem>
                    <SelectItem value="137">Polygon</SelectItem>
                    <SelectItem value="8453">Base</SelectItem>
                    <SelectItem value="42161">Arbitrum</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="healthy">Healthy</SelectItem>
                    <SelectItem value="degraded">Degraded</SelectItem>
                    <SelectItem value="quarantined">Quarantined</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* RPC Table */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>RPC Endpoint</TableHead>
                      <TableHead>Chain</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Health Score</TableHead>
                      <TableHead>Latency (P50/P95)</TableHead>
                      <TableHead>Error Rate</TableHead>
                      <TableHead>Requests</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRpcs.map((rpc) => (
                      <TableRow key={rpc.id}>
                        <TableCell>
                          <div className="font-medium">{rpc.id}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                            {rpc.url}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {chainNames[rpc.chainId] || `Chain ${rpc.chainId}`}
                          </Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(rpc.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className={`font-bold ${getHealthColor(rpc.healthScore)}`}>
                              {rpc.healthScore}
                            </span>
                            <Progress value={rpc.healthScore} className="w-[60px]" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {formatLatency(rpc.latencyP50)} / {formatLatency(rpc.latencyP95)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={rpc.errorRate > 0.05 ? "text-red-600" : ""}>
                            {(rpc.errorRate * 100).toFixed(2)}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{formatNumber(rpc.totalRequests)}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatNumber(rpc.failedRequests)} failed
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant={rpc.status === 'quarantined' ? "default" : "outline"}
                            onClick={() => toggleRpc(rpc.id, rpc.status === 'quarantined')}
                          >
                            {rpc.status === 'quarantined' ? 'Enable' : 'Disable'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Top Performers</CardTitle>
                <CardDescription>RPCs with best health scores</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {rpcStats?.topPerformers.map((rpc, index) => (
                    <div key={rpc.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">#{index + 1}</span>
                        <span className="text-sm">{rpc.id}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-green-600">
                          {rpc.score}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatLatency(rpc.latency)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Poor Performers</CardTitle>
                <CardDescription>RPCs needing attention</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {rpcStats?.poorPerformers.map((rpc, index) => (
                    <div key={rpc.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">#{index + 1}</span>
                        <span className="text-sm">{rpc.id}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-red-600">
                          {rpc.score}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatLatency(rpc.latency)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="distribution" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Chain Distribution</CardTitle>
                <CardDescription>RPCs per blockchain network</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {rpcStats && Object.entries(rpcStats.chainDistribution).map(([chain, count]) => (
                    <div key={chain} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{chain}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={(count / rpcStats.totalRpcs) * 100} className="w-[100px]" />
                        <span className="text-sm font-medium">{count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status Distribution</CardTitle>
                <CardDescription>RPCs by health status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {rpcStats && Object.entries(rpcStats.statusDistribution).map(([status, count]) => (
                    <div key={status}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(status)}
                          <span className="text-sm capitalize">{status}</span>
                        </div>
                        <span className="text-sm font-medium">{count}</span>
                      </div>
                      <Progress 
                        value={(count / rpcStats.totalRpcs) * 100} 
                        className={`h-2 ${
                          status === 'healthy' ? '[&>div]:bg-green-500' :
                          status === 'degraded' ? '[&>div]:bg-yellow-500' :
                          '[&>div]:bg-red-500'
                        }`}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}