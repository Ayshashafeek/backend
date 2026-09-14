# Jewellery E-Commerce Backend API

A production-ready Node.js, Express.js, and MongoDB backend for an e-commerce platform specializing in jewellery products. This system provides role-based access control (RBAC), customer shopping flows, catalog management, order processing, and administrative controls.

---

## Table of Contents
- [Project Overview](#project-overview)
- [Technology Stack](#technology-stack)
- [Project Architecture](#project-architecture)
- [Installation & Setup](#installation--setup)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [Running Tests](#running-tests)
- [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
- [API Reference](#api-reference)
  - [Authentication](#authentication-apis)
  - [Customer Profile](#customer-profile-apis)
  - [Product Catalog](#product-catalog-apis)
  - [Categories](#category-apis)
  - [Shopping Cart](#shopping-cart-apis)
  - [Checkout & Orders](#checkout--order-apis)
  - [Admin Order Management](#admin-order-management-apis)
  - [Admin & Super Admin Management](#admin--super-admin-management-apis)
- [Data Models & Database Design](#data-models--database-design)
- [Security & Validation](#security--validation)

---

## Project Overview

The Jewellery E-Commerce backend powers the full life cycle of an online jewellery store:
* **Customer Journey**: Registration, authentication, profile & address management, rich product catalog browsing (keyword search, category filters, price range, stock availability, and sorting), persistent multi-item cart, checkout with atomic stock deductions, and historical order tracking.
* **Administrative Controls**: Catalogue management (categories and products with image upload), order management across all customers with status transitions, and customer inspection.
* **Super Admin Controls**: Account creation (admin and staff), user lifecycle management (activation, deactivation, role assignment, password reset) with built-in self-protection and peer-protection guards.

---

## Technology Stack

* **Runtime**: Node.js (v18+)
* **Framework**: Express.js (v4.19)
* **Database & ODM**: MongoDB with Mongoose (v8.5)
* **Authentication**: JSON Web Tokens (`jsonwebtoken`), password hashing with `bcryptjs`
* **File Uploads & Assets**: `multer` with Cloudinary storage (`cloudinary`, `multer-storage-cloudinary`)
* **Testing**: Jest (v29.7), Supertest (v7.0), and In-Memory MongoDB (`mongodb-memory-server`)

---

## Project Architecture

The backend follows a clean, modular MVC structure:

```
├── config/
│   ├── cloudinary.js          # Cloudinary configuration
│   └── db.js                  # MongoDB Mongoose connection
├── controllers/
│   ├── adminController.js     # Admin & Super Admin management + Admin order operations
│   ├── authController.js      # Customer & Admin authentication handlers
│   ├── categoryController.js  # Category CRUD handlers
│   ├── customerController.js  # Customer profile & session handlers
│   ├── cartController.js      # Cart and CartItem management
│   ├── orderController.js     # Checkout and Customer order history
│   └── productController.js   # Product catalog with search, filter, and sorting
├── middleware/
│   ├── authMiddleware.js      # JWT verification (`protect`) and RBAC (`restrictTo`)
│   ├── errorMiddleware.js     # 404 handler and central error responder
│   └── uploadMiddleware.js    # Image upload processing with Multer & Cloudinary
├── models/
│   ├── Cart.js                # Customer cart model
│   ├── CartItem.js            # Individual cart item model with unique compound index
│   ├── Category.js            # Jewellery category model
│   ├── Order.js               # Customer order header and delivery details
│   ├── OrderItem.js           # Order line items with historical pricing snapshots
│   ├── Product.js             # Jewellery product model with stock, price, and category ref
│   └── User.js                # User accounts with roles, credentials, and profile
├── routes/
│   ├── adminRoutes.js         # Routes mounted at /api/admin
│   ├── authRoutes.js          # Routes mounted at /api/auth
│   ├── categoryRoutes.js      # Routes mounted at /api/categories
│   ├── customerRoutes.js      # Routes mounted at /api/customer
│   ├── cartRoutes.js          # Routes mounted at /api/cart
│   ├── orderRoutes.js         # Routes mounted at /api/orders
│   └── productRoutes.js       # Routes mounted at /api/products
├── seedCategories.js          # Database seeder for jewellery categories
├── seedSuperAdmin.js          # Bootstrap script for initializing the Super Admin
├── app.js                     # Express application configuration and route mounting
├── server.js                  # Server entry point listening on PORT
└── tests/
    ├── superadmin.test.js     # Integration test suite for Super Admin module (105 tests)
    └── customer.test.js       # Integration test suite for Customer & Order modules (138 tests)
```

---

## Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd JW-Ecom-feature-backend-day1-dev-aysha
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy `.env.example` to `.env` and fill in your details:
   ```bash
   cp .env.example .env
   ```

---

## Environment Variables

| Variable | Description | Example |
| :--- | :--- | :--- |
| `PORT` | Server listen port | `5000` |
| `MONGO_URI` | MongoDB connection URI (Atlas or local) | `mongodb://127.0.0.1:27017/day1_db` |
| `JWT_SECRET` | Secret key for signing and verifying JWT tokens | `your_secure_jwt_secret_key` |
| `JWT_EXPIRES_IN`| JWT expiration duration | `7d` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud identifier (optional for image upload) | `your_cloud_name` |
| `CLOUDINARY_API_KEY` | Cloudinary API key | `your_api_key` |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | `your_api_secret` |

---

## Running the Application

* **Production mode:**
  ```bash
  npm start
  ```
* **Development mode (with nodemon):**
  ```bash
  npm run dev
  ```
* **Seed categories:**
  ```bash
  node seedCategories.js
  ```
* **Seed initial Super Admin:**
  ```bash
  node seedSuperAdmin.js
  ```

---

## Running Tests

The test suite runs against an isolated, in-memory MongoDB server (`mongodb-memory-server`) and executes without requiring external database connections:

```bash
npm test
```

Current test results: **243 passing tests across 2 test suites**.

---

## Role-Based Access Control (RBAC)

The application enforces 4 distinct roles:

1. **`customer`**:
   - Can register, login, view/update own profile, browse/filter products.
   - Can manage their personal shopping cart.
   - Can checkout and view their personal order history.
   - Cannot access admin or superadmin endpoints.
2. **`staff`**:
   - Internal staff user.
   - Restricted from superadmin features and administrative order modification unless explicitly granted.
3. **`admin`**:
   - Can create staff accounts.
   - Full CRUD on categories and products.
   - Can view all customer accounts.
   - Can view all customer orders and update order status (`Order Placed`, `Confirmed`, `Processing`, `Shipped`, `Delivered`, `Cancelled`).
   - Cannot access superadmin user management or modify superadmin accounts.
4. **`superadmin`**:
   - Bootstrapped via seed script.
   - Can create admin and staff users.
   - Full user management (list, view, update, activate, deactivate, delete, role change, password reset).
   - Protected: Cannot delete, deactivate, or demote self or other superadmins.

---

## API Reference

### Authentication APIs

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Register new customer (`name`, `email`, `password`) |
| `POST` | `/api/auth/login` | Public | Login with email/username and password; returns JWT |
| `GET` | `/api/auth/me` | Authenticated | Get current authenticated user profile |

### Customer Profile APIs

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/customer/profile` | Customer | Get customer profile (name, email, phone, address) |
| `PUT` | `/api/customer/profile` | Customer | Update customer profile (`name`, `phone`, `address`) |
| `POST` | `/api/customer/logout` | Customer | Invalidate customer session |

### Product Catalog APIs

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/products` | Public | List products with search (`search`), category (`category`), price range (`minPrice`, `maxPrice`), availability (`available`), and sort (`price_asc`, `price_desc`, `newest`) |
| `GET` | `/api/products/:id` | Public | Get single product details |
| `POST` | `/api/products` | Admin / Superadmin | Create new product (with optional image upload) |
| `PUT` | `/api/products/:id` | Admin / Superadmin | Update product |
| `DELETE` | `/api/products/:id` | Admin / Superadmin | Delete product |

### Category APIs

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/categories` | Public | List all product categories |
| `GET` | `/api/categories/:id` | Public | Get single category by ID |
| `POST` | `/api/categories` | Admin / Superadmin | Create category |
| `PUT` | `/api/categories/:id` | Admin / Superadmin | Update category |
| `DELETE` | `/api/categories/:id` | Admin / Superadmin | Delete category |

### Shopping Cart APIs

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/cart` | Customer | View customer's cart, item list, subtotals, and totalAmount |
| `POST` | `/api/cart/items` | Customer | Add item to cart (`productId`, `quantity`) |
| `PUT` | `/api/cart/items/:id` | Customer | Update cart item quantity |
| `DELETE` | `/api/cart/items/:id` | Customer | Remove item from cart |

### Checkout & Order APIs

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/orders` | Customer | Place order from cart items (recalculates prices, validates and decrements stock, clears cart) |
| `GET` | `/api/orders` | Customer | View order history for authenticated customer (newest first) |
| `GET` | `/api/orders/:id` | Customer | View single order details (strictly own order; foreign order returns 404) |

### Admin Order Management APIs

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/orders` | Admin / Superadmin | View all orders across customers with customer information and items |
| `PUT` | `/api/admin/orders/:id/status` | Admin / Superadmin | Update order status (`Order Placed`, `Confirmed`, `Processing`, `Shipped`, `Delivered`, `Cancelled`) |

### Admin & Super Admin Management APIs

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/admin/create` | Admin / Superadmin | Admin creates staff; Super Admin creates admin or staff |
| `GET` | `/api/admin/customers` | Admin / Superadmin | List all customer accounts |
| `GET` | `/api/admin/admins` | Superadmin | List all admin accounts |
| `GET` | `/api/admin/staff` | Superadmin | List all staff accounts |
| `GET` | `/api/admin/users/:id` | Superadmin | Get admin/staff user details by ID |
| `PUT` | `/api/admin/users/:id` | Superadmin | Update admin/staff profile (`name`, `username`) |
| `PATCH` | `/api/admin/users/:id/status`| Superadmin | Activate or deactivate admin/staff account |
| `DELETE` | `/api/admin/users/:id` | Superadmin | Delete admin/staff account |
| `PATCH` | `/api/admin/users/:id/role` | Superadmin | Change user role between `staff` and `admin` |
| `PATCH` | `/api/admin/users/:id/password`| Superadmin | Reset user password (hashed via pre-save hook) |

---

## Data Models & Database Design

### User Model
* `name`: String, required
* `email`: String, unique, sparse, lowercase, required for customers
* `username`: String, unique, sparse, lowercase, required for staff/admin
* `password`: String, minlength 6, bcrypt hashed (salt rounds = 10)
* `role`: Enum `["customer", "staff", "admin", "superadmin"]`, default: `"customer"`
* `isActive`: Boolean, default: `true`
* `phone`: String, trim
* `address`: Subdocument `{ street, city, state, pincode }`

### Category Model
* `name`: String, required, unique, trim
* `description`: String, trim

### Product Model
* `name`: String, required, trim
* `description`: String, trim
* `price`: Number, required, min 0
* `stock`: Number, required, min 0
* `category`: ObjectId ref `Category`, required
* `image`: String (URL)
* `available`: Boolean, default: `true`
* `createdBy`: ObjectId ref `User`

### Cart & CartItem Models
* `Cart`: `userId` (ObjectId ref `User`, unique)
* `CartItem`: `cartId` (ObjectId ref `Cart`), `productId` (ObjectId ref `Product`), `quantity` (Number, min 1), unique compound index on `{ cartId: 1, productId: 1 }`

### Order & OrderItem Models
* `Order`: `userId` (ObjectId ref `User`), `totalAmount` (Number, min 0), `shippingAddress` `{ street, city, state, pincode }`, `phone`: String, `orderStatus`: Enum `["Order Placed", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled"]`, default: `"Order Placed"`
* `OrderItem`: `orderId` (ObjectId ref `Order`), `productId` (ObjectId ref `Product`), `productName`: String (historical snapshot), `quantity`: Number, `price`: Number (historical price snapshot)

---

## Security & Validation

* **Password Security**: Passwords are encrypted using bcryptjs with 10 salt rounds in a Mongoose pre-save hook. Passwords and hashes are excluded from all API outputs via `.select("-password")` or sanitizers.
* **Stateless Authentication**: Token payload contains only `{ id: user._id }`. Role and account active status are retrieved fresh from the database on every authenticated request.
* **Deactivated / Deleted Account Rejection**: Inactive accounts are blocked at login and their previously issued tokens are rejected with HTTP 401.
* **Ownership Isolation**: Customer endpoints derive identity strictly from `req.user._id`. Attempts to pass rogue `userId`, `cartId`, `price`, or `totalAmount` in request bodies are ignored. Accessing other customers' carts or orders returns HTTP 404.
* **Safe Status Transitions & Whitelisting**: Status updates accept only defined enum values; field-tampering payloads attempting to modify order ownership or totals are discarded.
* **Self & Peer Protection**: Super Admin accounts cannot be deleted, deactivated, or demoted by themselves or other Super Admins.
