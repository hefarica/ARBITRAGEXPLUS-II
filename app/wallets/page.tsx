"use client"

import { useState, useEffect, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ethers } from "ethers"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import {
  Wallet, Plus, Trash2, Edit, RefreshCw, AlertTriangle,
  DollarSign, Activity, Download, Shield, 
  ExternalLink, Copy, Check, Fuel
} from "lucide-react"

// Chain configurations
const CHAINS: Record<number, { name: string; symbol: string; explorer: string; rpc: string; color: string }> = {
  1: { name: "Ethereum", symbol: "ETH", explorer: "https://etherscan.io", rpc: "https://cloudflare-eth.com", color: "bg-blue-500" },
  10: { name: "Optimism", symbol: "ETH", explorer: "https://optimistic.etherscan.io", rpc: "https://mainnet.optimism.io", color: "bg-red-500" },
  56: { name: "BSC", symbol: "BNB", explorer: "https://bscscan.com", rpc: "https://bsc-dataseed.binance.org", color: "bg-yellow-500" },
  137: { name: "Polygon", symbol: "MATIC", explorer: "https://polygonscan.com", rpc: "https://polygon-rpc.com", color: "bg-purple-500" },
  42161: { name: "Arbitrum", symbol: "ETH", explorer: "https://arbiscan.io", rpc: "https://arb1.arbitrum.io/rpc", color: "bg-blue-600" },
  8453: { name: "Base", symbol: "ETH", explorer: "https://basescan.org", rpc: "https://mainnet.base.org", color: "bg-blue-400" },
  43114: { name: "Avalanche", symbol: "AVAX", explorer: "https://snowtrace.io", rpc: "https://api.avax.network/ext/bc/C/rpc", color: "bg-red-600" }
}

// Types
interface WalletData {
  id: number
  address: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface WalletBalance {
  chainId: number
  chainName: string
  balance: string
  balanceUsd: number
  gasBalance: string
  gasBalanceUsd: number
}

// API functions
async function fetchWallets(): Promise<WalletData[]> {
  const response = await fetch('/api/wallets')
  if (!response.ok) throw new Error('Failed to fetch wallets')
  return response.json()
}

async function createWallet(data: { address: string; name: string; privateKey?: string }) {
  const response = await fetch('/api/wallets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create wallet')
  }
  return response.json()
}

async function updateWallet(id: number, data: { name: string; isActive: boolean }) {
  const response = await fetch(`/api/wallets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error('Failed to update wallet')
  return response.json()
}

async function deleteWallet(id: number) {
  const response = await fetch(`/api/wallets/${id}`, {
    method: 'DELETE'
  })
  if (!response.ok) throw new Error('Failed to delete wallet')
  return response.json()
}

async function importWalletFromEnv() {
  const response = await fetch('/api/wallets/import-from-env', {
    method: 'POST'
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to import wallet')
  }
  return response.json()
}

// Balance fetching using ethers
async function fetchWalletBalances(address: string): Promise<WalletBalance[]> {
  const balances: WalletBalance[] = []
  
  for (const [chainId, config] of Object.entries(CHAINS)) {
    try {
      const provider = new ethers.JsonRpcProvider(config.rpc)
      const balance = await provider.getBalance(address)
      const balanceInEther = ethers.formatEther(balance)
      
      // Mock price for demo - in production, use real price API
      const ethPrice = 2500
      const balanceUsd = parseFloat(balanceInEther) * ethPrice
      
      balances.push({
        chainId: parseInt(chainId),
        chainName: config.name,
        balance: balanceInEther,
        balanceUsd,
        gasBalance: balanceInEther,
        gasBalanceUsd: balanceUsd
      })
    } catch (error) {
      console.error(`Error fetching balance for ${config.name}:`, error)
      balances.push({
        chainId: parseInt(chainId),
        chainName: config.name,
        balance: "0",
        balanceUsd: 0,
        gasBalance: "0",
        gasBalanceUsd: 0
      })
    }
  }
  
  return balances
}

// Wallet Card Component
function WalletCard({ 
  wallet, 
  balances, 
  onEdit, 
  onDelete, 
  onRefresh 
}: {
  wallet: WalletData
  balances: WalletBalance[]
  onEdit: () => void
  onDelete: () => void
  onRefresh: () => void
}) {
  const [copied, setCopied] = useState(false)
  const totalBalance = balances.reduce((sum, b) => sum + b.balanceUsd, 0)
  
  const copyAddress = () => {
    navigator.clipboard.writeText(wallet.address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            <CardTitle className="text-lg">{wallet.name}</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant={wallet.isActive ? "default" : "secondary"}>
              {wallet.isActive ? "Active" : "Inactive"}
            </Badge>
            <Button size="icon" variant="ghost" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={onEdit}>
              <Edit className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <CardDescription className="flex items-center gap-2 font-mono text-xs">
          {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
          <Button
            size="icon"
            variant="ghost"
            className="h-4 w-4"
            onClick={copyAddress}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Total Balance</span>
            <span className="text-2xl font-bold">${totalBalance.toFixed(2)}</span>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            {balances.map((balance) => (
              <div key={balance.chainId} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                <div className={`w-2 h-2 rounded-full ${CHAINS[balance.chainId]?.color || 'bg-gray-500'}`} />
                <div className="flex-1">
                  <div className="text-xs font-medium">{balance.chainName}</div>
                  <div className="text-xs text-muted-foreground">
                    {parseFloat(balance.balance).toFixed(4)} {CHAINS[balance.chainId]?.symbol}
                  </div>
                </div>
                <div className="text-xs font-medium">${balance.balanceUsd.toFixed(2)}</div>
              </div>
            ))}
          </div>
          
          {balances.some(b => parseFloat(b.gasBalance) < 0.01) && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-xs">Low gas on some chains</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Main Page Component
export default function WalletsPage() {
  const [isAddWalletOpen, setIsAddWalletOpen] = useState(false)
  const [editingWallet, setEditingWallet] = useState<WalletData | null>(null)
  const [balancesMap, setBalancesMap] = useState<Record<string, WalletBalance[]>>({})
  const [autoRefresh, setAutoRefresh] = useState(true)
  
  const { toast } = useToast()
  const queryClient = useQueryClient()
  
  // Fetch wallets
  const { data: wallets = [], isLoading } = useQuery<WalletData[]>({
    queryKey: ['wallets'],
    queryFn: fetchWallets,
    refetchInterval: 30000
  })
  
  // Create wallet mutation
  const createMutation = useMutation({
    mutationFn: createWallet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] })
      setIsAddWalletOpen(false)
      toast({ title: "Wallet created successfully" })
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to create wallet", 
        description: error.message,
        variant: "destructive"
      })
    }
  })
  
  // Update wallet mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => updateWallet(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] })
      setEditingWallet(null)
      toast({ title: "Wallet updated successfully" })
    },
    onError: () => {
      toast({ 
        title: "Failed to update wallet", 
        variant: "destructive" 
      })
    }
  })
  
  // Delete wallet mutation
  const deleteMutation = useMutation({
    mutationFn: deleteWallet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] })
      toast({ title: "Wallet deleted successfully" })
    },
    onError: () => {
      toast({ 
        title: "Failed to delete wallet", 
        variant: "destructive" 
      })
    }
  })
  
  // Import from env mutation
  const importEnvMutation = useMutation({
    mutationFn: importWalletFromEnv,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] })
      toast({ 
        title: "Wallet imported", 
        description: data.message 
      })
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to import wallet", 
        description: error.message,
        variant: "destructive" 
      })
    }
  })
  
  // Fetch balances for all wallets
  const refreshBalances = useCallback(async () => {
    if (!wallets.length) return
    
    const newBalances: Record<string, WalletBalance[]> = {}
    
    for (const wallet of wallets) {
      try {
        const balances = await fetchWalletBalances(wallet.address)
        newBalances[wallet.address] = balances
      } catch (error) {
        console.error(`Failed to fetch balances for ${wallet.address}:`, error)
      }
    }
    
    setBalancesMap(newBalances)
  }, [wallets])
  
  // Auto-refresh balances
  useEffect(() => {
    refreshBalances()
    
    if (autoRefresh) {
      const interval = setInterval(refreshBalances, 10000)
      return () => clearInterval(interval)
    }
  }, [refreshBalances, autoRefresh])
  
  // Calculate totals
  const totalBalance = Object.values(balancesMap).reduce((sum, walletBalances) => {
    return sum + walletBalances.reduce((wSum, b) => wSum + b.balanceUsd, 0)
  }, 0)
  
  const totalGasAlerts = Object.values(balancesMap).reduce((count, walletBalances) => {
    return count + walletBalances.filter(b => parseFloat(b.gasBalance) < 0.01).length
  }, 0)
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Wallet Management</h1>
          <p className="text-muted-foreground">
            Manage your wallets and monitor balances across multiple chains
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => importEnvMutation.mutate()}
            disabled={importEnvMutation.isPending}
          >
            <Download className="h-4 w-4 mr-2" />
            Import from ENV
          </Button>
          <Dialog open={isAddWalletOpen} onOpenChange={setIsAddWalletOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Wallet
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Wallet</DialogTitle>
                <DialogDescription>
                  Add a new wallet to monitor its balance and transactions
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const formData = new FormData(e.currentTarget)
                  createMutation.mutate({
                    address: formData.get('address') as string,
                    name: formData.get('name') as string,
                    privateKey: formData.get('privateKey') as string || undefined
                  })
                }}
              >
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Wallet Name</Label>
                    <Input
                      id="name"
                      name="name"
                      placeholder="My Main Wallet"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Wallet Address</Label>
                    <Input
                      id="address"
                      name="address"
                      placeholder="0x..."
                      pattern="^0x[a-fA-F0-9]{40}$"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="privateKey">
                      Private Key (Optional - Will be encrypted)
                    </Label>
                    <Input
                      id="privateKey"
                      name="privateKey"
                      type="password"
                      placeholder="Optional - for transaction signing"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    Add Wallet
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalBalance.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Across all wallets and chains
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Wallets</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {wallets.filter(w => w.isActive).length} / {wallets.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Currently monitoring
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gas Alerts</CardTitle>
            <Fuel className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalGasAlerts}</div>
            <p className="text-xs text-muted-foreground">
              Chains with low gas
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Auto Refresh</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Button
                variant={autoRefresh ? "default" : "outline"}
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                {autoRefresh ? "Enabled" : "Disabled"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshBalances}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Wallets Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : wallets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No wallets configured</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add your first wallet to start monitoring balances
            </p>
            <Button onClick={() => setIsAddWalletOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Wallet
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {wallets.map((wallet) => (
            <WalletCard
              key={wallet.id}
              wallet={wallet}
              balances={balancesMap[wallet.address] || []}
              onEdit={() => setEditingWallet(wallet)}
              onDelete={() => {
                if (confirm(`Delete wallet "${wallet.name}"?`)) {
                  deleteMutation.mutate(wallet.id)
                }
              }}
              onRefresh={refreshBalances}
            />
          ))}
        </div>
      )}
      
      {/* Edit Wallet Dialog */}
      {editingWallet && (
        <Dialog open={!!editingWallet} onOpenChange={() => setEditingWallet(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Wallet</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const formData = new FormData(e.currentTarget)
                updateMutation.mutate({
                  id: editingWallet.id,
                  data: {
                    name: formData.get('name') as string,
                    isActive: formData.get('isActive') === 'true'
                  }
                })
              }}
            >
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Wallet Name</Label>
                  <Input
                    id="edit-name"
                    name="name"
                    defaultValue={editingWallet.name}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-active">Status</Label>
                  <Select name="isActive" defaultValue={editingWallet.isActive.toString()}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Active</SelectItem>
                      <SelectItem value="false">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={updateMutation.isPending}>
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}