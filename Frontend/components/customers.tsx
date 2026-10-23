"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Users,
  Phone,
  Mail,
  Loader2,
  DollarSign,
  UserCheck,
  FileText,
  LayoutGrid,
  List,
  Filter,
  Wallet,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  ArrowDownAZ,
  ArrowUpZA,
  X,
  ChevronRight,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import {
  fetchCustomersForManagementTab,
  refreshCustomerListGlobally,
  upsertCustomerInStore,
} from "@/lib/customer-list-sync";
import { useStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { PageLoader } from "@/components/ui/page-loader";
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton";
import { cn } from "@/lib/utils";

type CustomerViewMode = "cards" | "table";

const CUSTOMER_VIEW_KEY = "customers-view-mode";

function formatBalance(amount: number | string | undefined) {
  return Number(amount || 0).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

function balanceTone(amount: number | string | undefined) {
  const n = Number(amount || 0);
  if (n > 0.009) return "due" as const;
  if (n < -0.009) return "credit" as const;
  return "settled" as const;
}

type CustomerSort = "balance-desc" | "balance-asc" | "name-asc" | "name-desc";
type BalanceFilter = "all" | "due" | "settled" | "credit";
type StatusFilter = "all" | "active" | "inactive";

interface Customer {
  id: string;
  name: string | null;
  email: string;
  phone_number: string | null;
  address: string | null;
  is_active: boolean;
  outstanding_balance: number | string;
  credit_limit: number | string;
  created_at: string;
}

interface CustomersProps {
  onViewLedger: (customerId: string) => void;
}

export function Customers({ onViewLedger }: CustomersProps) {
  const { toast } = useToast();
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState<Partial<Customer & { billing_address?: string }>>({});
  const [editingCustomer, setEditingCustomer] = useState<(Customer & { billing_address?: string }) | null>(null);
  const [deleteTargetCustomer, setDeleteTargetCustomer] = useState<Customer | null>(null);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);
  const [creditSummary, setCreditSummary] = useState({ totalOutstanding: 0, totalPayable: 0 });
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [viewMode, setViewMode] = useState<CustomerViewMode>("cards");
  const [sortBy, setSortBy] = useState<CustomerSort>("balance-desc");
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    const saved = localStorage.getItem(CUSTOMER_VIEW_KEY);
    if (saved === "cards" || saved === "table") {
      setViewMode(saved);
    }
  }, []);

  const setCustomerViewMode = (mode: CustomerViewMode) => {
    setViewMode(mode);
    localStorage.setItem(CUSTOMER_VIEW_KEY, mode);
  };
  // 1) Fetch customers — shared with New Sale via global store + cache invalidation
  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const data = await fetchCustomersForManagementTab();
      setCustomers(data);
    } catch (err: any) {
      console.log(err);
      toast({ title: "Error", description: "Failed to load customers", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCreditSummary = async () => {
    setIsSummaryLoading(true);
    try {
      const res = await apiClient.get(`${API_BASE}/customer-ledger/summary`);
      setCreditSummary({
        totalOutstanding: res.data.data?.totalOutstanding || 0,
        totalPayable: res.data.data?.totalPayable || 0,
      });
    } catch (err) {
      console.error("Summary fetch error:", err);
    } finally {
      setIsSummaryLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsInitialLoading(true);
      try {
        await Promise.all([fetchCustomers(), fetchCreditSummary()]);
      } finally {
        setIsInitialLoading(false);
      }
    };
    loadData();
  }, []);

  const buildCustomerPayload = (data: Partial<Customer & { billing_address?: string }>, includeBalance = true) => {
    const name = data.name?.trim() || "";
    const phone_number = data.phone_number?.trim() || "";
    return {
      name,
      phone_number,
      ...(data.email?.trim() && { email: data.email.trim().toLowerCase() }),
      ...(data.address?.trim() && { address: data.address.trim() }),
      ...((data as { billing_address?: string }).billing_address?.trim() && {
        billing_address: (data as { billing_address?: string }).billing_address!.trim(),
      }),
      credit_limit: data.credit_limit ? Number(data.credit_limit) : 0,
      ...(includeBalance && {
        outstanding_balance:
          data.outstanding_balance !== undefined &&
          data.outstanding_balance !== null &&
          String(data.outstanding_balance).trim() !== ""
            ? Math.max(0, Number(data.outstanding_balance))
            : 0,
      }),
    };
  };

  const canSubmitCustomer = (data: Partial<Customer & { billing_address?: string }>) =>
    Boolean(data.name?.trim() && data.phone_number?.trim());

  // 2) Create customer
  const handleAddCustomer = async () => {
    if (!canSubmitCustomer(newCustomer)) {
      toast({
        title: "Required fields",
        description: "Name and phone number are required.",
        variant: "destructive",
      });
      return;
    }
    setIsAdding(true);
    try {
      const payload = buildCustomerPayload(newCustomer);
      const res = await apiClient.post<{ data: Customer }>('/customer', payload);
      const data = res.data?.data;
      setNewCustomer({});
      setIsAddDialogOpen(false);
      if (data?.id) upsertCustomerInStore(data);
      await refreshCustomerListGlobally();
      setCustomers(useStore.getState().customers);
      toast({ title: "Success", description: "Customer created successfully." });
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || "Failed to create customer", variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  // Edit customer
  const handleEditCustomer = async () => {
    if (!editingCustomer) return;
    if (!canSubmitCustomer(editingCustomer)) {
      toast({
        title: "Required fields",
        description: "Name and phone number are required.",
        variant: "destructive",
      });
      return;
    }
    setIsEditing(true);
    try {
      const payload = buildCustomerPayload(editingCustomer, false);
      await apiClient.put(`/customer/${editingCustomer.id}`, payload);
      setEditingCustomer(null);
      await refreshCustomerListGlobally();
      setCustomers(useStore.getState().customers);
      toast({ title: "Success", description: "Customer updated successfully." });
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || "Failed to update customer", variant: "destructive" });
    } finally {
      setIsEditing(false);
    }
  };

  // Delete customer
  const handleDeleteCustomer = async () => {
    if (!deleteTargetCustomer) return;
    setIsDeletingCustomer(true);
    try {
      await apiClient.delete(`/customer/${deleteTargetCustomer.id}`);
      await refreshCustomerListGlobally();
      setCustomers(useStore.getState().customers);
      toast({ title: "Success", description: "Customer deleted successfully." });
      setDeleteTargetCustomer(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message || "Failed to delete customer", variant: "destructive" });
    } finally {
      setIsDeletingCustomer(false);
    }
  };

  const activeCount = customers.filter((c) => c.is_active).length;
  const dueCount = customers.filter((c) => Number(c.outstanding_balance || 0) > 0.009).length;
  const settledCount = customers.filter((c) => Math.abs(Number(c.outstanding_balance || 0)) <= 0.009).length;

  const filteredCustomers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = customers.filter((customer) => {
      const bal = Number(customer.outstanding_balance || 0);
      if (balanceFilter === "due" && bal <= 0.009) return false;
      if (balanceFilter === "settled" && Math.abs(bal) > 0.009) return false;
      if (balanceFilter === "credit" && bal >= -0.009) return false;
      if (statusFilter === "active" && !customer.is_active) return false;
      if (statusFilter === "inactive" && customer.is_active) return false;
      if (!q) return true;
      const hay = `${customer.name || ""} ${customer.email || ""} ${customer.phone_number || ""}`.toLowerCase();
      return hay.includes(q);
    });

    list.sort((a, b) => {
      const balA = Number(a.outstanding_balance || 0);
      const balB = Number(b.outstanding_balance || 0);
      const nameA = String(a.name || a.email || "");
      const nameB = String(b.name || b.email || "");
      switch (sortBy) {
        case "balance-asc":
          return balA - balB || nameA.localeCompare(nameB);
        case "name-asc":
          return nameA.localeCompare(nameB);
        case "name-desc":
          return nameB.localeCompare(nameA);
        case "balance-desc":
        default:
          return balB - balA || nameA.localeCompare(nameB);
      }
    });
    return list;
  }, [customers, searchTerm, balanceFilter, statusFilter, sortBy]);

  const hasActiveFilters =
    balanceFilter !== "all" || statusFilter !== "all" || sortBy !== "balance-desc" || Boolean(searchTerm.trim());

  const clearFilters = () => {
    setSearchTerm("");
    setBalanceFilter("all");
    setStatusFilter("all");
    setSortBy("balance-desc");
  };

  if (isInitialLoading) {
    return <PageLoader message="Loading customers data..." />
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-100 via-slate-50 to-white">
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Header & Add Dialog */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 mb-1">
            Accounts receivable
          </p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
            Customer Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Find accounts, open ledgers, and track who owes the most
          </p>
        </div>
        <Dialog
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
        >
          <DialogTrigger asChild>
            <Button className="bg-slate-900 hover:bg-slate-800 text-white shadow-sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Customer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  type="text"
                  value={newCustomer.name || ""}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      name: e.target.value,
                    })
                  }
                  placeholder="Enter customer name"
                />
              </div>
              <div>
                <Label htmlFor="phone_number">Phone Number *</Label>
                <Input
                  id="phone_number"
                  type="tel"
                  value={newCustomer.phone_number || ""}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      phone_number: e.target.value,
                    })
                  }
                  placeholder="Enter phone number"
                />
              </div>
              <div>
                <Label htmlFor="email">
                  Email <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={newCustomer.email || ""}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      email: e.target.value,
                    })
                  }
                  placeholder="customer@example.com"
                />
              </div>
              <div>
                <Label htmlFor="address">
                  Address <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input
                  id="address"
                  type="text"
                  value={newCustomer.address || ""}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      address: e.target.value,
                    })
                  }
                  placeholder="Enter address"
                />
              </div>
              <div>
                <Label htmlFor="billing_address">
                  Billing Address <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input
                  id="billing_address"
                  type="text"
                  value={newCustomer.billing_address || ""}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      billing_address: e.target.value,
                    })
                  }
                  placeholder="Enter billing address"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="credit_limit">
                    Credit limit (Rs){" "}
                    <span className="text-gray-400 font-normal">(empty = unlimited)</span>
                  </Label>
                  <Input
                    id="credit_limit"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newCustomer.credit_limit || ""}
                    onChange={(e) =>
                      setNewCustomer({
                        ...newCustomer,
                        credit_limit: e.target.value,
                      })
                    }
                    placeholder="Leave empty for unlimited"
                  />
                </div>
                <div>
                  <Label htmlFor="previous_balance">
                    Previous credit balance (Rs){" "}
                    <span className="text-gray-400 font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="previous_balance"
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      newCustomer.outstanding_balance !== undefined &&
                      newCustomer.outstanding_balance !== null
                        ? String(newCustomer.outstanding_balance)
                        : ""
                    }
                    onChange={(e) =>
                      setNewCustomer({
                        ...newCustomer,
                        outstanding_balance: e.target.value,
                      })
                    }
                    placeholder="Amount owed before POS"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use for existing customers who already owed you money before using this software.
                  </p>
                </div>
              </div>
              <Button
                onClick={handleAddCustomer}
                className="w-full"
                disabled={isAdding || !canSubmitCustomer(newCustomer)}
              >
                {isAdding ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Creating Customer...
                  </>
                ) : (
                  "Create Customer"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Card className="border-0 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white shadow-lg shadow-slate-900/10 overflow-hidden rounded-2xl relative">
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-400/10 blur-2xl" />
              <CardContent className="p-5 relative">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Total amount due</p>
                    <p className="text-[26px] font-bold tabular-nums mt-1.5 tracking-tight">
                      Rs {creditSummary.totalOutstanding.toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">All unpaid balances combined</p>
                  </div>
                  <div className="shrink-0 rounded-xl bg-amber-400/15 p-2.5 ring-1 ring-amber-400/20">
                    <Wallet className="h-4.5 w-4.5 text-amber-300" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 bg-white shadow-sm ring-1 ring-slate-200/70 rounded-2xl">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-600/80">Customers with due</p>
                    <p className="text-[26px] font-bold text-slate-900 tabular-nums mt-1.5 tracking-tight">{dueCount}</p>
                    <p className="text-xs text-slate-400 mt-1">Owing money on account</p>
                  </div>
                  <div className="shrink-0 rounded-xl bg-rose-50 p-2.5 ring-1 ring-rose-100">
                    <AlertCircle className="h-4.5 w-4.5 text-rose-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 bg-white shadow-sm ring-1 ring-slate-200/70 rounded-2xl">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600/80">Settled accounts</p>
                    <p className="text-[26px] font-bold text-slate-900 tabular-nums mt-1.5 tracking-tight">{settledCount}</p>
                    <p className="text-xs text-slate-400 mt-1">Zero outstanding</p>
                  </div>
                  <div className="shrink-0 rounded-xl bg-emerald-50 p-2.5 ring-1 ring-emerald-100">
                    <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 bg-white shadow-sm ring-1 ring-slate-200/70 rounded-2xl">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-600/80">Total customers</p>
                    <p className="text-[26px] font-bold text-slate-900 tabular-nums mt-1.5 tracking-tight">{customers.length}</p>
                    <p className="text-xs text-slate-400 mt-1">{activeCount} active profiles</p>
                  </div>
                  <div className="shrink-0 rounded-xl bg-sky-50 p-2.5 ring-1 ring-sky-100">
                    <Users className="h-4.5 w-4.5 text-sky-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm ring-1 ring-slate-200/70 rounded-2xl overflow-hidden">
        <CardHeader className="pb-3 bg-slate-50/60 border-b border-slate-100">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <div className="rounded-lg bg-emerald-100 p-1.5">
                <Filter className="h-3.5 w-3.5 text-emerald-700" />
              </div>
              Search & filters
            </CardTitle>
            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2.5 text-xs text-slate-500 hover:text-slate-900 gap-1"
                onClick={clearFilters}
              >
                <X className="h-3.5 w-3.5" />
                Clear all
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
            <Input
              placeholder="Search by name, phone, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-11 bg-slate-50/70 border-slate-200 rounded-xl focus-visible:bg-white"
            />
          </div>

          <div className="flex flex-col lg:flex-row lg:items-end gap-5">
            <div className="space-y-2 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Balance</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["all", "All", null],
                    ["due", "Has unpaid", AlertCircle],
                    ["settled", "Settled", CheckCircle2],
                    ["credit", "Has credit", TrendingUp],
                  ] as const
                ).map(([value, label, Icon]) => {
                  const active = balanceFilter === value;
                  const tone =
                    value === "due"
                      ? "amber"
                      : value === "settled"
                        ? "emerald"
                        : value === "credit"
                          ? "sky"
                          : "slate";
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setBalanceFilter(value)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold border transition-all",
                        active
                          ? tone === "amber"
                            ? "bg-amber-500 text-white border-amber-500 shadow-sm shadow-amber-500/30"
                            : tone === "emerald"
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/30"
                              : tone === "sky"
                                ? "bg-sky-600 text-white border-sky-600 shadow-sm shadow-sky-600/30"
                                : "bg-slate-900 text-white border-slate-900 shadow-sm"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                      )}
                    >
                      {Icon && <Icon className="h-3.5 w-3.5" />}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["all", "All"],
                    ["active", "Active"],
                    ["inactive", "Inactive"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatusFilter(value)}
                    className={cn(
                      "rounded-full px-3.5 py-2 text-xs font-semibold border transition-all",
                      statusFilter === value
                        ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 lg:w-56">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Sort by</p>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as CustomerSort)}>
                <SelectTrigger className="h-[38px] rounded-xl bg-white border-slate-200 text-xs font-semibold text-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="balance-desc">
                    <span className="inline-flex items-center gap-2">
                      <ArrowDownNarrowWide className="h-3.5 w-3.5 text-slate-400" /> Highest unpaid first
                    </span>
                  </SelectItem>
                  <SelectItem value="balance-asc">
                    <span className="inline-flex items-center gap-2">
                      <ArrowUpNarrowWide className="h-3.5 w-3.5 text-slate-400" /> Lowest unpaid first
                    </span>
                  </SelectItem>
                  <SelectItem value="name-asc">
                    <span className="inline-flex items-center gap-2">
                      <ArrowDownAZ className="h-3.5 w-3.5 text-slate-400" /> Name A–Z
                    </span>
                  </SelectItem>
                  <SelectItem value="name-desc">
                    <span className="inline-flex items-center gap-2">
                      <ArrowUpZA className="h-3.5 w-3.5 text-slate-400" /> Name Z–A
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customer list */}
      <Card className="border-0 shadow-sm ring-1 ring-slate-200/70 rounded-2xl overflow-hidden">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 bg-slate-50/60 pb-4">
          <div>
            <CardTitle className="text-base text-slate-900">
              Customers
              <span className="ml-2 text-sm font-medium text-slate-500">
                ({filteredCustomers.length})
              </span>
            </CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Sorted by {sortBy === "balance-desc" ? "highest unpaid first" : sortBy === "balance-asc" ? "lowest unpaid first" : sortBy === "name-asc" ? "name A–Z" : "name Z–A"}
            </p>
          </div>
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 self-start sm:self-auto shadow-sm">
            <Button
              type="button"
              size="sm"
              variant={viewMode === "cards" ? "default" : "ghost"}
              className={cn("h-8 gap-1.5 px-3 rounded-lg", viewMode === "cards" && "bg-slate-900 hover:bg-slate-800")}
              onClick={() => setCustomerViewMode("cards")}
            >
              <LayoutGrid className="h-4 w-4" />
              Cards
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "table" ? "default" : "ghost"}
              className={cn("h-8 gap-1.5 px-3 rounded-lg", viewMode === "table" && "bg-slate-900 hover:bg-slate-800")}
              onClick={() => setCustomerViewMode("table")}
            >
              <List className="h-4 w-4" />
              Table
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          {isLoading ? (
            <PageLoader message="Loading customers..." />
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-14">
              <Users className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 font-medium">No customers match these filters</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          ) : viewMode === "cards" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredCustomers.map((customer) => {
                const tone = balanceTone(customer.outstanding_balance);
                const bal = Number(customer.outstanding_balance || 0);
                const initial = (customer.name || customer.email || "?").trim().charAt(0).toUpperCase();
                const avatarTone =
                  tone === "due"
                    ? "from-amber-500 to-amber-600"
                    : tone === "credit"
                      ? "from-sky-500 to-sky-600"
                      : "from-slate-400 to-slate-500";
                return (
                <div
                  key={customer.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onViewLedger(customer.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onViewLedger(customer.id);
                    }
                  }}
                  className={cn(
                    "group relative flex flex-col rounded-2xl bg-white p-4",
                    "cursor-pointer transition-all duration-200",
                    "ring-1 ring-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.05)]",
                    "hover:-translate-y-0.5 hover:ring-emerald-300/80 hover:shadow-lg hover:shadow-slate-900/5",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
                  )}
                >
                  {tone !== "settled" && (
                    <span
                      className={cn(
                        "absolute right-3 top-3 h-2 w-2 rounded-full",
                        tone === "due" ? "bg-amber-500" : "bg-sky-500",
                      )}
                    />
                  )}

                  <div className="flex items-start gap-3 mb-3.5">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white shadow-sm",
                        avatarTone,
                      )}
                    >
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="font-semibold text-slate-900 truncate text-[15px] leading-snug">
                        {customer.name || customer.email || "Unnamed"}
                      </p>
                      {customer.phone_number && (
                        <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                          <Phone className="h-3 w-3 shrink-0 text-slate-400" />
                          {customer.phone_number}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 mb-3.5">
                    <Badge
                      variant="status"
                      className={cn(
                        "shrink-0 text-[10px] font-semibold rounded-full px-2 py-0.5",
                        customer.is_active
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                          : "bg-slate-100 text-slate-500 border border-slate-200",
                      )}
                    >
                      {customer.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {customer.email && (
                      <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-slate-400 truncate">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{customer.email}</span>
                      </span>
                    )}
                  </div>

                  <div
                    className={cn(
                      "rounded-xl px-3.5 py-3 mb-3.5 grid grid-cols-2 gap-3",
                      tone === "due" && "bg-amber-50/70",
                      tone === "credit" && "bg-sky-50/70",
                      tone === "settled" && "bg-slate-50",
                    )}
                  >
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {tone === "credit" ? "Credit" : "Unpaid"}
                      </p>
                      <p
                        className={cn(
                          "font-bold tabular-nums text-[17px] mt-0.5 tracking-tight",
                          tone === "due" && "text-amber-700",
                          tone === "credit" && "text-sky-700",
                          tone === "settled" && "text-slate-400",
                        )}
                      >
                        {tone === "settled"
                          ? "Rs 0"
                          : `Rs ${formatBalance(Math.abs(bal))}`}
                      </p>
                    </div>
                    <div className="border-l border-slate-200/70 pl-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Limit</p>
                      <p className="font-semibold text-slate-600 tabular-nums text-sm mt-0.5">
                        {Number(customer.credit_limit || 0) > 0
                          ? `Rs ${formatBalance(customer.credit_limit)}`
                          : "Unlimited"}
                      </p>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-2 mt-auto pt-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      size="sm"
                      className="flex-1 h-8 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs gap-1.5 rounded-lg"
                      onClick={() => onViewLedger(customer.id)}
                    >
                      <FileText className="h-3.5 w-3.5" /> Ledger
                      <ChevronRight className="h-3 w-3 ml-auto opacity-60 group-hover:translate-x-0.5 transition-transform" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0 border-slate-200 rounded-lg"
                      onClick={() => setEditingCustomer(customer)}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0 border-slate-200 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                      onClick={() => setDeleteTargetCustomer(customer)}
                      disabled={isDeletingCustomer}
                    >
                      {isDeletingCustomer && deleteTargetCustomer?.id === customer.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 md:mx-0">
              <div className="inline-block min-w-full align-middle">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="min-w-[220px]">Customer</TableHead>
                      <TableHead className="min-w-[120px]">Unpaid</TableHead>
                      <TableHead className="min-w-[120px]">Limit</TableHead>
                      <TableHead className="min-w-[100px]">Status</TableHead>
                      <TableHead className="min-w-[140px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => {
                  const tone = balanceTone(customer.outstanding_balance);
                  const bal = Number(customer.outstanding_balance || 0);
                  return (
                  <TableRow
                    key={customer.id}
                    className="cursor-pointer hover:bg-emerald-50/40"
                    onClick={() => onViewLedger(customer.id)}
                  >
                    <TableCell>
                      <div className="space-y-0.5">
                        <p className="font-semibold text-slate-900">
                          {customer.name || customer.email || "Unnamed"}
                        </p>
                        {customer.phone_number && (
                          <div className="flex items-center text-xs text-slate-500">
                            <Phone className="h-3 w-3 mr-1" />
                            {customer.phone_number}
                          </div>
                        )}
                        {customer.email && (
                          <div className="flex items-center text-xs text-slate-400">
                            <Mail className="h-3 w-3 mr-1" />
                            {customer.email}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "font-bold tabular-nums",
                          tone === "due" && "text-amber-700",
                          tone === "credit" && "text-emerald-700",
                          tone === "settled" && "text-slate-500",
                        )}
                      >
                        {tone === "settled"
                          ? "Rs 0"
                          : tone === "credit"
                            ? `Credit Rs ${formatBalance(Math.abs(bal))}`
                            : `Rs ${formatBalance(bal)}`}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-600 font-medium whitespace-nowrap">
                      {Number(customer.credit_limit || 0) > 0
                        ? `Rs ${formatBalance(customer.credit_limit)}`
                        : "Unlimited"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="status"
                        className={
                          customer.is_active
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                        }
                      >
                        {customer.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          className="h-8 px-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs gap-1.5"
                          onClick={() => onViewLedger(customer.id)}
                        >
                          <FileText className="h-3 w-3" /> Ledger
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setEditingCustomer(customer)
                          }
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDeleteTargetCustomer(customer)}
                          disabled={isDeletingCustomer}
                          className="text-rose-600 hover:text-rose-700"
                        >
                          {isDeletingCustomer && deleteTargetCustomer?.id === customer.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog
        open={!!editingCustomer}
        onOpenChange={() => setEditingCustomer(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          {editingCustomer && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Name *</Label>
                <Input
                  id="edit-name"
                  type="text"
                  value={editingCustomer.name || ""}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      name: e.target.value,
                    })
                  }
                  placeholder="Enter customer name"
                />
              </div>
              <div>
                <Label htmlFor="edit-phone">Phone Number *</Label>
                <Input
                  id="edit-phone"
                  type="tel"
                  value={editingCustomer.phone_number || ""}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      phone_number: e.target.value,
                    })
                  }
                  placeholder="Enter phone number"
                />
              </div>
              <div>
                <Label htmlFor="edit-email">
                  Email <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editingCustomer.email || ""}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      email: e.target.value,
                    })
                  }
                  placeholder="customer@example.com"
                />
              </div>
              <div>
                <Label htmlFor="edit-address">
                  Address <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input
                  id="edit-address"
                  type="text"
                  value={editingCustomer.address || ""}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      address: e.target.value,
                    })
                  }
                  placeholder="Enter address"
                />
              </div>
              <div>
                <Label htmlFor="edit-billing-address">
                  Billing Address <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input
                  id="edit-billing-address"
                  type="text"
                  value={editingCustomer.billing_address || ""}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      billing_address: e.target.value,
                    })
                  }
                  placeholder="Enter billing address"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-credit-limit">
                    Credit limit (Rs){" "}
                    <span className="text-gray-400 font-normal">(empty = unlimited)</span>
                  </Label>
                  <Input
                    id="edit-credit-limit"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingCustomer.credit_limit || ""}
                    onChange={(e) =>
                      setEditingCustomer({
                        ...editingCustomer,
                        credit_limit: e.target.value,
                      })
                    }
                    placeholder="Leave empty for unlimited"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-outstanding-balance">
                    Credit balance{" "}
                    <span className="text-gray-400 font-normal">(amount owed)</span>
                  </Label>
                  <Input
                    id="edit-outstanding-balance"
                    type="text"
                    readOnly
                    value={Number(editingCustomer.outstanding_balance || 0).toLocaleString()}
                    className="bg-slate-50"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Balance is managed through Customer Ledger. Use Receive Payment or opening balance entries there.
                  </p>
                </div>
              </div>
              <Button
                onClick={handleEditCustomer}
                className="w-full"
                disabled={isEditing || !canSubmitCustomer(editingCustomer)}
              >
                {isEditing ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Updating Customer...
                  </>
                ) : (
                  "Update Customer"
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTargetCustomer}
        onOpenChange={(open) => {
          if (!open && !isDeletingCustomer) {
            setDeleteTargetCustomer(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-semibold">
                {deleteTargetCustomer?.name || deleteTargetCustomer?.email || "this customer"}
              </span>
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingCustomer}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteCustomer();
              }}
              disabled={isDeletingCustomer}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeletingCustomer ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </div>
  );
}
