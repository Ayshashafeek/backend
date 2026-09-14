/**
 * tests/adminOperations.test.js
 *
 * Test suite for:
 *   - Operational capabilities of an ordinary Admin:
 *     - Products CRUD
 *     - Categories CRUD
 *     - Inventory overview, filtering, and stock updates
 *     - Orders inspection and status updates
 *     - Customer profile inspection and activation/deactivation
 *     - Rentals management (creation, listing, status transitions)
 *     - Reviews moderation (listing, approval/rejection, deletion)
 *     - Coupons management (creation, update, deletion, toggling, validation)
 *     - Business analytics dashboard
 *   - Security restrictions on ordinary Admin:
 *     - Cannot create another Admin
 *     - Cannot delete Super Admin
 *     - Cannot modify Super Admin
 *     - Cannot promote themselves to Super Admin
 *     - Cannot perform Super Admin-only operations
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const app = require("../app");
const User = require("../models/User");
const Category = require("../models/Category");
const Product = require("../models/Product");
const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const Rental = require("../models/Rental");
const Review = require("../models/Review");
const Coupon = require("../models/Coupon");

let mongod;
const TEST_PASSWORD = "password123";

let superadminToken, adminToken, staffToken, customerToken;
let superadminId, adminId, staffId, customerId;
let testCategoryId, testProductId, testOrderId;

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

const loginUser = async (credentials) => {
  const res = await request(app).post("/api/auth/login").send(credentials);
  return res.body.token;
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  process.env.JWT_SECRET = "test-jwt-secret-for-testing-only";
  process.env.JWT_EXPIRES_IN = "1d";

  // Create base users
  const sa = await User.create({
    name: "Master SuperAdmin",
    username: "superadmin_user",
    password: TEST_PASSWORD,
    role: "superadmin",
  });
  superadminId = sa._id.toString();

  const admin = await User.create({
    name: "Operations Admin",
    username: "operations_admin",
    password: TEST_PASSWORD,
    role: "admin",
  });
  adminId = admin._id.toString();

  const staff = await User.create({
    name: "Store Staff",
    username: "store_staff",
    password: TEST_PASSWORD,
    role: "staff",
  });
  staffId = staff._id.toString();

  const customer = await User.create({
    name: "Loyal Customer",
    email: "customer_user@example.com",
    password: TEST_PASSWORD,
    role: "customer",
  });
  customerId = customer._id.toString();

  // Login tokens
  superadminToken = await loginUser({ username: "superadmin_user", password: TEST_PASSWORD });
  adminToken = await loginUser({ username: "operations_admin", password: TEST_PASSWORD });
  staffToken = await loginUser({ username: "store_staff", password: TEST_PASSWORD });
  customerToken = await loginUser({ email: "customer_user@example.com", password: TEST_PASSWORD });

  // Seed category & product
  const cat = await Category.create({ name: "Gold Rings", description: "Fine gold jewellery" });
  testCategoryId = cat._id.toString();

  const prod = await Product.create({
    name: "22K Gold Solitaire Ring",
    description: "Handcrafted 22K gold ring with diamond",
    price: 45000,
    stock: 8,
    category: testCategoryId,
  });
  testProductId = prod._id.toString();

  // Seed order
  const ord = await Order.create({
    userId: customerId,
    totalAmount: 45000,
    shippingAddress: { street: "123 Marine Drive", city: "Mumbai", state: "MH", pincode: "400001" },
    phone: "9876543210",
    orderStatus: "Order Placed",
  });
  testOrderId = ord._id.toString();

  await OrderItem.create({
    orderId: testOrderId,
    productId: testProductId,
    productName: prod.name,
    quantity: 1,
    price: 45000,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

// =============================================================================
// 1. PRODUCT MANAGEMENT (Admin)
// =============================================================================
describe("Admin: Product Management", () => {
  let createdProductId;

  test("Admin can create a product", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(authHeader(adminToken))
      .send({
        name: "Platinum Bracelet",
        description: "Solid 950 platinum chain",
        price: 60000,
        stock: 5,
        category: testCategoryId,
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Platinum Bracelet");
    createdProductId = res.body._id;
  });

  test("Admin can update a product", async () => {
    const res = await request(app)
      .put(`/api/products/${createdProductId}`)
      .set(authHeader(adminToken))
      .send({ price: 65000 });

    expect(res.status).toBe(200);
    expect(res.body.price).toBe(65000);
  });

  test("Admin can delete a product", async () => {
    const res = await request(app)
      .delete(`/api/products/${createdProductId}`)
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });
});

// =============================================================================
// 2. CATEGORY MANAGEMENT (Admin)
// =============================================================================
describe("Admin: Category Management", () => {
  let createdCatId;

  test("Admin can create a category", async () => {
    const res = await request(app)
      .post("/api/categories")
      .set(authHeader(adminToken))
      .send({ name: "Silver Anklets", description: "Traditional silver jewellery" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Silver Anklets");
    createdCatId = res.body._id;
  });

  test("Admin can update a category", async () => {
    const res = await request(app)
      .put(`/api/categories/${createdCatId}`)
      .set(authHeader(adminToken))
      .send({ name: "Silver Payals", description: "Handmade payals" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Silver Payals");
  });

  test("Admin can delete a category", async () => {
    const res = await request(app)
      .delete(`/api/categories/${createdCatId}`)
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });
});

// =============================================================================
// 3. INVENTORY MANAGEMENT (Admin)
// =============================================================================
describe("Admin: Inventory Management", () => {
  test("Admin can get inventory summary & product stock levels", async () => {
    const res = await request(app)
      .get("/api/admin/inventory")
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.totalProducts).toBeGreaterThan(0);
    expect(Array.isArray(res.body.inventory)).toBe(true);
  });

  test("Admin can filter low-stock products", async () => {
    const res = await request(app)
      .get("/api/admin/inventory?lowStock=true&threshold=10")
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.inventory)).toBe(true);
  });

  test("Admin can set product stock directly", async () => {
    const res = await request(app)
      .patch(`/api/admin/inventory/${testProductId}`)
      .set(authHeader(adminToken))
      .send({ stock: 25 });

    expect(res.status).toBe(200);
    expect(res.body.product.stock).toBe(25);
  });

  test("Admin can adjust product stock (increment/decrement)", async () => {
    const res = await request(app)
      .patch(`/api/admin/inventory/${testProductId}`)
      .set(authHeader(adminToken))
      .send({ adjustment: -5 });

    expect(res.status).toBe(200);
    expect(res.body.product.stock).toBe(20);
  });

  test("Negative stock adjustment is rejected with 400", async () => {
    const res = await request(app)
      .patch(`/api/admin/inventory/${testProductId}`)
      .set(authHeader(adminToken))
      .send({ adjustment: -100 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/negative stock/i);
  });
});

// =============================================================================
// 4. ORDER MANAGEMENT (Admin)
// =============================================================================
describe("Admin: Order Management", () => {
  test("Admin can view all customer orders", async () => {
    const res = await request(app)
      .get("/api/admin/orders")
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.orders).toBeDefined();
    expect(Array.isArray(res.body.orders)).toBe(true);
    expect(res.body.orders.length).toBeGreaterThan(0);
  });

  test("Admin can view single order by ID with line items", async () => {
    const res = await request(app)
      .get(`/api/admin/orders/${testOrderId}`)
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.order).toBeDefined();
    expect(res.body.order._id).toBe(testOrderId);
    expect(res.body.order.items.length).toBe(1);
    expect(res.body.order.userId.email).toBe("customer_user@example.com");
  });

  test("Admin can update order status", async () => {
    const res = await request(app)
      .put(`/api/admin/orders/${testOrderId}/status`)
      .set(authHeader(adminToken))
      .send({ orderStatus: "Confirmed" });

    expect(res.status).toBe(200);
    expect(res.body.order.orderStatus).toBe("Confirmed");
  });
});

// =============================================================================
// 5. CUSTOMER MANAGEMENT (Admin)
// =============================================================================
describe("Admin: Customer Management", () => {
  test("Admin can list all customers", async () => {
    const res = await request(app)
      .get("/api/admin/customers")
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((c) => c._id === customerId)).toBe(true);
  });

  test("Admin can view single customer profile and stats", async () => {
    const res = await request(app)
      .get(`/api/admin/customers/${customerId}`)
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.customer).toBeDefined();
    expect(res.body.customer.email).toBe("customer_user@example.com");
    expect(res.body.stats.totalOrders).toBe(1);
  });

  test("Admin can deactivate a customer account", async () => {
    const res = await request(app)
      .patch(`/api/admin/customers/${customerId}/status`)
      .set(authHeader(adminToken))
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.customer.isActive).toBe(false);

    // Verify customer token is now rejected
    const checkAuth = await request(app)
      .get("/api/customer/profile")
      .set(authHeader(customerToken));
    expect(checkAuth.status).toBe(401);
  });

  test("Admin can reactivate a customer account", async () => {
    const res = await request(app)
      .patch(`/api/admin/customers/${customerId}/status`)
      .set(authHeader(adminToken))
      .send({ isActive: true });

    expect(res.status).toBe(200);
    expect(res.body.customer.isActive).toBe(true);

    // Verify customer token works again
    const checkAuth = await request(app)
      .get("/api/customer/profile")
      .set(authHeader(customerToken));
    expect(checkAuth.status).toBe(200);
  });
});

// =============================================================================
// 6. RENTAL MANAGEMENT (Admin & Customer)
// =============================================================================
describe("Rental Management", () => {
  let createdRentalId;

  test("Customer can request a rental booking", async () => {
    const startDate = new Date();
    const endDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const res = await request(app)
      .post("/api/rentals")
      .set(authHeader(customerToken))
      .send({
        productId: testProductId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        notes: "For wedding event",
      });

    expect(res.status).toBe(201);
    expect(res.body.rental).toBeDefined();
    expect(res.body.rental.status).toBe("Pending");
    createdRentalId = res.body.rental._id;
  });

  test("Customer can view their own rentals", async () => {
    const res = await request(app)
      .get("/api/rentals/my")
      .set(authHeader(customerToken));

    expect(res.status).toBe(200);
    expect(res.body.rentals.length).toBeGreaterThan(0);
  });

  test("Admin can list all rentals", async () => {
    const res = await request(app)
      .get("/api/admin/rentals")
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rentals)).toBe(true);
  });

  test("Admin can update rental status to Approved and Active", async () => {
    const res = await request(app)
      .patch(`/api/admin/rentals/${createdRentalId}/status`)
      .set(authHeader(adminToken))
      .send({ status: "Approved" });

    expect(res.status).toBe(200);
    expect(res.body.rental.status).toBe("Approved");
  });

  test("Admin can create a rental directly", async () => {
    const startDate = new Date();
    const endDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

    const res = await request(app)
      .post("/api/admin/rentals")
      .set(authHeader(adminToken))
      .send({
        customerId,
        productId: testProductId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        rentalFee: 3000,
        depositAmount: 10000,
        notes: "VIP Customer rental",
      });

    expect(res.status).toBe(201);
    expect(res.body.rental.rentalFee).toBe(3000);
    expect(res.body.rental.status).toBe("Approved");
  });
});

// =============================================================================
// 7. REVIEW MANAGEMENT (Customer & Admin)
// =============================================================================
describe("Review Management", () => {
  let createdReviewId;

  test("Customer can submit a review for a product", async () => {
    const res = await request(app)
      .post(`/api/reviews/product/${testProductId}`)
      .set(authHeader(customerToken))
      .send({
        rating: 5,
        comment: "Magnificent craftsmanship and stunning diamond clarity!",
      });

    expect(res.status).toBe(201);
    expect(res.body.review.rating).toBe(5);
    createdReviewId = res.body.review._id;
  });

  test("Public can view product reviews", async () => {
    const res = await request(app).get(`/api/reviews/product/${testProductId}`);

    expect(res.status).toBe(200);
    expect(res.body.totalReviews).toBeGreaterThan(0);
    expect(res.body.averageRating).toBe(5);
  });

  test("Admin can list all reviews across products", async () => {
    const res = await request(app)
      .get("/api/admin/reviews")
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.reviews)).toBe(true);
  });

  test("Admin can moderate review status", async () => {
    const res = await request(app)
      .patch(`/api/admin/reviews/${createdReviewId}/status`)
      .set(authHeader(adminToken))
      .send({ status: "Approved" });

    expect(res.status).toBe(200);
    expect(res.body.review.status).toBe("Approved");
  });

  test("Admin can delete an inappropriate review", async () => {
    const res = await request(app)
      .delete(`/api/admin/reviews/${createdReviewId}`)
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });
});

// =============================================================================
// 8. COUPON MANAGEMENT (Admin & Customer)
// =============================================================================
describe("Coupon Management", () => {
  let createdCouponId;

  test("Admin can create a discount coupon", async () => {
    const res = await request(app)
      .post("/api/admin/coupons")
      .set(authHeader(adminToken))
      .send({
        code: "DIWALI20",
        discountType: "percentage",
        discountValue: 20,
        minOrderAmount: 10000,
        maxDiscount: 5000,
      });

    expect(res.status).toBe(201);
    expect(res.body.coupon.code).toBe("DIWALI20");
    expect(res.body.coupon.discountValue).toBe(20);
    createdCouponId = res.body.coupon._id;
  });

  test("Admin can list all coupons", async () => {
    const res = await request(app)
      .get("/api/admin/coupons")
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.coupons)).toBe(true);
  });

  test("Customer can validate an active coupon", async () => {
    const res = await request(app)
      .post("/api/coupons/validate")
      .send({
        code: "DIWALI20",
        orderAmount: 20000,
      });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.discountAmount).toBe(4000); // 20% of 20000 = 4000
    expect(res.body.finalAmount).toBe(16000);
  });

  test("Admin can toggle coupon active status", async () => {
    const res = await request(app)
      .patch(`/api/admin/coupons/${createdCouponId}/status`)
      .set(authHeader(adminToken))
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.coupon.isActive).toBe(false);

    // Validation now fails for inactive coupon
    const valRes = await request(app)
      .post("/api/coupons/validate")
      .send({ code: "DIWALI20", orderAmount: 20000 });
    expect(valRes.status).toBe(404);
  });

  test("Admin can delete coupon", async () => {
    const res = await request(app)
      .delete(`/api/admin/coupons/${createdCouponId}`)
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });
});

// =============================================================================
// 9. OPERATIONAL DASHBOARD (Admin)
// =============================================================================
describe("Admin: Operational Dashboard", () => {
  test("Admin can view operational analytics and business metrics", async () => {
    const res = await request(app)
      .get("/api/admin/dashboard")
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.revenue).toBeDefined();
    expect(res.body.orders).toBeDefined();
    expect(res.body.customers).toBeDefined();
    expect(res.body.inventory).toBeDefined();
    expect(res.body.rentals).toBeDefined();
    expect(res.body.coupons).toBeDefined();
  });
});

// =============================================================================
// 10. STRICT SECURITY RESTRICTIONS ON ORDINARY ADMIN
// =============================================================================
describe("Strict Security Boundaries: Admin CANNOT Perform Super Admin Actions", () => {
  test("Admin CANNOT create another Admin account (forced to staff)", async () => {
    const res = await request(app)
      .post("/api/admin/create")
      .set(authHeader(adminToken))
      .send({
        name: "Attempted Admin",
        username: "attemptedadmin",
        password: TEST_PASSWORD,
        role: "admin",
      });

    // Per existing test and security model, an Admin can never create an Admin; role is staff
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("staff");
  });

  test("Admin CANNOT delete the Super Admin account (403 Forbidden)", async () => {
    const res = await request(app)
      .delete(`/api/admin/users/${superadminId}`)
      .set(authHeader(adminToken));

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/permission/i);
  });

  test("Admin CANNOT change or modify the Super Admin profile (403 Forbidden)", async () => {
    const res = await request(app)
      .put(`/api/admin/users/${superadminId}`)
      .set(authHeader(adminToken))
      .send({ name: "Hacked SuperAdmin" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/permission/i);
  });

  test("Admin CANNOT change or modify the Super Admin status (403 Forbidden)", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${superadminId}/status`)
      .set(authHeader(adminToken))
      .send({ isActive: false });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/permission/i);
  });

  test("Admin CANNOT reset the Super Admin password (403 Forbidden)", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${superadminId}/password`)
      .set(authHeader(adminToken))
      .send({ newPassword: "newpassword123" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/permission/i);
  });

  test("Admin CANNOT promote themselves to Super Admin (403 Forbidden)", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${adminId}/role`)
      .set(authHeader(adminToken))
      .send({ role: "superadmin" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/permission/i);
  });

  test("Admin CANNOT access Super Admin-only endpoints (/admins, /staff, /users/:id)", async () => {
    const resAdmins = await request(app)
      .get("/api/admin/admins")
      .set(authHeader(adminToken));
    expect(resAdmins.status).toBe(403);

    const resStaff = await request(app)
      .get("/api/admin/staff")
      .set(authHeader(adminToken));
    expect(resStaff.status).toBe(403);

    const resUser = await request(app)
      .get(`/api/admin/users/${staffId}`)
      .set(authHeader(adminToken));
    expect(resUser.status).toBe(403);
  });
});
