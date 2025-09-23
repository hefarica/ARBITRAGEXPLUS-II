"use client"
import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiGet, apiPut } from "@/lib/api"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, CheckCircle2, Save } from "lucide-react"
import dynamic from "next/dynamic"

// Importar el editor de JSON dinámicamente (sin SSR)
const MonacoEditor = dynamic(
  () => import("@monaco-editor/react"),
  { ssr: false }
)

// Tipo para la configuración del engine
interface EngineConfig {
  version: string;
  min_ev_net_usd: number;
  min_roi_bps: number;
  max_slippage_bps: number;
  min_prob_exec_priv: number;
  mev_haircut_factor: number;
  max_gas_cost_usd: number;
  enabled_chains: number[];
  preferred_relays: string[];
  asset_safety: {
    min_safety_score: number;
    min_age_days: number;
    min_liquidity_usd: number;
    deny_fee_on_transfer: boolean;
    require_oracle_price: boolean;
  };
  execution: {
    max_position_usd: number;
    max_drawdown_usd: number;
    max_gas_price_gwei: {
      [chainId: string]: number;
    };
    max_daily_executions: number;
    bundle_privacy_level: string;
  };
  kill_switch: boolean;
}

// Configuración por defecto
const DEFAULT_CONFIG: EngineConfig = {
  version: "3.6.0",
  min_ev_net_usd: 20.0,
  min_roi_bps: 10,
  max_slippage_bps: 50,
  min_prob_exec_priv: 0.7,
  mev_haircut_factor: 0.1,
  max_gas_cost_usd: 50.0,
  enabled_chains: [1, 42161, 10, 8453],
  preferred_relays: ["flashbots_protect", "mev_share", "eden"],
  asset_safety: {
    min_safety_score: 70,
    min_age_days: 30,
    min_liquidity_usd: 1000000,
    deny_fee_on_transfer: true,
    require_oracle_price: true
  },
  execution: {
    max_position_usd: 50000,
    max_drawdown_usd: 5000,
    max_gas_price_gwei: {
      "1": 100,
      "42161": 1.0,
      "10": 0.5,
      "8453": 0.3
    },
    max_daily_executions: 50,
    bundle_privacy_level: "high"
  },
  kill_switch: false
}

// Componente principal
export default function ConfigPage() {
  const queryClient = useQueryClient()
  const [configText, setConfigText] = useState("")
  const [configError, setConfigError] = useState<string | null>(null)

  // Consulta para obtener la configuración actual
  const { data: currentConfig, isLoading, error } = useQuery({
    queryKey: ["engineConfig"],
    queryFn: () => apiGet<EngineConfig>("/api/config")
  })

  // Efecto para actualizar el editor cuando se carga la configuración
  useEffect(() => {
    if (currentConfig) {
      setConfigText(JSON.stringify(currentConfig, null, 2))
    }
  }, [currentConfig])

  // Mutación para guardar la configuración
  const saveConfigMutation = useMutation({
    mutationFn: (newConfig: EngineConfig) => apiPut<{ ok: boolean }>("/api/config", newConfig),
    onSuccess: () => {
      toast({
        title: "Configuración guardada",
        description: "Los cambios han sido aplicados correctamente",
        duration: 3000,
      })
      queryClient.invalidateQueries({ queryKey: ["engineConfig"] })
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Error al guardar",
        description: err.message || "Ocurrió un error al guardar la configuración",
        duration: 5000,
      })
    }
  })

  // Cargar una configuración preestablecida
  const loadPreset = async (presetName: string) => {
    try {
      const response = await fetch(`/presets/${presetName}.json`)
      const preset = await response.json()
      setConfigText(JSON.stringify(preset, null, 2))
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error al cargar preset",
        description: err.message || "No se pudo cargar la configuración preestablecida",
        duration: 3000,
      })
    }
  }

  // Guardar la configuración
  const handleSave = () => {
    try {
      const newConfig = JSON.parse(configText)
      saveConfigMutation.mutate(newConfig)
      setConfigError(null)
    } catch (err: any) {
      setConfigError(`Error de formato JSON: ${err.message}`)
    }
  }

  // Reiniciar a la configuración predeterminada
  const resetToDefault = () => {
    setConfigText(JSON.stringify(DEFAULT_CONFIG, null, 2))
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Configuración del Engine</h1>
        <Skeleton className="h-[600px] w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Configuración del Engine</h1>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            No se pudo cargar la configuración. Por favor, intente nuevamente más tarde.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Configuración del Engine</h1>
        <div className="space-x-2">
          <Button 
            variant="outline" 
            onClick={resetToDefault}
          >
            Reiniciar
          </Button>
          <Button 
            onClick={handleSave}
            disabled={saveConfigMutation.isPending}
          >
            {saveConfigMutation.isPending ? (
              <>Guardando...</>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Guardar Cambios
              </>
            )}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="editor" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="editor">Editor JSON</TabsTrigger>
          <TabsTrigger value="presets">Presets</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>
        
        <TabsContent value="editor" className="space-y-4">
          {configError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{configError}</AlertDescription>
            </Alert>
          )}
          
          <Card className="p-0 overflow-hidden border">
            <div className="h-[600px] w-full">
              <MonacoEditor
                height="600px"
                language="json"
                theme="vs-dark"
                value={configText}
                onChange={(value) => setConfigText(value || "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  formatOnPaste: true,
                }}
              />
            </div>
          </Card>
        </TabsContent>
        
        <TabsContent value="presets" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="p-4 cursor-pointer hover:bg-accent transition-colors" 
              onClick={() => loadPreset("L2-Bluechips")}>
              <h3 className="text-lg font-medium">L2 Bluechips</h3>
              <p className="text-sm text-muted-foreground">
                Configuración optimizada para tokens verificados en L2s (Arbitrum, Optimism, Base)
              </p>
            </Card>
            
            <Card className="p-4 cursor-pointer hover:bg-accent transition-colors"
              onClick={() => loadPreset("Stables-Only")}>
              <h3 className="text-lg font-medium">Solo Stablecoins</h3>
              <p className="text-sm text-muted-foreground">
                Restricción a USDC, USDT, DAI y otras stablecoins verificadas
              </p>
            </Card>
            
            <Card className="p-4 cursor-pointer hover:bg-accent transition-colors"
              onClick={() => loadPreset("Aggressive-Flash")}>
              <h3 className="text-lg font-medium">Flash Loans Agresivos</h3>
              <p className="text-sm text-muted-foreground">
                Máximo tamaño de posición y tolerancia de slippage para oportunidades grandes
              </p>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="history" className="space-y-4">
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Información</AlertTitle>
            <AlertDescription>
              El historial de cambios de configuración estará disponible próximamente.
            </AlertDescription>
          </Alert>
        </TabsContent>
      </Tabs>
    </div>
  )
}
