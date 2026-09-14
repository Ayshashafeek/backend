/**
 * tests/staffOperations.test.js
 *
 * Comprehensive test suite for the Staff Module in the 4-tier system:
 *   - Operational execution capabilities of Staff:
 *     - Task dashboard
 *     - Order fulfillment queue and packing slips
 *     - Order dispatch (with courier and tracking number) and delivery
 *     - Rental handover (Approved -> Active) and return inspection (Active -> Returned)
 *     - Read-only inventory inspection
 *     - Customer support lookup
 *   - Security restrictions on Staff:
 *     - Staff cannot access Admin revenue dashboard (403)
 *     - Staff cannot manage coupons (403)
 *     - Staff cannot access Admin customer management (403)
 *     - Staff cannot access User management (403)
 *     - Customer cannot access Staff endpoints (403)
 *     - Unauthenticated access is blocked (401)
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

let mongod;
const TEST_PASSWORD = "password123";

let superadminToken, adminToken, staffToken, customerToken;
let staffId, customerId, testProductId, testOrderId, testRentalId;

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

  // Create users
  await User.create({
    name: "Staff SuperAdmin",
    username: "staff_test_sa",
    password: TEST_PASSWORD,
    role: "superadmin",
  });

  await User.create({
    name: "Staff Admin",
    username: "staff_test_admin",
    password: TEST_PASSWORD,
    role: "admin",
  });

  const staff = await User.create({
    name: "Fulfillment Associate",
    username: "staff_worker",
    password: TEST_PASSWORD,
    role: "staff",
  });
  staffId = staff._id.toString();

  const customer = await User.create({
    name: "Regular Shopper",
    email: "shopper@example.com",
    password: TEST_PASSWORD,
    phone: "9123456780",
    role: "customer",
    address: { street: "10 MG Road", city: "Bangalore", state: "KA", pincode: "560001" },
  });
  customerId = customer._id.toString();

  // Login tokens
  superadminToken = await loginUser({ username: "staff_test_sa", password: TEST_PASSWORD });
  adminToken = await loginUser({ username: "staff_test_admin", password: TEST_PASSWORD });
  staffToken = await loginUser({ username: "staff_worker", password: TEST_PASSWORD });
  customerToken = await loginUser({ email: "shopper@example.com", password: TEST_PASSWORD });

  // Category & Product
  const cat = await Category.create({ name: "Necklaces", description: "Gold & Diamond Necklaces" });
  const prod = await Product.create({
    name: "Kundan Choker Necklace",
    description: "Traditional royal kundan choker",
    price: 120000,
    stock: 4,
    category: cat._id,
  });
  testProductId = prod._id.toString();

  // Order
  const ord = await Order.create({
    userId: customerId,
    totalAmount: 120000,
    shippingAddress: customer.address,
    phone: customer.phone,
    orderStatus: "Processing",
  });
  testOrderId = ord._id.toString();

  await OrderItem.create({
    orderId: testOrderId,
    productId: testProductId,
    productName: prod.name,
    quantity: 1,
    price: 120000,
  });

  // Rental
  const rent = await Rental.create({
    customerId,
    productId: testProductId,
    startDate: new Date(),
    endDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
    rentalFee: 6000,
    depositAmount: 36000,
    status: "Approved",
    notes: "Approved by Admin for wedding event",
  });
  testRentalId = rent._id.toString();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

// =============================================================================
// 1. STAFF DASHBOARD
// =============================================================================
describe("Staff: Task Dashboard", () => {
  test("Staff can access operational task dashboard", async () => {
    const res = await request(app)
      .get("/api/staff/dashboard")
      .set(authHeader(staffToken));

    expect(res.status).toBe(200);
    expect(res.body.tasks).toBeDefined();
    expect(res.body.tasks.ordersToPackCount).toBeGreaterThanOrEqual(1);
    expect(res.body.tasks.rentalsToHandoverCount).toBeGreaterThanOrEqual(1);
    expect(res.body.tasks.lowStockCount).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// 2. ORDER FULFILLMENT & LOGISTICS
// =============================================================================
describe("Staff: Order Fulfillment Workflow", () => {
  test("Staff can view fulfillment queue", async () => {
    const res = await request(app)
      .get("/api/staff/orders/queue")
      .set(authHeader(staffToken));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.queue)).toBe(true);
    expect(res.body.queue.some((o) => o._id === testOrderId)).toBe(true);
  });

  test("Staff can view packing slip for an order", async () => {
    const res = await request(app)
      .get(`/api/staff/orders/${testOrderId}/packing-slip`)
      .set(authHeader(staffToken));

    expect(res.status).toBe(200);
    expect(res.body.packingSlip).toBeDefined();
    expect(res.body.packingSlip.recipient.phone).toBe("9123456780");
    expect(res.body.packingSlip.items.length).toBe(1);
    expect(res.body.packingSlip.items[0].productName).toBe("Kundan Choker Necklace");
  });

  test("Staff can dispatch order with courier and tracking number", async () => {
    const res = await request(app)
      .patch(`/api/staff/orders/${testOrderId}/dispatch`)
      .set(authHeader(staffToken))
      .send({
        courier: "BlueDart Express",
        trackingNumber: "BD-98234710",
      });

    expect(res.status).toBe(200);
    expect(res.body.order.orderStatus).toBe("Shipped");
    expect(res.body.order.courier).toBe("BlueDart Express");
    expect(res.body.order.trackingNumber).toBe("BD-98234710");
  });

  test("Staff can mark dispatched order as Delivered", async () => {
    const res = await request(app)
      .patch(`/api/staff/orders/${testOrderId}/deliver`)
      .set(authHeader(staffToken));

    expect(res.status).toBe(200);
    expect(res.body.order.orderStatus).toBe("Delivered");
  });
});

// =============================================================================
// 3. RENTAL COUNTER (HANDOVER & RETURN)
// =============================================================================
describe("Staff: Rental Counter Operations", () => {
  test("Staff can view rental handover & return queue", async () => {
    const res = await request(app)
      .get("/api/staff/rentals/queue")
      .set(authHeader(staffToken));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.queue)).toBe(true);
    expect(res.body.queue.some((r) => r._id === testRentalId)).toBe(true);
  });

  test("Staff can handover Approved jewellery to customer (status -> Active)", async () => {
    const res = await request(app)
      .patch(`/api/staff/rentals/${testRentalId}/handover`)
      .set(authHeader(staffToken))
      .send({ handoverNotes: "ID verified (Aadhaar Card). Jewellery handed to customer." });

    expect(res.status).toBe(200);
    expect(res.body.rental.status).toBe("Active");
  });

  test("Staff can process returned jewellery after physical inspection (status -> Returned)", async () => {
    const res = await request(app)
      .patch(`/api/staff/rentals/${testRentalId}/return`)
      .set(authHeader(staffToken))
      .send({ inspectionNotes: "All 28 stones verified intact. No damage." });

    expect(res.status).toBe(200);
    expect(res.body.rental.status).toBe("Returned");
  });
});

// =============================================================================
// 4. INVENTORY & CUSTOMER SUPPORT
// =============================================================================
describe("Staff: Inventory & Support Operations", () => {
  test("Staff can view read-only inventory list", async () => {
    const res = await request(app)
      .get("/api/staff/inventory")
      .set(authHeader(staffToken));

    expect(res.status).toBe(200);
    expect(res.body.totalProducts).toBeGreaterThan(0);
    expect(Array.isArray(res.body.inventory)).toBe(true);
  });

  test("Staff can lookup customer details by phone number", async () => {
    const res = await request(app)
      .get("/api/staff/customers/lookup?phone=9123456780")
      .set(authHeader(staffToken));

    expect(res.status).toBe(200);
    expect(res.body.customers.length).toBe(1);
    expect(res.body.customers[0].name).toBe("Regular Shopper");
    expect(res.body.customers[0].address.city).toBe("Bangalore");
  });

  test("Staff can lookup customer details by email", async () => {
    const res = await request(app)
      .get("/api/staff/customers/lookup?email=shopper@example.com")
      .set(authHeader(staffToken));

    expect(res.status).toBe(200);
    expect(res.body.customers.length).toBe(1);
  });
});

// =============================================================================
// 5. SECURITY & PERMISSION RESTRICTIONS ON STAFF
// =============================================================================
describe("Staff: Strict Security Boundaries", () => {
  test("Staff CANNOT access Admin revenue & business dashboard (403)", async () => {
    const res = await request(app)
      .get("/api/admin/dashboard")
      .set(authHeader(staffToken));

    expect(res.status).toBe(403);
  });

  test("Staff CANNOT access Coupon management (403)", async () => {
    const res = await request(app)
      .get("/api/admin/coupons")
      .set(authHeader(staffToken));

    expect(res.status).toBe(403);
  });

  test("Staff CANNOT access Admin customer management (403)", async () => {
    const res = await request(app)
      .get("/api/admin/customers")
      .set(authHeader(staffToken));

    expect(res.status).toBe(403);
  });

  test("Staff CANNOT access Super Admin user management (403)", async () => {
    const res = await request(app)
      .get("/api/admin/admins")
      .set(authHeader(staffToken));

    expect(res.status).toBe(403);
  });

  test("Staff CANNOT create new users (403)", async () => {
    const res = await request(app)
      .post("/api/admin/create")
      .set(authHeader(staffToken))
      .send({ name: "Rogue", username: "rogue", password: "password123" });

    expect(res.status).toBe(403);
  });

  test("Customer CANNOT access Staff endpoints (403)", async () => {
    const res = await request(app)
      .get("/api/staff/dashboard")
      .set(authHeader(customerToken));

    expect(res.status).toBe(403);
  });

  test("Unauthenticated requests to Staff endpoints return 401", async () => {
    const res = await request(app).get("/api/staff/dashboard");
    expect(res.status).toBe(401);
  });
});
