"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

export function ThemeToggleSwitch() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex items-center space-x-2">
        <Switch disabled />
        <Label className="cursor-not-allowed opacity-50">
          <Sun className="h-4 w-4" />
        </Label>
      </div>
    )
  }

  const isDark = theme === "dark"

  return (
    <div className="flex items-center space-x-2">
      <Switch
        id="theme-mode"
        checked={isDark}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted transition-all duration-300"
      >
        <span className="sr-only">Toggle theme</span>
      </Switch>
      <Label
        htmlFor="theme-mode"
        className="cursor-pointer flex items-center"
      >
        {isDark ? (
          <Moon className="h-4 w-4 transition-all duration-300" />
        ) : (
          <Sun className="h-4 w-4 transition-all duration-300" />
        )}
      </Label>
    </div>
  )
}