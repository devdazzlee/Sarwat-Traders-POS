import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { StockOutService } from '../services/stock-out.service';

const stockOutService = new StockOutService();

export const logStockOut = asyncHandler(async (req: Request, res: Response) => {
  const result = await stockOutService.logStockOut({
    ...req.body,
    createdBy: req.user!.id,
  });
  new ApiResponse(result, 'Stock out logged successfully').send(res);
});

export const logReturn = asyncHandler(async (req: Request, res: Response) => {
  const result = await stockOutService.logReturn({
    ...req.body,
    createdBy: req.user!.id,
  });
  new ApiResponse(result, 'Return logged successfully').send(res);
});
