import { PaymentMethod, SaleType } from '../generated/prisma';

export interface SaleItemInputDTO {
  product_id: number;
  qty: number;
  unit_price: number;
  cost_price?: number;
  line_discount?: number;
}

export interface SalePaymentInputDTO {
  method: PaymentMethod;
  amount: number;
}

export interface CreateSaleDTO {
  customer_id?: number;
  customer_name?: string;
  items: SaleItemInputDTO[];
  discount?: number;
  tax?: number;
  amount_paid?: number;
  payment_method: PaymentMethod;
  payments?: SalePaymentInputDTO[];
  sale_type?: SaleType;
  notes?: string;
  seller_name?: string;
  idempotency_key?: string;
}

export interface HoldSaleDTO {
  customer_id?: number;
  customer_name?: string;
  items: SaleItemInputDTO[];
  discount?: number;
  tax?: number;
  sale_type?: SaleType;
  notes?: string;
  seller_name?: string;
}

export interface CancelSaleDTO {
  reason: string;
  cancelled_by?: string;
}

export interface SaleItemResponseDTO {
  id: number;
  product_id: number;
  qty: number;
  unit_price: number;
  cost_price: number;
  line_discount: number;
  line_total: number;
  product: {
    id: number;
    name: string;
    sku: string | null;
    barcode: string | null;
  };
}

export interface SalePaymentResponseDTO {
  id: number;
  method: PaymentMethod;
  amount: number;
}

export interface SaleResponseDTO {
  id: number;
  invoice_number: string | null;
  status: string;
  customer_id: number | null;
  customer_name: string | null;
  seller_name: string | null;
  sale_type: SaleType;
  subtotal: number;
  discount: number;
  discount_amount: number;
  tax: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  change_due: number;
  due_amount: number;
  payment_method: PaymentMethod;
  payments: SalePaymentResponseDTO[];
  notes: string | null;
  items: SaleItemResponseDTO[];
  created_at: Date;
}

export interface SaleListItemDTO {
  id: number;
  invoice_number: string | null;
  status: string;
  customer_id: number | null;
  customer_name: string | null;
  seller_name: string | null;
  sale_type: SaleType;
  total: number;
  amount_paid: number;
  payment_method: PaymentMethod;
  item_count: number;
  created_at: Date;
}
