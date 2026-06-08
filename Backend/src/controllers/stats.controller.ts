import asyncHandler from "../middleware/asyncHandler";
import { StatsService } from "../services/stats.service";
import { ApiResponse } from "../utils/apiResponse";

const statsService = new StatsService();

export const dashboardStats = asyncHandler(async (req, res) => {
    const isAdmin = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN';
    let branchId: string | undefined;

    if (isAdmin) {
        // Admin users operate without a branch — always return org-wide money totals.
        branchId = undefined;
    } else {
        const queryBranchId = req.query.branchId as string | undefined;
        const jwtBranchId = req.user?.branch_id as string | undefined;

        if (queryBranchId?.trim() && queryBranchId !== "Not Found") {
            branchId = queryBranchId.trim();
        } else if (jwtBranchId?.trim() && jwtBranchId !== "Not Found") {
            branchId = jwtBranchId.trim();
        }
    }

    const stats = await statsService.getDashboardStats(branchId);
    new ApiResponse(stats, 'Dashboard stats fetched', 200).send(res);
});

export const dashboardCollections = asyncHandler(async (req, res) => {
    const startDateRaw = req.query.startDate as string | undefined;
    const endDateRaw = req.query.endDate as string | undefined;
    const search = (req.query.search as string | undefined)?.trim();

    const startDate =
        startDateRaw && !Number.isNaN(new Date(startDateRaw).getTime())
            ? new Date(startDateRaw)
            : undefined;
    const endDate =
        endDateRaw && !Number.isNaN(new Date(endDateRaw).getTime())
            ? new Date(endDateRaw)
            : undefined;

    const entries = await statsService.getCollectionEntries({ startDate, endDate, search });
    new ApiResponse(entries, 'Collection entries fetched', 200).send(res);
});