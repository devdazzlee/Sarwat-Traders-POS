import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ReportsService } from '../services/reports.service';
import { ApiResponse } from '../utils/apiResponse';

const reportsService = new ReportsService();

function parseEndOfDay(dateStr?: string): Date | undefined {
  if (!dateStr) return undefined;
  const d = new Date(`${dateStr}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseStartOfDay(dateStr?: string): Date | undefined {
  if (!dateStr) return undefined;
  const d = new Date(`${dateStr}T00:00:00.000`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Get reports data (sales, products, stats)
 */
export const getReportsData = asyncHandler(async (req: Request, res: Response) => {
  const branchId = req.user?.branch_id as string | undefined;
  const userRole = req.user?.role as string | undefined;
  const { limit, startDate, endDate, paymentMethod } = req.query;

  const query = {
    branchId,
    userRole,
    startDate: parseStartOfDay(typeof startDate === 'string' ? startDate : undefined),
    endDate: parseEndOfDay(typeof endDate === 'string' ? endDate : undefined),
    paymentMethod: typeof paymentMethod === 'string' ? paymentMethod : undefined,
    limit: limit ? Number(limit) : 10,
  };

  const [sales, bestSellingProducts, stats] = await Promise.all([
    reportsService.getSalesForReports(query),
    reportsService.getBestSellingProducts(query),
    reportsService.getReportsStats(query),
  ]);

  new ApiResponse(
    {
      sales,
      bestSellingProducts,
      stats,
    },
    'Reports data fetched successfully',
  ).send(res);
});
