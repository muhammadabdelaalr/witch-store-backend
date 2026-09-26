import { Request, Response } from 'express';
import * as shiftService from '../services/shift.service';
import { ShiftError } from '../services/shift.service';

function handleShiftError(res: Response, error: unknown) {
  if (error instanceof ShiftError) {
    res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }
  const message = error instanceof Error ? error.message : 'Internal server error';
  res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message });
}

function parseParamId(param: unknown): number {
  const str = Array.isArray(param) ? param[0] : String(param || '');
  return parseInt(str, 10);
}

export const openShift = async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;
    const shift = await shiftService.openShift(req.body, tenant);
    res.status(201).json({ success: true, data: shift });
  } catch (error) {
    handleShiftError(res, error);
  }
};

export const getCurrentShift = async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;
    const shift = await shiftService.getCurrentShift(tenant);
    res.json({ success: true, data: shift });
  } catch (error) {
    handleShiftError(res, error);
  }
};

export const recordCashMovement = async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;
    const movement = await shiftService.recordCashMovement(req.body, tenant);
    res.status(201).json({ success: true, data: movement });
  } catch (error) {
    handleShiftError(res, error);
  }
};

export const closeShift = async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;
    const shiftId = parseParamId(req.params.id);
    if (isNaN(shiftId)) {
      res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid shift ID' });
      return;
    }
    const shift = await shiftService.closeShift(shiftId, req.body, tenant);
    res.json({ success: true, data: shift });
  } catch (error) {
    handleShiftError(res, error);
  }
};

export const getShiftSummary = async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;
    const shiftId = parseParamId(req.params.id);
    if (isNaN(shiftId)) {
      res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid shift ID' });
      return;
    }
    const summary = await shiftService.getShiftSummary(shiftId, tenant);
    res.json({ success: true, data: summary });
  } catch (error) {
    handleShiftError(res, error);
  }
};

export const listShifts = async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;
    const filters = {
      status: req.query.status as string,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 10,
    };
    const result = await shiftService.listShifts(tenant, filters);
    res.json({ success: true, ...result });
  } catch (error) {
    handleShiftError(res, error);
  }
};
