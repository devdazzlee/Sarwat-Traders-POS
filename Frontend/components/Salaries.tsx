'use client';

import React, { useEffect, useState } from "react";
import apiClient from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Edit, Trash2, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/page-loader";
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton";
import { Badge } from "@/components/ui/badge";
import { DollarSign, CheckCircle2, XCircle, Users } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Employee {
    id: string;
    name: string;
}

interface Salary {
    id: string;
    employee_id: string;
    employee: Employee;
    month: number;
    year: number;
    amount: number;
    is_paid?: boolean;
    paid_date?: string;
    notes?: string;
}

const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

export function Salaries() {
    const [salaries, setSalaries] = useState<Salary[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [form, setForm] = useState<Partial<Salary>>({});
    const [editId, setEditId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    
    // Calculate years inside component to avoid hydration issues
    const [currentYear] = useState(() => new Date().getFullYear());
    const years = Array.from({ length: (currentYear + 2) - 2020 + 1 }, (_, i) => 2020 + i);

    // Fetch employees for dropdown
    useEffect(() => {
        apiClient.get("/employee")
            .then(res => setEmployees(res.data.data))
            .catch(() => setEmployees([]));
    }, []);

    // Fetch salaries
    const fetchSalaries = async () => {
        setIsLoading(true);
        try {
            const res = await apiClient.get("/salaries");
            setSalaries(res.data.data || []);
        } catch (e) {
            setSalaries([]);
        } finally {
            setIsLoading(false);
            setIsInitialLoading(false);
        }
    };
    useEffect(() => { fetchSalaries(); }, []);

    // Add salary
    const handleAddSalary = async () => {
        setIsSubmitting(true);
        setError(null);
        if (!form.year || form.year < 2020) {
            setError("Year must be 2020 or later");
            setIsSubmitting(false);
            return;
        }
        try {
            await apiClient.post("/salaries", {
                employee_id: form.employee_id,
                month: Number(form.month),
                year: Number(form.year),
                amount: Number(form.amount),
                is_paid: form.is_paid || false,
                paid_date: form.paid_date || undefined,
                notes: form.notes || undefined,
            });
            setIsDialogOpen(false);
            setForm({});
            fetchSalaries();
        } catch (e: any) {
            setError(e?.response?.data?.message || "Failed to add salary");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Edit salary
    const handleEditSalary = async () => {
        if (!editId) return;
        setIsSubmitting(true);
        setError(null);
        if (!form.year || form.year < 2020) {
            setError("Year must be 2020 or later");
            setIsSubmitting(false);
            return;
        }
        try {
            await apiClient.put(`/salaries/${editId}`, {
                employee_id: form.employee_id,
                month: Number(form.month),
                year: Number(form.year),
                amount: Number(form.amount),
                is_paid: form.is_paid || false,
                paid_date: form.paid_date || undefined,
                notes: form.notes || undefined,
            });
            setIsEditDialogOpen(false);
            setForm({});
            setEditId(null);
            fetchSalaries();
        } catch (e: any) {
            setError(e?.response?.data?.message || "Failed to update salary");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Delete salary
    const handleDeleteSalary = async () => {
        if (!deleteId) return;
        setIsLoading(true);
        try {
            await apiClient.delete(`/salaries/${deleteId}`);
            fetchSalaries();
        } catch (e) {
            // Optionally show error
        } finally {
            setIsLoading(false);
            setDeleteId(null);
        }
    };

    // Open edit dialog
    const openEditDialog = (salary: Salary) => {
        setEditId(salary.id);
        setForm({
            employee_id: salary.employee_id,
            month: salary.month,
            year: salary.year,
            amount: salary.amount,
            is_paid: salary.is_paid,
            paid_date: salary.paid_date ? salary.paid_date.slice(0, 10) : undefined,
            notes: salary.notes,
        });
        setIsEditDialogOpen(true);
    };

    // Stats calculations
    const totalSalaries = salaries.length;
    const totalPaid = salaries
        .filter(s => s.is_paid === true)
        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const totalUnpaid = salaries
        .filter(s => !s.is_paid)
        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

    if (isInitialLoading) {
        return <PageLoader message="Loading salaries data..." />
    }

    return (
        <div className="p-4 md:p-6 space-y-4 md:space-y-6">
            {/* Header & Add Dialog */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Salary Management</h1>
                    <p className="text-sm md:text-base text-gray-600">Manage employee salary records</p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="h-4 w-4 mr-2" /> Add Salary
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add Salary</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div>
                                <label>Employee</label>
                                <Select
                                    value={form.employee_id || ""}
                                    onValueChange={val => setForm(f => ({ ...f, employee_id: val }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select employee" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {employees.map(emp => (
                                            <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label>Month</label>
                                <Select
                                    value={form.month ? String(form.month) : ""}
                                    onValueChange={val => setForm(f => ({ ...f, month: Number(val) }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select month" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {months.map((m, idx) => (
                                            <SelectItem key={m} value={String(idx + 1)}>{m}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label>Year</label>
                                <Select
                                    value={form.year ? String(form.year) : ""}
                                    onValueChange={val => setForm(f => ({ ...f, year: Number(val) }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select year" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {years.map((y) => (
                                            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label>Amount</label>
                                <Input
                                    type="number"
                                    value={form.amount || ""}
                                    onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))}
                                    placeholder="Amount"
                                />
                            </div>
                            <div>
                                <label>Paid</label>
                                <input
                                    type="checkbox"
                                    checked={!!form.is_paid}
                                    onChange={e => setForm(f => ({ ...f, is_paid: e.target.checked }))}
                                />
                            </div>
                            <div>
                                <label className="block mb-1 font-medium">Paid Date</label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant={form.paid_date ? "default" : "outline"}
                                            className="w-full justify-start text-left font-normal"
                                        >
                                            {form.paid_date ? format(new Date(form.paid_date), "yyyy-MM-dd") : "Pick a date"}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                            mode="single"
                                            selected={form.paid_date ? new Date(form.paid_date) : undefined}
                                            onSelect={date => setForm(f => ({ ...f, paid_date: date ? new Date(date.setHours(0,0,0,0)).toISOString() : undefined }))}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div>
                                <label>Notes</label>
                                <Input
                                    type="text"
                                    value={form.notes || ""}
                                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                    placeholder="Notes"
                                />
                            </div>
                            {error && <div className="text-red-600 text-sm">{error}</div>}
                            <Button onClick={handleAddSalary} disabled={isSubmitting || !form.employee_id || !form.month || !form.year || !form.amount}>
                                {isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
                                Add Salary
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                {isLoading ? (
                    <>
                        <StatCardSkeleton />
                        <StatCardSkeleton />
                        <StatCardSkeleton />
                    </>
                ) : (
                    <>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Salaries</CardTitle>
                                <Users className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{totalSalaries}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600">Rs {totalPaid.toLocaleString()}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Unpaid</CardTitle>
                                <XCircle className="h-4 w-4 text-red-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-600">Rs {totalUnpaid.toLocaleString()}</div>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>

            {/* Table with Loader */}
            <Card>
                <CardHeader>
                    <CardTitle>Salaries ({salaries.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <PageLoader message="Loading salaries..." />
                    ) : salaries.length === 0 ? (
                        <div className="text-center py-10">
                            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-600">No salaries found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto -mx-4 md:mx-0">
                            <div className="inline-block min-w-full align-middle">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="min-w-[150px]">Employee</TableHead>
                                            <TableHead className="min-w-[100px]">Month</TableHead>
                                            <TableHead className="min-w-[80px]">Year</TableHead>
                                            <TableHead className="min-w-[100px]">Amount</TableHead>
                                            <TableHead className="min-w-[100px]">Status</TableHead>
                                            <TableHead className="min-w-[120px]">Paid Date</TableHead>
                                            <TableHead className="min-w-[150px]">Notes</TableHead>
                                            <TableHead className="min-w-[120px]">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                            <TableBody>
                                {salaries.map(sal => (
                                    <TableRow key={sal.id}>
                                        <TableCell>{sal.employee?.name || "-"}</TableCell>
                                        <TableCell>{months[(sal.month || 1) - 1]}</TableCell>
                                        <TableCell>{sal.year}</TableCell>
                                        <TableCell>Rs {sal.amount}</TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={sal.is_paid ? "default" : "secondary"}
                                                className={sal.is_paid ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                                            >
                                                {sal.is_paid ? "Paid" : "Unpaid"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{sal.paid_date ? sal.paid_date.split("T")[0] : "-"}</TableCell>
                                        <TableCell>{sal.notes || "-"}</TableCell>
                                        <TableCell>
                                            <div className="flex space-x-2">
                                                <Button size="sm" variant="outline" onClick={() => openEditDialog(sal)}>
                                                    <Edit className="h-3 w-3" />
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => setDeleteId(sal.id)}>
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Are you sure you want to delete this salary record?</AlertDialogTitle>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel onClick={() => setDeleteId(null)}>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={handleDeleteSalary}>Yes, Delete</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Edit Salary Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Salary</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <label>Employee</label>
                            <Select
                                value={form.employee_id || ""}
                                onValueChange={val => setForm(f => ({ ...f, employee_id: val }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select employee" />
                                </SelectTrigger>
                                <SelectContent>
                                    {employees.map(emp => (
                                        <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label>Month</label>
                            <Select
                                value={form.month ? String(form.month) : ""}
                                onValueChange={val => setForm(f => ({ ...f, month: Number(val) }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select month" />
                                </SelectTrigger>
                                <SelectContent>
                                    {months.map((m, idx) => (
                                        <SelectItem key={m} value={String(idx + 1)}>{m}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label>Year</label>
                            <Select
                                value={form.year ? String(form.year) : ""}
                                onValueChange={val => setForm(f => ({ ...f, year: Number(val) }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select year" />
                                </SelectTrigger>
                                <SelectContent>
                                    {years.map((y) => (
                                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label>Amount</label>
                            <Input
                                type="number"
                                value={form.amount || ""}
                                onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))}
                                placeholder="Amount"
                            />
                        </div>
                        <div>
                            <label>Paid</label>
                            <input
                                type="checkbox"
                                checked={!!form.is_paid}
                                onChange={e => setForm(f => ({ ...f, is_paid: e.target.checked }))}
                            />
                        </div>
                        <div>
                            <label className="block mb-1 font-medium">Paid Date</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={form.paid_date ? "default" : "outline"}
                                        className="w-full justify-start text-left font-normal"
                                    >
                                        {form.paid_date ? format(new Date(form.paid_date), "yyyy-MM-dd") : "Pick a date"}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={form.paid_date ? new Date(form.paid_date) : undefined}
                                        onSelect={date => setForm(f => ({ ...f, paid_date: date ? new Date(date.setHours(0,0,0,0)).toISOString() : undefined }))}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div>
                            <label>Notes</label>
                            <Input
                                type="text"
                                value={form.notes || ""}
                                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                placeholder="Notes"
                            />
                        </div>
                        {error && <div className="text-red-600 text-sm">{error}</div>}
                        <Button onClick={handleEditSalary} disabled={isSubmitting || !form.employee_id || !form.month || !form.year || !form.amount}>
                            {isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
                            Update Salary
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}