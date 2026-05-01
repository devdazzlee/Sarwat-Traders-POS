import { prisma } from '../prisma/client';
import { CreateEmployeeInput } from '../validations/employee.validation';
import { AppError } from '../utils/apiError';

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
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            salaries: true,
            shift_assignments: true,
          }
        }
      }
    });

    if (!employee) {
      throw new AppError(404, 'Employee not found');
    }

    if (employee._count.salaries > 0 || employee._count.shift_assignments > 0) {
      throw new AppError(400, 'Cannot delete this employee because they have linked salary records or shift assignments. Please delete those records first or deactivate the employee instead.');
    }

    return await prisma.employee.delete({
      where: { id },
    });
  }
}
