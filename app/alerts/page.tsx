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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { useAlertWebSocket } from "@/lib/websocket-client"
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Area, AreaChart
} from "recharts"
import {
  Bell, BellOff, Plus, Edit2, Trash2, TestTube,
  Zap, TrendingUp, AlertTriangle, Wallet,
  DollarSign, Wifi, WifiOff, Volume2, VolumeX,
  Clock, Activity, Filter, Download, RefreshCw,
  Shield, CheckCircle2, XCircle, Info, AlertCircle
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Alert {
  id: number
  name: string
  type: string
  category: string
  condition: any
  threshold: string
  priority: string
  isActive: boolean
  schedule: string
  soundEnabled: boolean
  chainId?: number
  dex?: string
  tokenAddress?: string
  strategy?: string
  lastTriggered?: string
  triggerCount: number
  createdAt: string
  updatedAt: string
}

interface AlertFormData {
  name: string
  type: string
  category: string
  condition: {
    operator: string
    field: string
    value: number
  }
  threshold: string
  priority: string
  isActive: boolean
  schedule: string
  soundEnabled: boolean
  chainId?: number
  dex?: string
  tokenAddress?: string
  strategy?: string
}

const ALERT_TYPES = [
  { value: "opportunity", label: "Opportunity Alert", icon: TrendingUp },
  { value: "gas", label: "Gas Price Alert", icon: Zap },
  { value: "wallet", label: "Wallet Balance", icon: Wallet },
  { value: "risk", label: "Risk Detection", icon: Shield },
  { value: "price", label: "Price Movement", icon: DollarSign },
]

const ALERT_CATEGORIES = [
  "Price", "Opportunity", "Gas", "Wallet", "Risk"
]

const PRIORITIES = [
  { value: "low", label: "Low", color: "bg-blue-500" },
  { value: "medium", label: "Medium", color: "bg-yellow-500" },
  { value: "high", label: "High", color: "bg-orange-500" },
  { value: "critical", label: "Critical", color: "bg-red-500" },
]

const OPERATORS = [
  { value: "gt", label: "Greater than (>)" },
  { value: "lt", label: "Less than (<)" },
  { value: "gte", label: "Greater or equal (≥)" },
  { value: "lte", label: "Less or equal (≤)" },
  { value: "eq", label: "Equal to (=)" },
]

const SCHEDULES = [
  { value: "instant", label: "Instant" },
  { value: "5min", label: "Every 5 minutes" },
  { value: "hourly", label: "Every hour" },
]

// Priority icon mapping
const PriorityIcon = ({ priority }: { priority: string }) => {
  switch (priority) {
    case "low":
      return <Info className="h-4 w-4 text-blue-500" />
    case "medium":
      return <AlertCircle className="h-4 w-4 text-yellow-500" />
    case "high":
      return <AlertTriangle className="h-4 w-4 text-orange-500" />
    case "critical":
      return <XCircle className="h-4 w-4 text-red-500" />
    default:
      return <Info className="h-4 w-4" />
  }
}

export default function AlertsPage() {
  const queryClient = useQueryClient()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingAlert, setEditingAlert] = useState<Alert | null>(null)
  const [activeTab, setActiveTab] = useState("active")
  const [filterType, setFilterType] = useState("all")
  const [filterPriority, setFilterPriority] = useState("all")

  // WebSocket connection
  const {
    status: wsStatus,
    unreadCount,
    recentAlerts,
    testAlert,
    clearUnread,
    clearRecentAlerts
  } = useAlertWebSocket({
    onAlert: (alert) => {
      // Show toast notification
      toast(alert.message, {
        description: `${alert.name} - Priority: ${alert.priority}`,
        icon: <PriorityIcon priority={alert.priority} />,
        duration: 5000,
      })
      
      // Refetch alerts and stats
      queryClient.invalidateQueries({ queryKey: ["alerts"] })
      queryClient.invalidateQueries({ queryKey: ["alert-stats"] })
      queryClient.invalidateQueries({ queryKey: ["alert-history"] })
    },
    onStatusChange: (status) => {
      if (!status.connected && status.error) {
        toast.error("Connection lost", {
          description: "Attempting to reconnect...",
        })
      }
    }
  })

  // Initial form state
  const [formData, setFormData] = useState<AlertFormData>({
    name: "",
    type: "opportunity",
    category: "Opportunity",
    condition: {
      operator: "gt",
      field: "value",
      value: 0
    },
    threshold: "100",
    priority: "medium",
    isActive: true,
    schedule: "instant",
    soundEnabled: false,
  })

  // Fetch alerts
  const { data: alerts = [], isLoading: alertsLoading } = useQuery({
    queryKey: ["alerts"],
    queryFn: async () => {
      const res = await fetch("/api/alerts")
      return res.json()
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  })

  // Fetch alert statistics
  const { data: stats } = useQuery({
    queryKey: ["alert-stats"],
    queryFn: async () => {
      const res = await fetch("/api/alerts/stats")
      return res.json()
    },
    refetchInterval: 60000,
  })

  // Fetch alert history
  const { data: alertHistory = [] } = useQuery({
    queryKey: ["alert-history"],
    queryFn: async () => {
      const res = await fetch("/api/alerts/history?limit=50")
      return res.json()
    },
    refetchInterval: 30000,
  })

  // Create alert mutation
  const createMutation = useMutation({
    mutationFn: async (data: AlertFormData) => {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to create alert")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] })
      queryClient.invalidateQueries({ queryKey: ["alert-stats"] })
      toast.success("Alert created successfully")
      setIsCreateDialogOpen(false)
      resetForm()
    },
    onError: () => {
      toast.error("Failed to create alert")
    },
  })

  // Update alert mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: AlertFormData }) => {
      const res = await fetch(`/api/alerts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to update alert")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] })
      toast.success("Alert updated successfully")
      setEditingAlert(null)
      resetForm()
    },
    onError: () => {
      toast.error("Failed to update alert")
    },
  })

  // Delete alert mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/alerts/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete alert")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] })
      queryClient.invalidateQueries({ queryKey: ["alert-stats"] })
      toast.success("Alert deleted successfully")
    },
    onError: () => {
      toast.error("Failed to delete alert")
    },
  })

  // Toggle alert mutation
  const toggleMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/alerts/${id}/toggle`, {
        method: "POST",
      })
      if (!res.ok) throw new Error("Failed to toggle alert")
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] })
      toast.success(`Alert ${data.isActive ? "activated" : "deactivated"}`)
    },
    onError: () => {
      toast.error("Failed to toggle alert")
    },
  })

  // Test alert mutation
  const testAlertMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/alerts/${id}/test`, {
        method: "POST",
      })
      if (!res.ok) throw new Error("Failed to test alert")
      return res.json()
    },
    onSuccess: () => {
      toast.info("Test alert sent - check notifications")
    },
    onError: () => {
      toast.error("Failed to test alert")
    },
  })

  // Filter alerts
  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert: Alert) => {
      const matchesTab = activeTab === "all" || 
        (activeTab === "active" && alert.isActive) || 
        (activeTab === "inactive" && !alert.isActive)
      
      const matchesType = filterType === "all" || alert.type === filterType
      const matchesPriority = filterPriority === "all" || alert.priority === filterPriority
      
      return matchesTab && matchesType && matchesPriority
    })
  }, [alerts, activeTab, filterType, filterPriority])

  // Prepare chart data
  const chartData = useMemo(() => {
    // Group history by day
    const byDay: Record<string, number> = {}
    const now = new Date()
    
    // Initialize last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      byDay[key] = 0
    }
    
    // Count alerts per day
    alertHistory.forEach((item: any) => {
      const date = new Date(item.triggeredAt)
      const key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      if (byDay.hasOwnProperty(key)) {
        byDay[key]++
      }
    })
    
    return Object.entries(byDay).map(([day, count]) => ({ day, count }))
  }, [alertHistory])

  // Priority distribution data
  const priorityData = useMemo(() => {
    const distribution: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    }
    
    alerts.forEach((alert: Alert) => {
      if (alert.isActive && distribution.hasOwnProperty(alert.priority)) {
        distribution[alert.priority]++
      }
    })
    
    return Object.entries(distribution).map(([priority, count]) => ({
      name: priority.charAt(0).toUpperCase() + priority.slice(1),
      value: count,
      color: PRIORITIES.find(p => p.value === priority)?.color || "#6B7280"
    }))
  }, [alerts])

  const resetForm = () => {
    setFormData({
      name: "",
      type: "opportunity",
      category: "Opportunity",
      condition: {
        operator: "gt",
        field: "value",
        value: 0
      },
      threshold: "100",
      priority: "medium",
      isActive: true,
      schedule: "instant",
      soundEnabled: false,
    })
  }

  const handleCreateOrUpdate = () => {
    if (editingAlert) {
      updateMutation.mutate({ id: editingAlert.id, data: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  useEffect(() => {
    if (editingAlert) {
      setFormData({
        name: editingAlert.name,
        type: editingAlert.type,
        category: editingAlert.category,
        condition: editingAlert.condition,
        threshold: editingAlert.threshold,
        priority: editingAlert.priority,
        isActive: editingAlert.isActive,
        schedule: editingAlert.schedule,
        soundEnabled: editingAlert.soundEnabled,
        chainId: editingAlert.chainId,
        dex: editingAlert.dex,
        tokenAddress: editingAlert.tokenAddress,
        strategy: editingAlert.strategy,
      })
    }
  }, [editingAlert])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Alert Center</h1>
          <p className="text-muted-foreground">
            Manage and monitor your trading alerts
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Connection Status */}
          <div className="flex items-center gap-2">
            {wsStatus.connected ? (
              <>
                <Wifi className="h-4 w-4 text-green-500" />
                <span className="text-sm text-green-500">Connected</span>
              </>
            ) : wsStatus.reconnecting ? (
              <>
                <RefreshCw className="h-4 w-4 text-yellow-500 animate-spin" />
                <span className="text-sm text-yellow-500">Reconnecting...</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-red-500" />
                <span className="text-sm text-red-500">Disconnected</span>
              </>
            )}
          </div>

          {/* Notification Badge */}
          {unreadCount > 0 && (
            <Badge variant="destructive" className="animate-pulse">
              {unreadCount} new
            </Badge>
          )}

          {/* Create Alert Button */}
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => {
                resetForm()
                setEditingAlert(null)
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Create Alert
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingAlert ? "Edit Alert" : "Create New Alert"}</DialogTitle>
                <DialogDescription>
                  Configure alert conditions and notification preferences
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Alert Name</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., High profit opportunity"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Alert Type</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value) => setFormData({ 
                        ...formData, 
                        type: value,
                        category: ALERT_TYPES.find(t => t.value === value)?.label.split(' ')[0] || "Opportunity"
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALERT_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center gap-2">
                              <type.icon className="h-4 w-4" />
                              {type.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Operator</Label>
                    <Select
                      value={formData.condition.operator}
                      onValueChange={(value) => setFormData({
                        ...formData,
                        condition: { ...formData.condition, operator: value }
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATORS.map(op => (
                          <SelectItem key={op.value} value={op.value}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Threshold Value</Label>
                    <Input
                      type="number"
                      value={formData.threshold}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        threshold: e.target.value,
                        condition: { ...formData.condition, value: parseFloat(e.target.value) }
                      })}
                      placeholder="100"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value) => setFormData({ ...formData, priority: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map(p => (
                          <SelectItem key={p.value} value={p.value}>
                            <div className="flex items-center gap-2">
                              <div className={cn("h-2 w-2 rounded-full", p.color)} />
                              {p.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Check Schedule</Label>
                    <Select
                      value={formData.schedule}
                      onValueChange={(value) => setFormData({ ...formData, schedule: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SCHEDULES.map(s => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Options</Label>
                    <div className="flex items-center gap-4 pt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.isActive}
                          onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm">Active</span>
                      </label>
                      
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.soundEnabled}
                          onChange={(e) => setFormData({ ...formData, soundEnabled: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm">Sound</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Alert Preview */}
                <Card className="bg-muted/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Preview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <PriorityIcon priority={formData.priority} />
                      <span className="font-medium">{formData.name || "Alert Name"}</span>
                      <Badge variant="outline" className="ml-auto">
                        {formData.type}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Trigger when value {formData.condition.operator} {formData.threshold}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setIsCreateDialogOpen(false)
                  setEditingAlert(null)
                  resetForm()
                }}>
                  Cancel
                </Button>
                <Button onClick={handleCreateOrUpdate}>
                  {editingAlert ? "Update Alert" : "Create Alert"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.active || 0} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Triggered Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.triggeredToday || 0}</div>
            <p className="text-xs text-muted-foreground">
              Notifications sent
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Unread Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{unreadCount}</div>
            {unreadCount > 0 && (
              <Button
                variant="link"
                size="sm"
                className="p-0 h-auto text-xs"
                onClick={clearUnread}
              >
                Clear all
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Connection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {wsStatus.connected ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span className="text-sm font-medium">Live</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-red-500" />
                  <span className="text-sm font-medium">Offline</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alert List */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Configured Alerts</CardTitle>
                <div className="flex items-center gap-2">
                  {/* Filters */}
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {ALERT_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filterPriority} onValueChange={setFilterPriority}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priority</SelectItem>
                      {PRIORITIES.map(p => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="active">Active</TabsTrigger>
                  <TabsTrigger value="inactive">Inactive</TabsTrigger>
                </TabsList>
                <TabsContent value={activeTab} className="space-y-2">
                  {alertsLoading ? (
                    <div className="text-center py-8">Loading alerts...</div>
                  ) : filteredAlerts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No alerts found
                    </div>
                  ) : (
                    filteredAlerts.map((alert: Alert) => (
                      <Card key={alert.id} className={cn(
                        "border",
                        !alert.isActive && "opacity-60"
                      )}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <PriorityIcon priority={alert.priority} />
                                <h4 className="font-semibold">{alert.name}</h4>
                                {alert.isActive ? (
                                  <Badge variant="outline" className="text-green-500">
                                    Active
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-gray-500">
                                    Inactive
                                  </Badge>
                                )}
                                <Badge variant="outline">{alert.type}</Badge>
                                {alert.soundEnabled && <Volume2 className="h-3 w-3" />}
                              </div>
                              
                              <p className="text-sm text-muted-foreground mt-1">
                                Trigger when value {alert.condition?.operator} {alert.threshold}
                              </p>
                              
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {alert.schedule}
                                </span>
                                <span>Triggered {alert.triggerCount} times</span>
                                {alert.lastTriggered && (
                                  <span>
                                    Last: {new Date(alert.lastTriggered).toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleMutation.mutate(alert.id)}
                                title={alert.isActive ? "Deactivate" : "Activate"}
                              >
                                {alert.isActive ? (
                                  <BellOff className="h-4 w-4" />
                                ) : (
                                  <Bell className="h-4 w-4" />
                                )}
                              </Button>
                              
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => testAlertMutation.mutate(alert.id)}
                                title="Test alert"
                              >
                                <TestTube className="h-4 w-4" />
                              </Button>
                              
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setEditingAlert(alert)
                                  setIsCreateDialogOpen(true)
                                }}
                                title="Edit alert"
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (confirm("Are you sure you want to delete this alert?")) {
                                    deleteMutation.mutate(alert.id)
                                  }
                                }}
                                title="Delete alert"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Analytics Dashboard */}
        <div className="space-y-4">
          {/* Alert Activity Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Alert Activity (7 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="day" 
                    className="text-xs"
                    tick={{ fill: 'currentColor' }}
                  />
                  <YAxis 
                    className="text-xs"
                    tick={{ fill: 'currentColor' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="count" 
                    stroke="#8884d8" 
                    fill="#8884d8" 
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Priority Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Priority Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={priorityData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {priorityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color.replace('bg-', '#').replace('500', '500')} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-4">
                {priorityData.map((item) => (
                  <div key={item.name} className="flex items-center gap-2 text-xs">
                    <div className={cn("h-2 w-2 rounded-full", item.color)} />
                    <span>{item.name}: {item.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top Alerts */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Most Triggered Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stats?.topAlerts?.length > 0 ? (
                  stats.topAlerts.map((alert: any, idx: number) => (
                    <div key={alert.alertId} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">#{idx + 1}</span>
                        <div>
                          <p className="text-sm font-medium">{alert.name}</p>
                          <p className="text-xs text-muted-foreground">{alert.type}</p>
                        </div>
                      </div>
                      <Badge variant="outline">{alert.count}</Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center">
                    No alerts triggered yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => testAlert("high")}
              >
                <TestTube className="h-4 w-4 mr-2" />
                Test High Priority Alert
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  if (recentAlerts.length > 0) {
                    toast.info(`${recentAlerts.length} recent alerts cleared`)
                    clearRecentAlerts()
                  } else {
                    toast.info("No recent alerts to clear")
                  }
                }}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Clear Alert History
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => queryClient.invalidateQueries()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh All Data
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}