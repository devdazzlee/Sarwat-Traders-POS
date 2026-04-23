import { Employee } from '@prisma/client';
import { prisma } from '../prisma/client';

export class ShiftAssignmentService {
    // Assign a shift to an employee
    async assignShift({
        employee_id,
        shift_time,
        start_date,
        end_date,
    }: {
        employee_id: string;
        shift_time: string;
        start_date: Date;
        end_date?: Date | null;
    }) {
        return await prisma.shiftAssignment.create({
            data: {
                employee_id,
                shift_time,
                start_date,
                end_date: end_date ?? null,
            },
        });
    }

    // Get current shift of an employee (where end_date is null)
    async getCurrentShift(employee_id: Employee['id']) {
        return await prisma.shiftAssignment.findFirst({
            where: {
                employee_id,
                end_date: null,
            },
            orderBy: {
                start_date: 'desc',
            },
        });
    }

    // Get all shift history of an employee
    async getShiftHistory(employee_id: Employee['id']) {
        return await prisma.shiftAssignment.findMany({
            where: { employee_id },
            orderBy: { start_date: 'desc' },
        });
    }

    // End current shift (set end_date)
    async endCurrentShift(employee_id: Employee['id'], end_date = new Date()) {
        return await prisma.shiftAssignment.updateMany({
            where: {
                employee_id,
                end_date: null,
            },
            data: {
                end_date,
            },
        });
    }

    // Get all shifts (optionally with filters/pagination)
    async getAllShifts() {
        return await prisma.shiftAssignment.findMany({
            orderBy: { start_date: 'desc' },
            include: { employee: true },
        });
    }

    // Update a shift by ID
    async updateShift(id: string, data: Partial<{ shift_time: string; start_date: Date; end_date: Date | null; }>) {
        return await prisma.shiftAssignment.update({
            where: { id },
            data,
        });
    }

    // Delete a shift by ID
    async deleteShift(id: string) {
        return await prisma.shiftAssignment.delete({
            where: { id },
        });
    }
}
