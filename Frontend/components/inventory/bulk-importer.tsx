"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, X, CheckCircle2, AlertCircle, FileSpreadsheet, Loader2, Edit3, Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import apiClient from "@/lib/apiClient";
import { toast } from "sonner";
import { usePosData } from "@/hooks/use-pos-data";
import * as XLSX from "xlsx";

interface BulkImporterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BulkImporter({ open, onOpenChange }: BulkImporterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [stagingData, setStagingData] = useState<any[] | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { fetchProducts } = usePosData();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = async (selectedFile: File) => {
    setIsParsing(true);
    setFile(selectedFile);
    
    try {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet);
      
      // Clean and normalize the data
      const normalized = json.map((row: any) => ({
        name: row.name || row.Name || "",
        sku: row.sku || row.SKU || "",
        purchase_rate: row.purchase_rate || row["Purchase Rate"] || 0,
        sales_rate_inc_dis_and_tax: row.sales_rate_inc_dis_and_tax || row["Selling Price"] || row["selling_price"] || 0,
        category_name: row.category_name || row.category || row.Category || "",
        unit_name: row.unit_name || row.unit || row.Unit || "",
      }));

      setStagingData(normalized);
      setResults(null);
    } catch (error) {
      console.error("Parsing error:", error);
      toast.error("Failed to parse file. Please ensure it's a valid CSV/Excel.");
      setFile(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      const validTypes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
        "application/vnd.ms-excel", // xls
        "text/csv", // csv
      ];
      if (validTypes.includes(droppedFile.type) || droppedFile.name.match(/\.(xlsx|xls|csv)$/i)) {
        processFile(droppedFile);
      } else {
        toast.error("Invalid file type. Please upload a CSV or Excel file.");
      }
    }
  };

  const updateStagingRow = (index: number, field: string, value: any) => {
    if (!stagingData) return;
    const newData = [...stagingData];
    newData[index] = { ...newData[index], [field]: value };
    setStagingData(newData);
  };

  const handleCommit = async () => {
    if (!stagingData) return;

    setIsUploading(true);
    try {
      const response = await apiClient.post("/products/bulk-upload", {
        products: stagingData
      });

      const data = response.data.data || response.data;
      setResults(data);
      
      const successCount = data.filter((item: any) => item.success).length;
      if (successCount > 0) {
        toast.success(`Successfully committed ${successCount} products.`);
        fetchProducts({ force: true });
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "Failed to commit changes.");
    } finally {
      setIsUploading(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setResults(null);
    setStagingData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDialogClose = (newOpen: boolean) => {
    if (!newOpen) {
      resetState();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-5xl overflow-hidden flex flex-col max-h-[95vh] h-[800px]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight">Bulk Inventory Staging</DialogTitle>
              <DialogDescription className="font-medium">
                {!stagingData ? "Upload your wholesale arrival sheets" : "Verify and edit quantities/rates before committing to stock"}
              </DialogDescription>
            </div>
            {stagingData && !results && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 px-3 py-1 font-bold">
                {stagingData.length} Rows Prepared
              </Badge>
            )}
          </div>
        </DialogHeader>

        {isParsing ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
            <p className="font-bold text-slate-600 animate-pulse uppercase tracking-widest text-xs">Parsing Arrival Sheet...</p>
          </div>
        ) : !stagingData ? (
          <div className="flex-1 flex flex-col items-center justify-center">
             <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className={`w-full max-w-2xl p-20 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all duration-300
                ${file ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'}`}
            >
              <input
                type="file"
                className="hidden"
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                ref={fileInputRef}
                onChange={handleFileChange}
              />
              
              <div className="bg-slate-900 border-4 border-slate-800 p-6 rounded-full mb-6 shadow-2xl">
                <FileSpreadsheet className="h-12 w-12 text-emerald-400" />
              </div>
              
              <div className="text-center space-y-4">
                <h3 className="font-black text-2xl text-slate-900 tracking-tight">Wholesale Data Drop</h3>
                <p className="text-slate-500 max-w-sm mx-auto font-medium">Drag and drop your Excel or CSV files directly into the system for staging</p>
                <div className="flex gap-2 justify-center pt-4">
                   <Button variant="outline" size="lg" className="rounded-xl border-slate-200 font-bold" onClick={() => fileInputRef.current?.click()}>
                      Browse Computer
                   </Button>
                </div>
              </div>
            </div>
          </div>
        ) : !results ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 border-2 border-slate-100 rounded-3xl overflow-hidden bg-white shadow-inner mt-4">
               <ScrollArea className="h-full">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-slate-900 sticky top-0 z-10">
                      <tr>
                        <th className="px-5 py-4 text-left font-black text-xs uppercase tracking-widest text-slate-400 border-b border-slate-800">S.No</th>
                        <th className="px-5 py-4 text-left font-black text-xs uppercase tracking-widest text-slate-400 border-b border-slate-800">Product Name</th>
                        <th className="px-5 py-4 text-left font-black text-xs uppercase tracking-widest text-slate-400 border-b border-slate-800 w-32">Unit Cost (Rs)</th>
                        <th className="px-5 py-4 text-left font-black text-xs uppercase tracking-widest text-slate-400 border-b border-slate-800 w-32">Sale Rate (Rs)</th>
                        <th className="px-5 py-4 text-left font-black text-xs uppercase tracking-widest text-slate-400 border-b border-slate-800">Category</th>
                        <th className="px-5 py-4 text-center font-black text-xs uppercase tracking-widest text-slate-400 border-b border-slate-800">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stagingData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors group">
                           <td className="px-5 py-4 font-black text-slate-400 text-xs">{idx + 1}</td>
                           <td className="px-5 py-4">
                              <Input 
                                value={row.name} 
                                onChange={(e) => updateStagingRow(idx, "name", e.target.value)}
                                className="h-9 border-transparent hover:border-slate-200 focus:bg-slate-50 transition-all font-bold"
                              />
                           </td>
                           <td className="px-5 py-4">
                              <Input 
                                type="number"
                                value={row.purchase_rate} 
                                onChange={(e) => updateStagingRow(idx, "purchase_rate", e.target.value)}
                                className="h-9 border-transparent hover:border-slate-200 focus:bg-slate-50 transition-all font-black text-blue-600"
                              />
                           </td>
                           <td className="px-5 py-4">
                              <Input 
                                type="number"
                                value={row.sales_rate_inc_dis_and_tax} 
                                onChange={(e) => updateStagingRow(idx, "sales_rate_inc_dis_and_tax", e.target.value)}
                                className="h-9 border-transparent hover:border-slate-200 focus:bg-slate-50 transition-all font-black text-emerald-600"
                              />
                           </td>
                           <td className="px-5 py-4">
                              <Input 
                                value={row.category_name} 
                                onChange={(e) => updateStagingRow(idx, "category_name", e.target.value)}
                                className="h-9 border-transparent hover:border-slate-200 focus:bg-slate-50 transition-all"
                              />
                           </td>
                           <td className="px-5 py-4 text-center">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all p-0"
                                onClick={() => {
                                   const newData = [...stagingData];
                                   newData.splice(idx, 1);
                                   setStagingData(newData);
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                           </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
               </ScrollArea>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden mt-6">
             <div className="grid grid-cols-3 gap-6 mb-8">
                <Card className="bg-emerald-50 border-emerald-100 shadow-sm">
                   <CardHeader className="p-4 pb-2">
                      <p className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Successful Imports</p>
                   </CardHeader>
                   <CardContent className="px-4 pb-4">
                      <p className="text-3xl font-black text-emerald-700">{results.filter(r => r.success).length}</p>
                   </CardContent>
                </Card>
                <Card className="bg-red-50 border-red-100 shadow-sm">
                   <CardHeader className="p-4 pb-2">
                      <p className="text-[10px] font-black uppercase text-red-600 tracking-widest">Data Failures</p>
                   </CardHeader>
                   <CardContent className="px-4 pb-4">
                      <p className="text-3xl font-black text-red-700">{results.filter(r => !r.success).length}</p>
                   </CardContent>
                </Card>
                <Card className="bg-slate-50 border-slate-200 shadow-sm">
                   <CardHeader className="p-4 pb-2">
                      <p className="text-[10px] font-black uppercase text-slate-600 tracking-widest">Total Rows</p>
                   </CardHeader>
                   <CardContent className="px-4 pb-4">
                      <p className="text-3xl font-black text-slate-700">{results.length}</p>
                   </CardContent>
                </Card>
             </div>

             <ScrollArea className="flex-1 border-tl-2 border-tr-2 border-slate-100 rounded-2xl overflow-y-auto">
               <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-6 py-4 text-left font-black uppercase text-[10px] tracking-widest text-slate-600">Row Result</th>
                      <th className="px-6 py-4 text-left font-black uppercase text-[10px] tracking-widest text-slate-600">Product Identifier</th>
                      <th className="px-6 py-4 text-left font-black uppercase text-[10px] tracking-widest text-slate-600">System Feedback</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                     {results.map((r, i) => (
                       <tr key={i} className={`hover:bg-slate-50 transition-all ${!r.success ? "bg-red-50/30" : ""}`}>
                          <td className="px-6 py-4">
                             {r.success ? (
                               <Badge className="bg-emerald-500 text-white border-0 font-bold px-3 py-1">PASSED</Badge>
                             ) : (
                               <Badge variant="destructive" className="font-bold px-3 py-1">FAILED</Badge>
                             )}
                          </td>
                          <td className="px-6 py-4 font-black text-slate-900">{r.success ? r.name : (r.data?.name || "MISSING DATA")}</td>
                          <td className={`px-6 py-4 font-bold ${!r.success ? "text-red-500 italic" : "text-slate-500"}`}>{r.error || "RECORDED IN DATABASE"}</td>
                       </tr>
                     ))}
                  </tbody>
               </table>
             </ScrollArea>
          </div>
        )}

        <DialogFooter className="pt-6 border-t mt-auto">
            {!stagingData ? (
              <Button variant="ghost" className="font-bold text-slate-500" onClick={() => handleDialogClose(false)}>Close Utility</Button>
            ) : !results ? (
              <div className="flex w-full justify-between items-center">
                 <Button variant="ghost" className="text-red-500 font-black hover:bg-red-50" onClick={resetState}>Dispose Changes</Button>
                 <div className="flex gap-2">
                    <Button variant="outline" className="font-bold border-slate-200" onClick={() => fileInputRef.current?.click()}>Reload File</Button>
                    <Button 
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-10 rounded-xl shadow-lg border-b-4 border-emerald-800"
                      onClick={handleCommit}
                      disabled={isUploading}
                    >
                      {isUploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Committing Items...</> : <><Check className="h-4 w-4 mr-2" /> Commit to Stock</>}
                    </Button>
                 </div>
              </div>
            ) : (
              <Button 
                className="bg-slate-900 hover:bg-slate-800 text-white font-black px-12 rounded-xl"
                onClick={() => handleDialogClose(false)}
              >
                Exit Staging Area
              </Button>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
