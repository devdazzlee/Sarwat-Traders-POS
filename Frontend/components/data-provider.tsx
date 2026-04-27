"use client"

import { useEffect } from 'react'
import { useStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { initializeOfflineMode } from '@/lib/offline-init'

interface DataProviderProps {
  children: React.ReactNode
}

export function DataProvider({ children }: DataProviderProps) {
  const { fetchProducts, fetchCategories, fetchCustomers } = useStore()
  const { toast } = useToast()

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return

    // Evict any stale server data that was previously persisted to localStorage.
    // Products/categories/customers are now session-only (never written to localStorage).
    localStorage.removeItem('pos-store')

    const initializeData = async () => {
      try {
        // Initialize offline mode first
        await initializeOfflineMode()

        // Always fetch fresh on page load — force:true bypasses in-memory TTL
        await Promise.all([
          fetchProducts({ force: true }),
          fetchCategories(true),
          fetchCustomers(true),
        ])
        console.log('✅ All data initialized successfully')
      } catch (error) {
        console.log('❌ Failed to initialize data:', error)
        // Don't show toast for offline mode - it's expected
        if (navigator.onLine) {
          toast({
            variant: "destructive",
            title: "Data Loading Error",
            description: "Some data failed to load. Please refresh the page.",
          })
        }
      }
    }

    initializeData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>{children}</>
} 