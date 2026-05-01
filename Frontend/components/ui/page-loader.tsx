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
      <div className="flex flex-col items-center gap-6">
        <div className="h-12 w-12 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin" />
        <span className="text-sm font-black text-indigo-500 uppercase tracking-widest animate-pulse">
          {message}
        </span>
      </div>
    </div>
  )
}
