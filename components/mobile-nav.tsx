"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Settings,
  BarChart3,
  Wallet,
  Bell,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useState, useEffect } from "react"

interface NavItem {
  href: string
  icon: React.ReactNode
  label: string
  badge?: React.ReactNode
}

export function MobileNav() {
  const pathname = usePathname()
  const [alertCount, setAlertCount] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Fetch unread alerts count
  useEffect(() => {
    const fetchAlertCount = async () => {
      try {
        const res = await fetch('/api/alerts/history?limit=10')
        const history = await res.json()
        const unread = history.filter((item: any) => !item.acknowledged).length
        setAlertCount(unread)
      } catch (error) {
        console.error('Failed to fetch alert count:', error)
      }
    }

    fetchAlertCount()
    const interval = setInterval(fetchAlertCount, 30000)
    return () => clearInterval(interval)
  }, [])

  const navItems: NavItem[] = [
    {
      href: "/",
      icon: <LayoutDashboard className="h-5 w-5" />,
      label: "Dashboard"
    },
    {
      href: "/analytics",
      icon: <BarChart3 className="h-5 w-5" />,
      label: "Analytics"
    },
    {
      href: "/alerts",
      icon: <Bell className="h-5 w-5" />,
      label: "Alerts",
      badge: alertCount > 0 ? (
        <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 min-w-4 p-0 text-[10px] animate-pulse">
          {alertCount > 9 ? "9+" : alertCount}
        </Badge>
      ) : null
    },
    {
      href: "/wallets",
      icon: <Wallet className="h-5 w-5" />,
      label: "Wallets"
    },
    {
      href: "/config",
      icon: <Settings className="h-5 w-5" />,
      label: "Config"
    }
  ]

  if (!mounted) {
    return null
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-md border-t">
      <nav className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-col items-center justify-center flex-1 py-2 touch-target",
                "transition-colors duration-200",
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                {item.icon}
                {item.badge}
              </div>
              <span className="text-[10px] mt-1">{item.label}</span>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-primary rounded-full" />
              )}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}