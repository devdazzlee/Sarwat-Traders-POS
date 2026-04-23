"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Loader2, Edit, Eye, ToggleRight, ToggleLeft } from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { LoadingButton } from "@/components/ui/loading-button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { PageLoader } from "@/components/ui/page-loader";


interface Supplier {
  id: string;
  code: string;
  name: string;
  phone_number?: string;
  fax_number?: string;
  mobile_number?: string;
  country?: string;
  city?: string;
  email?: string;
  ntn?: string;
  strn?: string;
  gov_id?: string;
  address?: string;
  display_on_pos: boolean;
  status: string;
  product_count: number;
  created_at: string;
}

const Suppliers: React.FC = () => {
  const { toast } = useToast();
  const [list, setList] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [current, setCurrent] = useState<Supplier | null>(null);

  const [form, setForm] = useState({
    name: "",
    phone_number: "",
    fax_number: "",
    mobile_number: "",
    country: "",
    city: "",
    email: "",
    ntn: "",
    strn: "",
    gov_id: "",
    address: "",
    display_on_pos: true,
  });

  const [error, setError] = useState<string>("");

  // Button enabled only if all fields are filled (non-empty, trimmed)
  const isFormValid = Object.values(form).every(
    v => typeof v === 'boolean' ? true : (v && String(v).trim() !== "")
  );

  useEffect(() => {
    fetchList();
  }, []);

  const fetchList = async (q: string = search) => {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.get(`${API_BASE}/suppliers`, { params: { search: q } });
      setList(res.data.data);
    } catch (e: any) {
      setError("Failed to load suppliers");
      toast({
        title: "Error",
        description: e?.response?.data?.message || e?.message || "Failed to load suppliers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setIsInitialLoading(false);
    }
  };

  const handleSearchChange = (v: string) => {
    setSearch(v);
    fetchList(v);
  };

  const openAdd = () => {
    setForm({ name: "", phone_number: "", fax_number: "", mobile_number: "", country: "", city: "", email: "", ntn: "", strn: "", gov_id: "", address: "", display_on_pos: true });
    setCurrent(null);
    setAddOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setCurrent(s);
    setForm({
      name: s.name,
      phone_number: s.phone_number || "",
      fax_number: s.fax_number || "",
      mobile_number: s.mobile_number || "",
      country: s.country || "",
      city: s.city || "",
      email: s.email || "",
      ntn: s.ntn || "",
      strn: s.strn || "",
      gov_id: s.gov_id || "",
      address: s.address || "",
      display_on_pos: s.display_on_pos,
    });
    setEditOpen(true);
  };

  const openDetail = (s: Supplier) => {
    setCurrent(s);
    setDetailOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const payload = { ...form };
      if (current) {
        await apiClient.put(`${API_BASE}/suppliers/${current.id}`, payload);
        setEditOpen(false);
        toast({
          title: "Success",
          description: "Supplier updated successfully",
        });
      } else {
        await apiClient.post(`${API_BASE}/suppliers`, payload);
        setAddOpen(false);
        toast({
          title: "Success",
          description: "Supplier created successfully",
        });
      }
      fetchList();
    } catch (e: any) {
      setError("Submission failed");
      toast({
        title: "Error",
        description: e?.response?.data?.message || e?.message || "Submission failed",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (id: string) => {
    try {
      await apiClient.patch(`${API_BASE}/suppliers/${id}/toggle-status`);
      fetchList();
    } catch (e) {
      console.log(e);
    }
  };

  const filtered = list.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code.includes(search)
  );

  if (isInitialLoading) {
    return <PageLoader message="Loading suppliers..." />
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Suppliers</h1>
          <p className="text-sm md:text-base text-gray-600">Create & manage suppliers</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-2" />
          New Supplier
        </Button>
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search by name or code"
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>
      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">
          {error}
        </div>
      )}
      <Card>
        <CardHeader><CardTitle>Supplier List</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <PageLoader message="Loading suppliers..." />
          ) : filtered.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-600">No suppliers found</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 md:mx-0">
              <div className="inline-block min-w-full align-middle">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[100px]">Code</TableHead>
                      <TableHead className="min-w-[150px]">Name</TableHead>
                      <TableHead className="min-w-[120px]">Contact</TableHead>
                      <TableHead className="min-w-[150px]">Email</TableHead>
                      <TableHead className="min-w-[80px]">POS</TableHead>
                      <TableHead className="min-w-[100px]">Status</TableHead>
                      <TableHead className="min-w-[200px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
              <TableBody>
                {filtered.map(s => (
                  <TableRow key={s.id} className="hover:bg-gray-50">
                    <TableCell>{s.code}</TableCell>
                    <TableCell>{s.name}</TableCell>
                    <TableCell>{s.mobile_number || s.phone_number || '—'}</TableCell>
                    <TableCell>{s.email || '—'}</TableCell>
                    <TableCell>{s.display_on_pos ? 'Yes' : 'No'}</TableCell>
                    <TableCell>
                      {s.status === 'active' ? <ToggleRight className="text-green-500" /> : <ToggleLeft className="text-red-500" />}
                    </TableCell>
                    <TableCell className="flex space-x-2">
                      <Button size="sm" variant="outline" onClick={() => openDetail(s)}><Eye className="h-4 w-4"/></Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(s)}><Edit className="h-4 w-4"/></Button>
                      <Button size="sm" variant="outline" onClick={() => toggleStatus(s.id)}>
                        {s.status === 'active' ? 'Disable' : 'Enable'}
                      </Button>
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
      {/* Add/Edit Dialog */}
      <Dialog open={addOpen || editOpen} onOpenChange={() => { setAddOpen(false); setEditOpen(false); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{current ? 'Edit Supplier' : 'Create Supplier'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: 'Name', key: 'name', required: true },
              { label: 'Phone', key: 'phone_number' },
              { label: 'Fax', key: 'fax_number' },
              { label: 'Mobile', key: 'mobile_number' },
              { label: 'Email', key: 'email' },
              { label: 'Country', key: 'country' },
              { label: 'City', key: 'city' },
              { label: 'NTN', key: 'ntn' },
              { label: 'STRN', key: 'strn' },
              { label: 'Gov ID', key: 'gov_id' },
            ].map(({ label, key, required }) => (
              <div key={key}>
                <Label htmlFor={key}>{label}{required && <span className="text-red-500 ml-1">*</span>}</Label>
                <Input
                  id={key}
                  value={(form as any)[key] || ''}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={`Enter ${label.toLowerCase()}`}
                  className={required && !(form as any)[key]?.trim() ? "border-red-500" : ""}
                  disabled={submitting}
                />
                {required && !(form as any)[key]?.trim() && (
                  <p className="text-xs text-red-600 mt-1">{label} is required</p>
                )}
              </div>
            ))}
            <div className="flex items-center space-x-2">
              <input
                id="pos"
                type="checkbox"
                checked={form.display_on_pos}
                onChange={e => setForm(f => ({ ...f, display_on_pos: e.target.checked }))}
                disabled={submitting}
              />
              <Label htmlFor="pos">Display on POS</Label>
            </div>
            <div className="col-span-full">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Enter address"
                disabled={submitting}
              />
            </div>
            <div className="col-span-full">
              <LoadingButton 
                onClick={submit} 
                loading={submitting} 
                className="w-full"
                disabled={submitting || !isFormValid}
              >
                {current ? 'Update' : 'Create'}
              </LoadingButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={() => setDetailOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Supplier Details</DialogTitle></DialogHeader>
          {current && (
            <div className="space-y-2">
              <p><strong>Code:</strong> {current.code}</p>
              <p><strong>Name:</strong> {current.name}</p>
              <p><strong>Phone:</strong> {current.phone_number || '—'}</p>
              <p><strong>Mobile:</strong> {current.mobile_number || '—'}</p>
              <p><strong>Email:</strong> {current.email || '—'}</p>
              <p><strong>Address:</strong> {current.address || '—'}</p>
              <p><strong>POS:</strong> {current.display_on_pos ? 'Yes' : 'No'}</p>
              <p><strong>Status:</strong> {current.status}</p>
              <p><strong>Products:</strong> {current.product_count}</p>
              <p><strong>Created:</strong> {current.created_at.split('T')[0]}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Suppliers;
