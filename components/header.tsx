"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { ThemeToggleSwitch } from "@/components/ui/theme-toggle-switch"
import { Badge } from "@/components/ui/badge"
import { Bell, AlertTriangle } from "lucide-react"
import { checkBackendHealth, getApiVersion } from "@/lib/api"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useQuery } from "@tanstack/react-query"

export function Header() {
  const [isOnline, setIsOnline] = useState(true)
  
  // Verificar la salud del backend
  const { data: isBackendHealthy } = useQuery({
    queryKey: ["backendHealth"],
    queryFn: checkBackendHealth,
    refetchInterval: 30000, // Verificar cada 30 segundos
  })
  
  // Obtener la versión de la API
  const { data: apiVersion } = useQuery({
    queryKey: ["apiVersion"],
    queryFn: getApiVersion,
    staleTime: Infinity, // La versión no cambia durante la sesión
  })
  
  // Actualizar el estado de conexión cuando cambie el estado de salud del backend
  useEffect(() => {
    setIsOnline(isBackendHealthy !== false)
  }, [isBackendHealthy])
  
  // Verificar la conexión a internet
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])
  
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <div className="md:flex-1 md:justify-start">
          {/* Indicador de conexión */}
          {!isOnline && (
            <Badge variant="destructive" className="mr-2">
              <AlertTriangle className="mr-1 h-3 w-3" />
              Sin conexión
            </Badge>
          )}
          <Badge variant="outline">
            v{apiVersion || "3.6.0"}
          </Badge>
        </div>
        
        <div className="flex items-center justify-between space-x-2 md:justify-end md:flex-1">
          {/* Menú de notificaciones */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                <span className="absolute top-1 right-1 flex h-2 w-2 rounded-full bg-red-600"></span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Notificaciones</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <span className="text-amber-500 mr-2">●</span>
                Balance bajo en Arbitrum - 0.05 ETH
              </DropdownMenuItem>
              <DropdownMenuItem>
                <span className="text-green-500 mr-2">●</span>
                3 ejecuciones exitosas en las últimas 24h
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="justify-center">
                Ver todas
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Selector de tema - Toggle Switch mejorado */}
          <div className="flex items-center gap-2">
            <ThemeToggleSwitch />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  )
}
