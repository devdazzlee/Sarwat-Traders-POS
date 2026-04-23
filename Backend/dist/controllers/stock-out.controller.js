"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listStockOutHistory = exports.createBulkStockOut = exports.logReturn = exports.logStockOut = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const stock_out_service_1 = require("../services/stock-out.service");
const stockOutService = new stock_out_service_1.StockOutService();
exports.logStockOut = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await stockOutService.logStockOut({
        ...req.body,
        createdBy: req.user.id,
    });
    new apiResponse_1.ApiResponse(result, 'Stock out logged successfully').send(res);
});
exports.logReturn = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await stockOutService.logReturn({
        ...req.body,
        createdBy: req.user.id,
    });
    new apiResponse_1.ApiResponse(result, 'Return logged successfully').send(res);
});
exports.createBulkStockOut = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await stockOutService.createBulkStockOut({
        ...req.body,
        createdBy: req.user.id,
    });
    new apiResponse_1.ApiResponse(result, 'Bulk stock out processed successfully').send(res);
});
exports.listStockOutHistory = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await stockOutService.getStockOutHistory(req.query);
    new apiResponse_1.ApiResponse(result, 'Stock out history retrieved').send(res);
});
//# sourceMappingURL=stock-out.controller.js.map