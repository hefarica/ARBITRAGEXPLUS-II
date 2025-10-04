"use client"

import { useState } from "react"
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
  Network
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface SidebarLinkProps {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
  isCollapsed: boolean
}

function SidebarLink({ href, icon, children, isCollapsed }: SidebarLinkProps) {
  const pathname = usePathname()
  const isActive = pathname === href
  
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-accent",
        isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground",
        isCollapsed && "justify-center"
      )}
    >
      {icon}
      {!isCollapsed && <span>{children}</span>}
    </Link>
  )
}

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  
  return (
    <div
      className={cn(
        "flex flex-col border-r bg-background h-full transition-all duration-300",
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
