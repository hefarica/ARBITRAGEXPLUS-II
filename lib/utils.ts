import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combina clases de Tailwind de manera eficiente usando clsx y tailwind-merge
 * Esto permite el manejo de clases condicionales sin conflictos
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formatea un valor numérico como moneda USD
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

/**
 * Acorta una dirección Ethereum para mostrar
 */
export function shortenAddress(address: string, chars: number = 4): string {
  if (!address) return ''
  return `${address.substring(0, chars + 2)}...${address.substring(address.length - chars)}`
}

/**
 * Obtiene el nombre de la cadena a partir del ID
 */
export const getChainName = (chainId: number): string => {
  const chains: Record<number, string> = {
    1: 'Ethereum',
    10: 'Optimism',
    137: 'Polygon',
    42161: 'Arbitrum',
    8453: 'Base',
    43114: 'Avalanche'
  }
  
  return chains[chainId] || `Chain #${chainId}`
}

/**
 * Obtiene la URL del explorador de bloques a partir del ID de cadena
 */
export const getExplorerUrl = (chainId: number, txHash?: string, address?: string): string => {
  let baseUrl: string
  
  switch(chainId) {
    case 1:
      baseUrl = 'https://etherscan.io'
      break
    case 10:
      baseUrl = 'https://optimistic.etherscan.io'
      break
    case 137:
      baseUrl = 'https://polygonscan.com'
      break
    case 42161:
      baseUrl = 'https://arbiscan.io'
      break
    case 8453:
      baseUrl = 'https://basescan.org'
      break
    case 43114:
      baseUrl = 'https://snowtrace.io'
      break
    default:
      baseUrl = 'https://etherscan.io'
  }
  
  if (txHash) {
    return `${baseUrl}/tx/${txHash}`
  }
  
  if (address) {
    return `${baseUrl}/address/${address}`
  }
  
  return baseUrl
}

/**
 * Convierte wei a ETH
 */
export function weiToEth(wei: string | number): number {
  if (typeof wei === 'string') {
    // Maneja strings muy grandes
    return Number(BigInt(wei) / BigInt(10**18))
  }
  return wei / 10**18
}

/**
 * Colorea el texto según el valor (positivo o negativo)
 */
export function colorizeValue(value: number): string {
  return value >= 0 ? 'text-green-500' : 'text-red-500'
}

/**
 * Formatea una fecha para mostrar hace cuánto tiempo ocurrió
 */
export function timeAgo(date: Date | string): string {
  const now = new Date()
  const past = typeof date === 'string' ? new Date(date) : date
  const seconds = Math.floor((now.getTime() - past.getTime()) / 1000)
  
  if (isNaN(seconds)) {
    return 'fecha inválida'
  }
  
  const intervals = {
    año: 31536000,
    mes: 2592000,
    semana: 604800,
    día: 86400,
    hora: 3600,
    minuto: 60,
    segundo: 1
  }
  
  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit)
    if (interval >= 1) {
      return interval === 1 ? `hace 1 ${unit}` : `hace ${interval} ${unit}s`
    }
  }
  
  return 'justo ahora'
}
