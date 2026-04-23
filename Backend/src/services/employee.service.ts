import { prisma } from '../prisma/client';
import { CreateEmployeeInput } from '../validations/employee.validation';

export class EmployeeService {
  async createEmployee(data: CreateEmployeeInput, branch_id: string) {
    const employee = await prisma.employee.create({
      data: { ...data, branch_id },
    });
    return employee;
  }

  async listEmployees(branch_id: string, page = 1, limit = 10) {
    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where: { branch_id },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      prisma.employee.count({ where: { branch_id } }),
    ]);

    return {
      data: employees,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateEmployee(id: string, data: Partial<CreateEmployeeInput>) {
    const employee = await prisma.employee.update({
      where: { id },
      data,
    });
    return employee;
  }

  async deleteEmployee(id: string) {
    const employee = await prisma.employee.delete({
      where: { id },
    });
    return employee;
  }
}
