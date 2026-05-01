import { offlineDB, SyncQueueItem } from './offline-db';
import apiClient from './apiClient';
import { API_BASE } from '../config/constants';

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSync: number;
  pendingCount: number;
  failedCount: number;
}

class OfflineSyncManager {
  private syncInterval: NodeJS.Timeout | null = null;
  private listeners: ((status: SyncStatus) => void)[] = [];
  private status: SyncStatus = {
    isOnline: typeof window !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    lastSync: 0,
    pendingCount: 0,
    failedCount: 0,
  };

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
      this.startPeriodicSync();
      offlineDB.resetStuckItems().catch(() => {});
      this.updateCounts();
    }
  }

  private handleOnline = () => {
    this.status.isOnline = true;
    this.notifyListeners();
    this.syncAll();
  };

  private handleOffline = () => {
    this.status.isOnline = false;
    this.notifyListeners();
  };

  private startPeriodicSync() {
    this.syncInterval = setInterval(() => {
      if (this.status.isOnline && !this.status.isSyncing) {
        this.syncAll();
      }
    }, 30_000);
  }

  private async updateCounts() {
    const [pending, failed] = await Promise.all([
      offlineDB.getPendingCount(),
      offlineDB.getFailedCount(),
    ]);
    this.status.pendingCount = pending;
    this.status.failedCount = failed;
    this.notifyListeners();
  }

  async syncAll() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (this.status.isSyncing || !this.status.isOnline || !token) return;

    this.status.isSyncing = true;
    this.notifyListeners();

    try {
      await this.processSyncQueue(token);
      await this.pullFreshData();
      this.status.lastSync = Date.now();
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      this.status.isSyncing = false;
      await this.updateCounts();
    }
  }

  private async processSyncQueue(token: string) {
    const items = await offlineDB.getPendingItems();
    if (items.length === 0) return;

    console.log(`Syncing ${items.length} queued items`);
    for (const item of items) {
      await this.processItem(item, token);
    }
  }

  private async processItem(item: SyncQueueItem, token: string) {
    await offlineDB.markProcessing(item.id);

    const url = item.url.startsWith('http') ? item.url : `${API_BASE}${item.url}`;

    try {
      const response = await fetch(url, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Operation-Id': item.operationId,
          ...item.headers,
        },
        body: item.payload ? JSON.stringify(item.payload) : undefined,
      });

      if (response.ok) {
        await offlineDB.markSynced(item.id);
        console.log(`Synced: ${item.method} ${item.url}`);
      } else {
        await offlineDB.markFailed(item.id, `HTTP ${response.status}`);
      }
    } catch (error: any) {
      await offlineDB.markFailed(item.id, error?.message || 'Network error');
    }
  }

  private async pullFreshData() {
    const [productsResult, customersResult] = await Promise.allSettled([
      apiClient.get('/products', { params: { fetch_all: true } }),
      apiClient.get('/customer'),
    ]);

    if (productsResult.status === 'fulfilled') {
      const raw = productsResult.value?.data?.data;
      if (Array.isArray(raw) && raw.length > 0) {
        await offlineDB.saveProducts(raw);
      }
    }

    if (customersResult.status === 'fulfilled') {
      const raw = customersResult.value?.data?.data;
      if (Array.isArray(raw) && raw.length > 0) {
        await offlineDB.saveCustomers(raw);
        await offlineDB.setCachedData('customers', raw);
      }
    }
  }

  async retryFailed() {
    await offlineDB.retryFailed();
    await this.updateCounts();
    if (this.status.isOnline) this.syncAll();
  }

  subscribe(listener: (status: SyncStatus) => void) {
    this.listeners.push(listener);
    listener({ ...this.status });
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((l) => l({ ...this.status }));
  }

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  canMakeRequest(): boolean {
    return this.status.isOnline;
  }

  async triggerSync() {
    if (this.status.isOnline) await this.syncAll();
  }

  destroy() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
  }
}

export const syncManager = new OfflineSyncManager();
export default syncManager;
