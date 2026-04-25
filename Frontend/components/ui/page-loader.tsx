import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface PageLoaderProps {
  message?: string
  className?: string
}

/**
 * A standard, simple loading component for use across the POS.
 * Simplified based on user feedback to be clean and non-distracting.
 */
export function PageLoader({ 
  message = "Loading...", 
  className 
}: PageLoaderProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center min-h-[400px] w-full py-12",
      className
    )}>
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
        <span className="text-sm font-medium text-gray-500">{message}</span>
      </div>
    </div>
  )
}
