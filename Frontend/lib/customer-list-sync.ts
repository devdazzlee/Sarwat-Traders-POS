/**
 * Keeps customer lists in sync across tabs (Customers, New Sale, Sales, etc.).
 * Without this, each screen uses its own cache and new customers only appear after refresh.
 */

import apiClient from './apiClient';
import { useStore, type Customer } from './store';

/** Merge one customer into the global POS store (instant UI update). */
export function upsertCustomerInStore(customer: Customer): void {
  if (!customer?.id) return;
  const state = useStore.getState();
  const idx = state.customers.findIndex((c) => c.id === customer.id);
  const customers =
    idx >= 0
      ? state.customers.map((c, i) => (i === idx ? { ...c, ...customer } : c))
      : [...state.customers, customer];
  useStore.setState({ customers, lastCustomersFetch: Date.now() });
}

/**
 * After create/update/delete: reload the shared store with the latest list.
 */
export async function refreshCustomerListGlobally(): Promise<Customer[]> {
  await useStore.getState().fetchCustomers(true);
  return useStore.getState().customers;
}

/** Fetch latest list from API and mirror into the shared store. */
export async function fetchCustomersForManagementTab(): Promise<Customer[]> {
  const res = await apiClient.get('/customer');
  const list: Customer[] = res.data?.data ?? [];
  useStore.setState({
    customers: list,
    lastCustomersFetch: Date.now(),
    customersLoading: false,
  });
  return list;
}
