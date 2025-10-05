"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Settings,
  Shield,
  ChevronRight,
  GanttChart,
  History,
  Wallet,
  Menu,
  X,
  Network,
  Brain,
  Bell,
  BarChart3
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface SidebarLinkProps {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
  isCollapsed: boolean
  badge?: React.ReactNode
}

function SidebarLink({ href, icon, children, isCollapsed, badge }: SidebarLinkProps) {
  const pathname = usePathname()
  const isActive = pathname === href
  
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-accent relative",
        isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground",
        isCollapsed && "justify-center"
      )}
    >
      <div className="relative">
        {icon}
        {badge && isCollapsed && (
          <div className="absolute -top-1 -right-1">
            {badge}
          </div>
        )}
      </div>
      {!isCollapsed && (
        <div className="flex items-center justify-between flex-1">
          <span>{children}</span>
          {badge}
        </div>
      )}
    </Link>
  )
}

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [alertCount, setAlertCount] = useState(0)

  // Fetch unread alerts count
  useEffect(() => {
    const fetchAlertCount = async () => {
      try {
        const res = await fetch('/api/alerts/history?limit=10')
        
        if (!res.ok) {
          // If the response is not ok, just set count to 0
          setAlertCount(0)
          return
        }
        
        const history = await res.json()
        
        // Ensure history is an array before filtering
        if (Array.isArray(history)) {
          const unread = history.filter((item: any) => !item.acknowledged).length
          setAlertCount(unread)
        } else {
          setAlertCount(0)
        }
      } catch (error) {
        // Silently handle errors and just set count to 0
        setAlertCount(0)
      }
    }

    fetchAlertCount()
    const interval = setInterval(fetchAlertCount, 30000) // Update every 30 seconds
    return () => clearInterval(interval)
  }, [])
  
  return (
    <div
      className={cn(
        "hidden md:flex flex-col border-r bg-background h-full transition-all duration-300",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-14 items-center border-b px-3 justify-between">
        {!isCollapsed && (
          <div className="text-lg font-semibold tracking-tight">
            ArbitrageX Supreme
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn("ml-auto", isCollapsed && "mx-auto")}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </div>
      
      <div className="flex-1 overflow-y-auto py-6">
        <nav className="grid gap-1 px-2">
          <SidebarLink
            href="/"
            icon={<LayoutDashboard className="h-5 w-5" />}
            isCollapsed={isCollapsed}
          >
            Dashboard
          </SidebarLink>
          
          <SidebarLink
            href="/analytics"
            icon={<BarChart3 className="h-5 w-5" />}
            isCollapsed={isCollapsed}
          >
            Analytics
          </SidebarLink>
          
          <SidebarLink
            href="/alerts"
            icon={<Bell className="h-5 w-5" />}
            isCollapsed={isCollapsed}
            badge={alertCount > 0 ? (
              <Badge variant="destructive" className="h-5 min-w-5 px-1 animate-pulse">
                {alertCount > 9 ? "9+" : alertCount}
              </Badge>
            ) : null}
          >
            Alerts
          </SidebarLink>
          
          <SidebarLink
            href="/assets"
            icon={<Shield className="h-5 w-5" />}
            isCollapsed={isCollapsed}
          >
            Asset Safety
          </SidebarLink>
          
          <SidebarLink
            href="/executions"
            icon={<History className="h-5 w-5" />}
            isCollapsed={isCollapsed}
          >
            Ejecuciones
          </SidebarLink>
          
          <SidebarLink
            href="/wallets"
            icon={<Wallet className="h-5 w-5" />}
            isCollapsed={isCollapsed}
          >
            Wallets
          </SidebarLink>
          
          <SidebarLink
            href="/metrics"
            icon={<GanttChart className="h-5 w-5" />}
            isCollapsed={isCollapsed}
          >
            Métricas
          </SidebarLink>
          
          <SidebarLink
            href="/rpc-monitor"
            icon={<Network className="h-5 w-5" />}
            isCollapsed={isCollapsed}
          >
            RPC Monitor
          </SidebarLink>
          
          <SidebarLink
            href="/admin/chains"
            icon={<Network className="h-5 w-5" />}
            isCollapsed={isCollapsed}
          >
            Admin Blockchains
          </SidebarLink>
          
          <SidebarLink
            href="/admin/assets"
            icon={<Shield className="h-5 w-5" />}
            isCollapsed={isCollapsed}
          >
            Admin Assets
          </SidebarLink>
          
          <SidebarLink
            href="/simulator"
            icon={<Brain className="h-5 w-5" />}
            isCollapsed={isCollapsed}
          >
            Simulador
          </SidebarLink>
          
          <SidebarLink
            href="/config"
            icon={<Settings className="h-5 w-5" />}
            isCollapsed={isCollapsed}
          >
            Configuración
          </SidebarLink>
        </nav>
      </div>
      
      {!isCollapsed && (
        <div className="mt-auto border-t p-4">
          <div className="flex flex-col space-y-1">
            <p className="text-xs font-medium">ARBITRAGEX SUPREME</p>
            <p className="text-xs text-muted-foreground">v3.6.0</p>
          </div>
        </div>
      )}
    </div>
  )
}
