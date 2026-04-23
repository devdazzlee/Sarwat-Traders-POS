"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Search, Plus, Edit, Trash2, Loader2, Users } from "lucide-react"
import apiClient from "@/lib/apiClient"
import { PageLoader } from "@/components/ui/page-loader"
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface Employee {
  id: string
  name: string
  email?: string
  phone_number?: string
  cnic?: string
  gender?: string
  join_date: string
  employee_type_id: string
}

interface NewEmployeeForm {
  name: string
  email: string
  phone_number: string
  cnic: string
  gender: string
  join_date: string
  employee_type_id: string
}

interface EmployeeType {
  id: string
  name: string
}

export function EmployeeManagement() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeeTypes, setEmployeeTypes] = useState<EmployeeType[]>([])
  const [typesLoading, setTypesLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<(Employee & { join_date: Date | null }) | null>(null)
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null)
  const [newEmployee, setNewEmployee] = useState<NewEmployeeForm & { join_date: Date | null }>({
    name: "",
    email: "",
    phone_number: "",
    cnic: "",
    gender: "",
    join_date: null,
    employee_type_id: "",
  })
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [isInitialLoading, setIsInitialLoading] = useState(true)

  // Fetch employees from API
  const getEmployees = async () => {
    setLoading(true)
    try {
      const res = await apiClient.get("/employee")
      // Convert join_date to Date object for all employees
      setEmployees(res.data.data.map((emp: Employee) => ({ ...emp, join_date: emp.join_date ? new Date(emp.join_date) : null })))
    } catch (error) {
      console.log("Get employees error", error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch employee types
  const getEmployeeTypes = async () => {
    setTypesLoading(true)
    try {
      const res = await apiClient.get("/employee/types")
      setEmployeeTypes(res.data.data)
    } catch (error) {
      setEmployeeTypes([])
    } finally {
      setTypesLoading(false)
    }
  }

  useEffect(() => {
    setIsInitialLoading(true)
    getEmployees().finally(() => setIsInitialLoading(false))
    getEmployeeTypes()
  }, [])

  // Add employee
  const handleAddEmployee = async () => {
    if (newEmployee.name && newEmployee.join_date && newEmployee.employee_type_id) {
      setActionLoading(true)
      try {
        const payload: any = {
          name: newEmployee.name,
          join_date: newEmployee.join_date.toISOString(),
          employee_type_id: newEmployee.employee_type_id,
        }
        if (newEmployee.email) payload.email = newEmployee.email
        if (newEmployee.phone_number) payload.phone_number = newEmployee.phone_number
        if (newEmployee.cnic) payload.cnic = newEmployee.cnic
        if (newEmployee.gender) payload.gender = newEmployee.gender
        await apiClient.post("/employee", payload)
        setIsAddDialogOpen(false)
        setNewEmployee({ name: "", email: "", phone_number: "", cnic: "", gender: "", join_date: null, employee_type_id: "" })
        getEmployees()
      } catch (error) {
        console.log("Add employee error", error)
      } finally {
        setActionLoading(false)
      }
    }
  }

  // Edit employee
  const openEditDialog = (employee: Employee) => {
    setEditingEmployee({ ...employee, join_date: employee.join_date ? new Date(employee.join_date) : null })
    setIsEditDialogOpen(true)
  }

  const handleEditEmployee = async () => {
    if (editingEmployee && editingEmployee.name && editingEmployee.join_date && editingEmployee.employee_type_id) {
      setActionLoading(true)
      try {
        await apiClient.put(`/employee/${editingEmployee.id}`, {
          name: editingEmployee.name,
          email: editingEmployee.email,
          phone_number: editingEmployee.phone_number,
          cnic: editingEmployee.cnic,
          gender: editingEmployee.gender,
          join_date: editingEmployee.join_date.toISOString(),
          employee_type_id: editingEmployee.employee_type_id,
        })
        setIsEditDialogOpen(false)
        setEditingEmployee(null)
        getEmployees()
      } catch (error) {
        console.log("Edit employee error", error)
      } finally {
        setActionLoading(false)
      }
    }
  }

  // Delete employee
  const openDeleteDialog = (employee: Employee) => {
    setDeletingEmployee(employee)
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteEmployee = async () => {
    if (deletingEmployee) {
      setActionLoading(true)
      try {
        await apiClient.delete(`/employee/${deletingEmployee.id}`)
        setIsDeleteDialogOpen(false)
        setDeletingEmployee(null)
        getEmployees()
      } catch (error) {
        console.log("Delete employee error", error)
      } finally {
        setActionLoading(false)
      }
    }
  }

  // Filtered employees
  const filteredEmployees = employees.filter(
    (employee) =>
      employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (employee.email && employee.email.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  // Stats
  const totalEmployees = employees.length

  if (isInitialLoading) {
    return <PageLoader message="Loading employees data..." />
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Stats Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        {isInitialLoading ? (
          <StatCardSkeleton />
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalEmployees}</div>
            </CardContent>
          </Card>
        )}
      </div>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Employee Management</h1>
          <p className="text-sm md:text-base text-gray-600">Manage your team</p>
        </div>
        {/* Add Employee Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>Add Employee</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Employee</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Full Name<span className="text-red-500">*</span></Label>
                <Input
                  id="name"
                  value={newEmployee.name}
                  onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                  placeholder="Enter full name"
                  disabled={actionLoading}
                  required
                />
              </div>
              <div>
                <Label htmlFor="join_date">Join Date<span className="text-red-500">*</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !newEmployee.join_date && "text-muted-foreground"
                      )}
                    >
                      {newEmployee.join_date ? newEmployee.join_date.toLocaleDateString() : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={newEmployee.join_date}
                      onSelect={(date) => setNewEmployee({ ...newEmployee, join_date: date })}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label htmlFor="employee_type_id">Employee Type<span className="text-red-500">*</span></Label>
                <Select
                  value={newEmployee.employee_type_id}
                  onValueChange={(val) => setNewEmployee({ ...newEmployee, employee_type_id: val })}
                  disabled={actionLoading || typesLoading || employeeTypes.length === 0}
                >
                  <SelectTrigger id="employee_type_id">
                    <SelectValue placeholder={typesLoading ? "Loading..." : employeeTypes.length === 0 ? "No types found" : "Select type"} />
                  </SelectTrigger>
                  <SelectContent>
                    {employeeTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newEmployee.email}
                  onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                  placeholder="Enter email address (optional)"
                  disabled={actionLoading}
                />
              </div>
              <div>
                <Label htmlFor="phone_number">Phone</Label>
                <Input
                  id="phone_number"
                  value={newEmployee.phone_number}
                  onChange={(e) => setNewEmployee({ ...newEmployee, phone_number: e.target.value })}
                  placeholder="Enter phone number (optional)"
                  disabled={actionLoading}
                />
              </div>
              <div>
                <Label htmlFor="cnic">CNIC</Label>
                <Input
                  id="cnic"
                  value={newEmployee.cnic}
                  onChange={(e) => setNewEmployee({ ...newEmployee, cnic: e.target.value })}
                  placeholder="Enter CNIC (optional)"
                  disabled={actionLoading}
                />
              </div>
              <div>
                <Label htmlFor="gender">Gender</Label>
                <Input
                  id="gender"
                  value={newEmployee.gender}
                  onChange={(e) => setNewEmployee({ ...newEmployee, gender: e.target.value })}
                  placeholder="Enter gender (optional)"
                  disabled={actionLoading}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button onClick={handleAddEmployee} disabled={actionLoading}>
                {actionLoading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
                Add Employee
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search employees..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>
      {/* Employees Table */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <PageLoader message="Loading employees..." />
          ) : filteredEmployees.length === 0 ? (
            <div className="text-center py-10">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No employees found</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 md:mx-0">
              <div className="inline-block min-w-full align-middle">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Name</TableHead>
                      <TableHead className="min-w-[180px]">Email</TableHead>
                      <TableHead className="min-w-[120px]">Phone</TableHead>
                      <TableHead className="min-w-[120px]">CNIC</TableHead>
                      <TableHead className="min-w-[80px]">Gender</TableHead>
                      <TableHead className="min-w-[120px]">Join Date</TableHead>
                      <TableHead className="min-w-[150px]">Employee Type ID</TableHead>
                      <TableHead className="min-w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
              <TableBody>
                {filteredEmployees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell>{employee.name}</TableCell>
                    <TableCell>{employee.email || "-"}</TableCell>
                    <TableCell>{employee.phone_number || "-"}</TableCell>
                    <TableCell>{employee.cnic || "-"}</TableCell>
                    <TableCell>{employee.gender || "-"}</TableCell>
                    <TableCell>{employee.join_date ? new Date(employee.join_date).toISOString().slice(0, 10) : "-"}</TableCell>
                    <TableCell>{employee.employee_type_id}</TableCell>
                    <TableCell>
                      <div className="flex space-x-1">
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(employee)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDeleteDialog(employee)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
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
      {/* Edit Employee Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
          </DialogHeader>
          {editingEmployee && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Full Name</Label>
                <Input
                  id="edit-name"
                  value={editingEmployee.name}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                  disabled={actionLoading}
                />
              </div>
              <div>
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editingEmployee.email}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, email: e.target.value })}
                  disabled={actionLoading}
                />
              </div>
              <div>
                <Label htmlFor="edit-phone_number">Phone</Label>
                <Input
                  id="edit-phone_number"
                  value={editingEmployee.phone_number}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, phone_number: e.target.value })}
                  disabled={actionLoading}
                />
              </div>
              <div>
                <Label htmlFor="edit-cnic">CNIC</Label>
                <Input
                  id="edit-cnic"
                  value={editingEmployee.cnic}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, cnic: e.target.value })}
                  disabled={actionLoading}
                />
              </div>
              <div>
                <Label htmlFor="edit-gender">Gender</Label>
                <Input
                  id="edit-gender"
                  value={editingEmployee.gender}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, gender: e.target.value })}
                  disabled={actionLoading}
                />
              </div>
              <div>
                <Label htmlFor="edit-join_date">Join Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !editingEmployee?.join_date && "text-muted-foreground"
                      )}
                    >
                      {editingEmployee?.join_date ? editingEmployee.join_date.toLocaleDateString() : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editingEmployee?.join_date || null}
                      onSelect={(date) => setEditingEmployee(editingEmployee ? { ...editingEmployee, join_date: date } : null)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label htmlFor="edit-employee_type_id">Employee Type</Label>
                <Select
                  value={editingEmployee.employee_type_id}
                  onValueChange={(val) => setEditingEmployee({ ...editingEmployee, employee_type_id: val })}
                  disabled={actionLoading || typesLoading || employeeTypes.length === 0}
                >
                  <SelectTrigger id="edit-employee_type_id">
                    <SelectValue placeholder={typesLoading ? "Loading..." : employeeTypes.length === 0 ? "No types found" : "Select type"} />
                  </SelectTrigger>
                  <SelectContent>
                    {employeeTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button onClick={handleEditEmployee} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
              Update Employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Employee</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>
              Are you sure you want to delete <strong>{deletingEmployee?.name}</strong>?
            </p>
            <p className="text-sm text-gray-500 mt-2">This action cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteEmployee} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
              Delete Employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
