import asyncHandler from "../middleware/asyncHandler";
import { StatsService } from "../services/stats.service";
import { ApiResponse } from "../utils/apiResponse";

const statsService = new StatsService();

export const dashboardStats = asyncHandler(async (req, res) => {
    const isAdmin = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN';
    const queryBranchId = req.query.branchId as string | undefined;
    const jwtBranchId = req.user?.branch_id as string | undefined;

    let branchId: string | undefined;

    if (queryBranchId && queryBranchId.trim() && queryBranchId !== "Not Found") {
        branchId = queryBranchId.trim();
    } else if (!isAdmin) {
        branchId = jwtBranchId?.trim();
    }
    
    if (branchId === "Not Found") branchId = undefined;

    const stats = await statsService.getDashboardStats(branchId);
    new ApiResponse(stats, 'Dashboard stats fetched', 200).send(res);
})