import crypto from 'crypto';
import cors from 'cors';
import express, { Express, Request, Response, NextFunction, Router } from 'express';
import helmet from 'helmet';
import { setupSwagger } from './swagger';
import categoriesRouter from './routes/categories';
import productsRouter from './routes/products';
import customersRouter from './routes/customers';
import suppliersRouter from './routes/suppliers';
import salesRouter from './routes/sales';
import expensesRouter from './routes/expenses';
import reportsRouter from './routes/reports';
import usersRouter from './routes/users';
import shiftsRouter from './routes/shifts';
import inventoryRouter from './routes/inventory';
import licenseRouter from './routes/license';
import ownerRouter from './routes/owner';

function mountApi(router: Router): void {
  router.use('/categories', categoriesRouter);
  router.use('/products', productsRouter);
  router.use('/customers', customersRouter);
  router.use('/suppliers', suppliersRouter);
  router.use('/sales', salesRouter);
  router.use('/expenses', expensesRouter);
  router.use('/reports', reportsRouter);
  router.use('/users', usersRouter);
  router.use('/shifts', shiftsRouter);
  router.use('/inventory', inventoryRouter);
  router.use('/license', licenseRouter);
  router.use('/owner', ownerRouter);
}

export function createApp(): Express {
  const app = express();
  const nodeEnv = process.env.NODE_ENV || 'development';
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean)
    : nodeEnv === 'production' ? [] : '*';

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: nodeEnv === 'production' ? undefined : false }));
  app.use(cors({ origin: allowedOrigins, credentials: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '256kb' }));

  app.use((req, res, next) => {
    const incoming = req.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(incoming)
      ? incoming
      : crypto.randomUUID();
    req.id = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  });

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      console.log(JSON.stringify({
        level: 'info',
        event: 'http_request',
        timestamp: new Date().toISOString(),
        request_id: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Date.now() - startedAt,
        company_id: req.tenant?.company_id,
        branch_id: req.tenant?.branch_id,
        user_id: req.tenant?.user?.id,
      }));
    });
    next();
  });

  app.get('/health', (_req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

  const v1 = Router();
  mountApi(v1);
  app.use('/api/v1', v1);

  const legacy = Router();
  legacy.use((_req, res, next) => {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', 'Sat, 01 May 2027 00:00:00 GMT');
    res.setHeader('Link', '</api/v1>; rel="successor-version"');
    next();
  });
  mountApi(legacy);
  app.use('/api', legacy);

  if (process.env.ENABLE_SWAGGER !== 'false' && nodeEnv !== 'production') setupSwagger(app);

  app.use((_req, res) => {
    res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Endpoint not found.' });
  });

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = Number(err.status || err.statusCode) || 500;
    const code = String(err.code || 'INTERNAL_SERVER_ERROR');
    console.error(JSON.stringify({
      level: 'error',
      event: 'request_failed',
      timestamp: new Date().toISOString(),
      request_id: req.id,
      code,
      status,
      message: err instanceof Error ? err.message : String(err),
    }));
    res.status(status).json({
      success: false,
      code,
      error: code,
      message: status >= 500 && nodeEnv === 'production' ? 'Internal server error.' : err.message || 'Internal server error.',
      details: status < 500 ? err.details : undefined,
    });
  });

  return app;
}

