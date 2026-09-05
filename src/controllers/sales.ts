import { Request, Response } from 'express';
import * as saleService from '../services/sale.service';
import { SaleError } from '../services/sale.service';

function handleSaleError(res: Response, error: unknown) {
  if (error instanceof SaleError) {
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

export const createSale = async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;
    const idempotencyHeader = req.headers['idempotency-key'] as string;
    const bodyData = {
      ...req.body,
      idempotency_key: req.body.idempotency_key || idempotencyHeader,
    };
    const sale = await saleService.createSale(bodyData, tenant);
    res.status(201).json(sale);
  } catch (error) {
    handleSaleError(res, error);
  }
};

export const holdSale = async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;
    const sale = await saleService.holdSale(req.body, tenant);
    res.status(201).json(sale);
  } catch (error) {
    handleSaleError(res, error);
  }
};

export const listHeldSales = async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;
    const result = await saleService.listSales(tenant, {
      ...req.query,
      status: 'held',
    });
    res.json(result);
  } catch (error) {
    handleSaleError(res, error);
  }
};

export const resumeSale = async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;
    const saleId = parseParamId(req.params.id);
    if (isNaN(saleId)) {
      res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid sale ID' });
      return;
    }
    const sale = await saleService.resumeSale(saleId, tenant);
    res.json(sale);
  } catch (error) {
    handleSaleError(res, error);
  }
};

export const completeHeldSale = async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;
    const saleId = parseParamId(req.params.id);
    if (isNaN(saleId)) {
      res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid sale ID' });
      return;
    }
    const sale = await saleService.completeHeldSale(saleId, req.body, tenant);
    res.json(sale);
  } catch (error) {
    handleSaleError(res, error);
  }
};

export const cancelSale = async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;
    const saleId = parseParamId(req.params.id);
    if (isNaN(saleId)) {
      res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid sale ID' });
      return;
    }
    const sale = await saleService.cancelSale(saleId, req.body, tenant);
    res.json(sale);
  } catch (error) {
    handleSaleError(res, error);
  }
};

export const reprintSale = async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;
    const saleId = parseParamId(req.params.id);
    if (isNaN(saleId)) {
      res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid sale ID' });
      return;
    }
    const sale = await saleService.reprintSale(saleId, tenant);
    res.json(sale);
  } catch (error) {
    handleSaleError(res, error);
  }
};

export const getAllSales = async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;
    const filters = {
      from: req.query.from as string,
      to: req.query.to as string,
      customerId: req.query.customerId ? parseInt(req.query.customerId as string, 10) : undefined,
      sale_type: req.query.sale_type as string,
      invoiceId: req.query.invoiceId as string,
      status: req.query.status as string,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 10,
    };
    const result = await saleService.listSales(tenant, filters);
    res.json(result);
  } catch (error) {
    handleSaleError(res, error);
  }
};

export const getSaleById = async (req: Request, res: Response) => {
  try {
    const tenant = req.tenant!;
    const saleId = parseParamId(req.params.id);
    if (isNaN(saleId)) {
      res.status(400).json({ success: false, code: 'INVALID_ID', message: 'Invalid sale ID' });
      return;
    }
    const sale = await saleService.getSaleById(saleId, tenant);
    res.json(sale);
  } catch (error) {
    handleSaleError(res, error);
  }
};


