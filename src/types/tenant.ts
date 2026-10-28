export interface TenantUserContext {
  id: number;
  name: string;
  role: {
    id: number;
    key: string;
    name: string;
    permissions: string[];
  } | null;
}

export interface TenantContext {
  company_id: number;
  company_name: string;
  company_app_name?: string | null;
  license_id: number;
  device_id: string;
  branch_id: number;
  allowed_modules: string[];
  allowed_features: string[];
  user?: TenantUserContext;
}

export interface OwnerContext {
  id: number;
  email: string;
  role: string;
}

