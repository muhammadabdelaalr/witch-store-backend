# Backend, Database & APIs Documentation (ERP Store)

This document provides a comprehensive guide to the backend architecture, SQLite database schema, and Electron IPC (Inter-Process Communication) channels implemented in the **ERP Store (الساحرة)** application.

---

## 🏗️ 1. Architecture Overview
The application is built on Electron's multi-process architecture to run as a native desktop application:
1. **Main Process**: Manages the application lifecycle, desktop window creation, and direct integration with the local SQLite database via the `better-sqlite3` driver.
2. **Renderer Process**: The front-end user interface built using **React**, **Vite**, **TypeScript**, and styled with **Tailwind CSS**.
3. **Preload Bridge**: A secure interface exposed in the main world as `window.electronAPI` using `contextBridge`. It bridges the front-end to main-process IPC handlers without exposing direct Node.js APIs to the renderer.

```mermaid
graph TD
    subgraph Renderer Process (React Front-End)
      UI["UI Views & Pages"] -->|Invoke function| Hook["Hooks / Zustand Store"]
      Hook -->|Request through bridge| bridge["window.electronAPI"]
    end

    subgraph Preload Bridge
      bridge -->|Pack IPC payload| IPCSend["ipcRenderer.invoke"]
    end

    subgraph Main Process (Electron Back-End)
      IPCSend -->|Route channel| IPCHandle["ipcMain.handle"]
      IPCHandle -->|Execute SQL query| SQL["better-sqlite3 Engine"]
      SQL -->|Read / Write| DB[("dev.db (SQLite File)")]
    end
```

---

## 💾 2. Database Schema & Indexes
The local SQLite database (`dev.db`) is initialized automatically at startup in `schema.ts`.

### Table Schemas

#### 1. `categories`
Stores product categories.
* `id` (INTEGER PRIMARY KEY AUTOINCREMENT): Unique identifier.
* `name` (TEXT NOT NULL UNIQUE): Category name (e.g., Abayas, Dresses, Pants, Blouses, Chemises, Tops).
* `created_at` (TEXT): Creation timestamp.

#### 2. `products`
Stores product catalog data and inventory levels.
* `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
* `name` (TEXT NOT NULL): Product name.
* `sku` (TEXT UNIQUE): Unique Stock Keeping Unit.
* `barcode` (TEXT UNIQUE): Unique barcode / QR code used to identify products via scanner inputs.
* `category_id` (INTEGER REFERENCES categories(id)): Foreign key linking to the category.
* `factory` (TEXT): Name of the factory or supplier representing this model.
* `description` (TEXT): Detailed description containing model specifications.
* `cost_price` (REAL NOT NULL DEFAULT 0): Cost price of a single unit.
* `sell_price` (REAL NOT NULL DEFAULT 0): Retail sell price for consumers.
* `stock_qty` (INTEGER NOT NULL DEFAULT 0): Current stock level in database.
* `low_stock_threshold` (INTEGER DEFAULT 5): Stock level threshold for low stock alert.
* `image_path` (TEXT): Local file system path for the product image.
* `created_at` (TEXT) | `updated_at` (TEXT)

#### 3. `customers`
Stores customer details and account balances.
* `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
* `name` (TEXT NOT NULL): Customer name.
* `phone` (TEXT) | `email` (TEXT) | `address` (TEXT)
* `balance` (REAL DEFAULT 0): The customer's credit/debt balance.
* `created_at` (TEXT)

#### 4. `suppliers`
Stores manufacturer/supplier details.
* `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
* `name` (TEXT NOT NULL): Supplier name.
* `phone` (TEXT) | `email` (TEXT) | `address` (TEXT)
* `balance` (REAL DEFAULT 0): The supplier's current ledger balance.
* `created_at` (TEXT)

#### 5. `sales`
Stores sales transaction invoices.
* `id` (INTEGER PRIMARY KEY AUTOINCREMENT): Unique invoice number.
* `customer_id` (INTEGER REFERENCES customers(id)): Optional customer link.
* `total` (REAL NOT NULL): Grand total after discounts and taxes.
* `discount` (REAL DEFAULT 0): Discount percentage applied.
* `tax` (REAL DEFAULT 0): Tax percentage applied.
* `amount_paid` (REAL NOT NULL): Amount paid during checkout.
* `payment_method` (TEXT CHECK(payment_method IN ('cash','instapay','wallet','card','credit'))): Payment method used.
* `notes` (TEXT): Transaction notes.
* `seller_name` (TEXT): Username of the cashier who logged the sale.
* `created_at` (TEXT)

#### 6. `sale_items`
Stores individual line items within invoices.
* `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
* `sale_id` (INTEGER REFERENCES sales(id) ON DELETE CASCADE): Links to parent invoice. (Deletes automatically when invoice is deleted).
* `product_id` (INTEGER REFERENCES products(id)): Link to product.
* `qty` (INTEGER NOT NULL): Quantity sold.
* `unit_price` (REAL NOT NULL): Actual sell price at time of transaction.
* `cost_price` (REAL NOT NULL): Actual cost price at time of transaction (retains accurate profit margins even if base costs change).

#### 7. `expenses`
Stores administrative expenses.
* `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
* `category_id` (INTEGER REFERENCES categories(id)): Optional category link.
* `category` (TEXT NOT NULL): Expense category (Rent, Salaries, Utilities, Marketing, Other).
* `amount` (REAL NOT NULL): Amount spent.
* `description` (TEXT): Description of the expense.
* `date` (TEXT): Transaction date (YYYY-MM-DD).
* `created_at` (TEXT)

#### 8. `customer_transactions`
Ledger entries for customer payments and debts.
* `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
* `customer_id` (INTEGER REFERENCES customers(id))
* `type` (TEXT CHECK(type IN ('payment','debt'))): Transaction type.
* `amount` (REAL NOT NULL): Transaction amount.
* `notes` (TEXT): Transaction description.
* `created_at` (TEXT)

#### 9. `supplier_transactions`
Ledger entries for supplier payments and purchases.
* `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
* `supplier_id` (INTEGER REFERENCES suppliers(id))
* `type` (TEXT CHECK(type IN ('payment','purchase'))): Transaction type.
* `amount` (REAL NOT NULL): Transaction amount.
* `notes` (TEXT): Transaction description.
* `created_at` (TEXT)

#### 10. `users`
System user accounts and activity logs.
* `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
* `name` (TEXT NOT NULL UNIQUE): Username.
* `phone` (TEXT): User password/phone credentials.
* `logs` (TEXT): JSON string storing user activity logs (e.g., login, logout, and sales transactions).
* `created_at` (TEXT)

### Database Indexes
To maintain responsive search speeds as sales data grows, the database defines the following indexes:
* `idx_products_barcode` & `idx_products_sku`: Accelerates lookup during barcode scanning.
* `idx_products_category`: Optimizes product catalog grid loading.
* `idx_sales_date` & `idx_sales_customer`: Speeds up report generation and invoice history loading.
* `idx_sale_items_sale` & `idx_sale_items_product`: Faster JOIN operations for invoice details.
* `idx_expenses_date` & `idx_expenses_category`: Optimizes expense reporting and charts.
* `idx_customer_transactions_customer` & `idx_supplier_transactions_supplier`: Speeds up ledger queries.

---

## 🔌 3. Inter-Process Communication (IPC) APIs

The frontend communicates with the backend main process through standard IPC channels:

### 📦 A. Product Module Channels

#### `products:getAll`
* **Description**: Returns products with pagination, search query, and low stock filtering.
* **Parameters**:
  ```typescript
  filters?: {
    categoryId?: number;
    search?: string;
    lowStock?: boolean;
    page?: number;
    limit?: number;
  }
  ```
* **Returns**: `{ data: Product[], total: number, page: number, limit: number, totalPages: number }`

#### `products:getByBarcode`
* **Description**: Fetches products matching an exact barcode/SKU, or performs a partial match search.
* **Parameters**: `query: string`
* **Returns**: `Product[]`

#### `products:create`
* **Description**: Creates a new product after performing backend field validations and logging the activity.
* **Parameters**: `data: CreateProductDTO`
* **Returns**: `Product`

#### `products:update`
* **Description**: Updates specific fields of an existing product.
* **Parameters**: `id: number, data: Partial<CreateProductDTO>`
* **Returns**: `Product`

#### `products:delete`
* **Description**: Permanently deletes a product from the database and logs the deletion.
* **Parameters**: `id: number`
* **Returns**: `void`

#### `products:adjustStock`
* **Description**: Adjusts product stock levels manually.
* **Parameters**: `id: number, delta: number` (e.g. `10` to add stock, `-5` to remove stock).
* **Returns**: `void`

---

### 🏷️ B. Category Module Channels

#### `categories:getAll`
* **Description**: Retrieves all category records sorted alphabetically.
* **Returns**: `Category[]`

#### `categories:create`
* **Description**: Creates a new category name.
* **Parameters**: `name: string`
* **Returns**: `Category`

---

### 🧾 C. Sales Module Channels

#### `sales:create`
* **Description**: Records a new transaction. First validates stock availability, inserts sales details, decrements inventory levels, updates customer debt balances (if unpaid total is left), and logs user actions inside an ACID-compliant transaction.
* **Parameters**: `data: CreateSaleDTO`
* **Returns**: `Sale` (throws an error if inventory levels are insufficient for any item).

#### `sales:getAll`
* **Description**: Fetches sales invoices filtered by date ranges, customer, and supports pagination.
* **Parameters**:
  ```typescript
  filters?: {
    from?: string; // YYYY-MM-DD format
    to?: string;   // YYYY-MM-DD format
    customerId?: number;
    page?: number;
    limit?: number;
  }
  ```
* **Returns**: `{ data: (Sale & { customer_name: string | null, items: SaleItem[] })[], total: number, ... }`

#### `sales:getById`
* **Description**: Fetches a single invoice details including all invoice line items.
* **Parameters**: `id: number`
* **Returns**: `SaleWithItems`

---

### 👥 D. Customer Module Channels

#### `customers:getAll`
* **Description**: Fetches customer records matching search keywords with pagination.
* **Parameters**: `filters?: { search?: string, page?: number, limit?: number }`
* **Returns**: `{ data: Customer[], total: number, ... }`

#### `customers:create`
* **Description**: Creates a new customer account.
* **Parameters**: `data: CreateCustomerDTO`
* **Returns**: `Customer`

#### `customers:update`
* **Description**: Updates specific profile details of an existing customer.
* **Parameters**: `id: number, data: Partial<CreateCustomerDTO>`
* **Returns**: `Customer`

#### `customers:addTransaction`
* **Description**: Records a payment or debt entry on a customer's account and updates their balance.
* **Parameters**: `data: CustomerTransactionDTO` (`{ customer_id: number, type: 'payment' | 'debt', amount: number, notes?: string }`)
* **Returns**: `void`

#### `customers:getTransactions`
* **Description**: Retrieves all ledger entries for a customer sorted by timestamp (newest first).
* **Parameters**: `customerId: number`
* **Returns**: `CustomerTransaction[]`

---

### 🚚 E. Supplier Module Channels

#### `suppliers:getAll`
* **Description**: Fetches suppliers matching search keywords with pagination.
* **Parameters**: `filters?: { search?: string, page?: number, limit?: number }`
* **Returns**: `{ data: Supplier[], total: number, ... }`

#### `suppliers:create`
* **Description**: Creates a new supplier profile.
* **Parameters**: `data: CreateSupplierDTO`
* **Returns**: `Supplier`

#### `suppliers:update`
* **Description**: Updates an existing supplier's details.
* **Parameters**: `id: number, data: Partial<CreateSupplierDTO>`
* **Returns**: `Supplier`

#### `suppliers:addTransaction`
* **Description**: Adds a financial ledger entry (payment or purchase) on a supplier's account.
* **Parameters**: `data: SupplierTransactionDTO` (`{ supplier_id: number, type: 'payment' | 'purchase', amount: number, notes?: string }`)
* **Returns**: `void`

#### `suppliers:getTransactions`
* **Description**: Retrieves all ledger entries for a supplier sorted by timestamp.
* **Parameters**: `supplierId: number`
* **Returns**: `SupplierTransaction[]`

---

### 💸 F. Expense Module Channels

#### `expenses:getAll`
* **Description**: Retrieves expenses matching date filters, categories, and handles pagination.
* **Parameters**: `filters?: { from?: string, to?: string, category?: string, page?: number, limit?: number }`
* **Returns**: `{ data: Expense[], total: number, ... }`

#### `expenses:create`
* **Description**: Logs a new administrative store expense.
* **Parameters**: `data: CreateExpenseDTO`
* **Returns**: `Expense`

#### `expenses:update`
* **Description**: Modifies an existing expense record.
* **Parameters**: `id: number, data: Partial<CreateExpenseDTO>`
* **Returns**: `Expense`

#### `expenses:delete`
* **Description**: Deletes an expense record.
* **Parameters**: `id: number`
* **Returns**: `void`

---

### 📊 G. Reports & Analytics Channels

#### `reports:dashboard`
* **Description**: Calculates dashboard statistics (today's revenue, transactions, customer count, low-stock items, weekly sales data, and top-selling products).
* **Parameters**: `categoryId?: number` (optional filter by clothing category)
* **Returns**: `DashboardStats`

#### `reports:sales`
* **Description**: Computes sales metrics for a specific date range, including total revenue, discounts, sales by day, top products, and payment method summaries.
* **Parameters**: `from: string, to: string` (YYYY-MM-DD)
* **Returns**: `SalesReport`

#### `reports:profit`
* **Description**: Calculates net and gross margins for a specific date range by computing the difference between unit sales profit and general expenses.
* **Parameters**: `from: string, to: string` (YYYY-MM-DD)
* **Returns**: `ProfitReport`

---

### 🔐 H. Users & Authentication Channels

#### `users:getAll`
* **Description**: Retrieves system users and active profiles. (Restricted to `Administrator` login only).
* **Parameters**: `filters?: { search?: string, page?: number, limit?: number }`
* **Returns**: `{ data: User[], total: number, ... }`

#### `users:create`
* **Description**: Registers a new user.
* **Parameters**: `data: { name: string, phone: string }`
* **Returns**: `User`

#### `users:update`
* **Description**: Updates user credentials or credentials lookup.
* **Parameters**: `id: number, data: { name?: string, phone?: string }`
* **Returns**: `User`

#### `users:delete`
* **Description**: Deletes a user profile.
* **Parameters**: `id: number`
* **Returns**: `void`

#### `users:login`
* **Description**: Validates user credentials, maps default admin logins, starts active sessions, and logs events.
* **Parameters**: `{ username, password }`
* **Returns**: `{ id: number, name: string, phone: string, logs: string }` (throws an error on invalid credentials).

#### `users:syncActiveUser`
* **Description**: Syncs client state (Zustand persistent auth state) with backend user sessions on reload.
* **Parameters**: `{ id: number, name: string }`
* **Returns**: `void`

#### `users:logout`
* **Description**: Clears backend active session state and logs the logout event.
* **Returns**: `void`

---

## 🔒 4. Data Integrity & Safeguards

1. **ACID-Compliant transactions**:
   All DB operations modifying multiple rows (e.g. creating invoices, registering client payments) are wrapped inside a SQLite `db.transaction()` block. If any step fails, the entire transaction is rolled back.
2. **User Audit Logs**:
   The `logs` column in the `users` table holds a JSON array detailing every user activity (logins, sales, modifications, deletions, logouts) along with timestamps.
3. **Auto-updating Stock Checks**:
   Sales creation enforces stock level checks. If quantity requested exceeds stock levels, the SQLite transaction fails and throws a localized error, guaranteeing zero negative stock in database.
4. **Offline Routing**:
   The application uses React Router's `HashRouter` instead of `BrowserRouter` to ensure flawless rendering and page navigation over the custom Electron `file://` protocol.
