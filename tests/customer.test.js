/**
 * tests/customer.test.js
 *
 * Comprehensive integration tests for Customer Module:
 *   - Phase 1: Customer Profile (view, update, logout, validation, authorization, security)
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const app = require("../app");
const User = require("../models/User");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Cart = require("../models/Cart");
const CartItem = require("../models/CartItem");
const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");

let mongod;
const TEST_PASSWORD = "password123";

let customerToken;
let customer2Token;
let adminToken;
let staffToken;
let superadminToken;
let customerId;
let customer2Id;

let ringsCategory;
let necklacesCategory;
let goldRingProduct;
let silverRingProduct;
let diamondNecklaceProduct;
let pearlNecklaceProduct;

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

const loginUser = async (credentials) => {
  const res = await request(app).post("/api/auth/login").send(credentials);
  return res.body.token;
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  process.env.JWT_SECRET = "test-jwt-secret-for-customer-tests";
  process.env.JWT_EXPIRES_IN = "1d";

  // Create primary customer
  const customer = await User.create({
    name: "Customer One",
    email: "customer1@example.com",
    password: TEST_PASSWORD,
    role: "customer",
    phone: "1234567890",
    address: {
      street: "123 Main St",
      city: "Metropolis",
      state: "NY",
      pincode: "10001",
    },
  });
  customerId = customer._id.toString();

  // Create second customer for isolation testing
  const customer2 = await User.create({
    name: "Customer Two",
    email: "customer2@example.com",
    password: TEST_PASSWORD,
    role: "customer",
  });
  customer2Id = customer2._id.toString();

  // Create admin and superadmin
  await User.create({
    name: "Admin User",
    username: "adminuser",
    password: TEST_PASSWORD,
    role: "admin",
  });

  await User.create({
    name: "Super Admin User",
    username: "superadminuser",
    password: TEST_PASSWORD,
    role: "superadmin",
  });

  await User.create({
    name: "Staff User",
    username: "staffuser",
    password: TEST_PASSWORD,
    role: "staff",
  });

  customerToken = await loginUser({ email: "customer1@example.com", password: TEST_PASSWORD });
  customer2Token = await loginUser({ email: "customer2@example.com", password: TEST_PASSWORD });
  adminToken = await loginUser({ username: "adminuser", password: TEST_PASSWORD });
  staffToken = await loginUser({ username: "staffuser", password: TEST_PASSWORD });
  superadminToken = await loginUser({ username: "superadminuser", password: TEST_PASSWORD });

  // Seed Categories
  ringsCategory = await Category.create({
    name: "Rings",
    description: "Fine jewelry rings",
  });

  necklacesCategory = await Category.create({
    name: "Necklaces",
    description: "Elegant necklaces and pendants",
  });

  // Seed Products
  goldRingProduct = await Product.create({
    name: "Gold Ring",
    description: "Elegant 22k yellow gold wedding band",
    price: 15000,
    stock: 10,
    category: ringsCategory._id,
    available: true,
  });

  silverRingProduct = await Product.create({
    name: "Silver Ring",
    description: "Pure sterling silver minimalist ring",
    price: 2500,
    stock: 5,
    category: ringsCategory._id,
    available: true,
  });

  diamondNecklaceProduct = await Product.create({
    name: "Diamond Necklace",
    description: "Sparkling gold necklace with diamond pendant",
    price: 55000,
    stock: 3,
    category: necklacesCategory._id,
    available: true,
  });

  pearlNecklaceProduct = await Product.create({
    name: "Pearl Necklace",
    description: "Classic freshwater pearls",
    price: 12000,
    stock: 0,
    category: necklacesCategory._id,
    available: false,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("Phase 1: Customer Authentication & Profile", () => {
  describe("Registration & Login Checks", () => {
    test("customer registration creates user with phone and empty address default", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          name: "New Registered Customer",
          email: "newcustomer@example.com",
          password: "password123",
        });

      expect(res.status).toBe(201);
      expect(res.body.role).toBe("customer");
      expect(res.body.token).toBeDefined();

      const created = await User.findById(res.body._id);
      expect(created.phone).toBe("");
      expect(created.address.street).toBe("");
    });

    test("customer registration rejects duplicate email", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Duplicate Customer",
          email: "customer1@example.com",
          password: "password123",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already exists/i);
    });

    test("customer login fails with invalid password", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: "customer1@example.com",
          password: "wrongpassword",
        });

      expect(res.status).toBe(401);
    });

    test("inactive customer cannot log in", async () => {
      await User.create({
        name: "Inactive Customer",
        email: "inactivecust@example.com",
        password: TEST_PASSWORD,
        role: "customer",
        isActive: false,
      });

      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: "inactivecust@example.com",
          password: TEST_PASSWORD,
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/deactivated/i);
    });
  });

  describe("GET /api/customer/profile", () => {
    test("unauthenticated request returns 401", async () => {
      const res = await request(app).get("/api/customer/profile");
      expect(res.status).toBe(401);
    });

    test("admin or superadmin cannot access customer profile (restricted to customer)", async () => {
      const adminRes = await request(app)
        .get("/api/customer/profile")
        .set(authHeader(adminToken));
      expect(adminRes.status).toBe(403);

      const saRes = await request(app)
        .get("/api/customer/profile")
        .set(authHeader(superadminToken));
      expect(saRes.status).toBe(403);
    });

    test("customer can fetch own profile with phone and address, password omitted", async () => {
      const res = await request(app)
        .get("/api/customer/profile")
        .set(authHeader(customerToken));

      expect(res.status).toBe(200);
      expect(res.body._id).toBe(customerId);
      expect(res.body.name).toBe("Customer One");
      expect(res.body.email).toBe("customer1@example.com");
      expect(res.body.phone).toBe("1234567890");
      expect(res.body.address.street).toBe("123 Main St");
      expect(res.body.address.city).toBe("Metropolis");
      expect(res.body.role).toBe("customer");
      expect(res.body.password).toBeUndefined();
    });
  });

  describe("PUT /api/customer/profile", () => {
    test("unauthenticated request returns 401", async () => {
      const res = await request(app)
        .put("/api/customer/profile")
        .send({ name: "Hacker" });
      expect(res.status).toBe(401);
    });

    test("customer can update own name, phone, and delivery address", async () => {
      const res = await request(app)
        .put("/api/customer/profile")
        .set(authHeader(customerToken))
        .send({
          name: "Customer One Updated",
          phone: "9876543210",
          address: {
            street: "456 Oak Avenue",
            city: "Gotham",
            state: "NJ",
            pincode: "07001",
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Customer One Updated");
      expect(res.body.phone).toBe("9876543210");
      expect(res.body.address.street).toBe("456 Oak Avenue");
      expect(res.body.address.city).toBe("Gotham");
      expect(res.body.address.state).toBe("NJ");
      expect(res.body.address.pincode).toBe("07001");
      expect(res.body.password).toBeUndefined();
    });

    test("customer can update email if not taken by another user", async () => {
      const res = await request(app)
        .put("/api/customer/profile")
        .set(authHeader(customerToken))
        .send({
          email: "customer1.new@example.com",
        });

      expect(res.status).toBe(200);
      expect(res.body.email).toBe("customer1.new@example.com");

      // Reset email back for remaining tests
      await request(app)
        .put("/api/customer/profile")
        .set(authHeader(customerToken))
        .send({ email: "customer1@example.com" });
    });

    test("rejects email update if email is already used by another account", async () => {
      const res = await request(app)
        .put("/api/customer/profile")
        .set(authHeader(customerToken))
        .send({
          email: "customer2@example.com",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already in use/i);
    });

    test("rejects empty name update", async () => {
      const res = await request(app)
        .put("/api/customer/profile")
        .set(authHeader(customerToken))
        .send({ name: "   " });

      expect(res.status).toBe(400);
    });

    test("tampering with role, isActive, or password in body is ignored / protected", async () => {
      const res = await request(app)
        .put("/api/customer/profile")
        .set(authHeader(customerToken))
        .send({
          role: "superadmin",
          isActive: false,
          password: "newhackedpassword",
        });

      expect(res.status).toBe(200);
      expect(res.body.role).toBe("customer");
      expect(res.body.isActive).toBe(true);
      expect(res.body.password).toBeUndefined();

      // Verify DB state
      const dbUser = await User.findById(customerId);
      expect(dbUser.role).toBe("customer");
      expect(dbUser.isActive).toBe(true);
      // Password must still be the original hashed password
      const match = await dbUser.matchPassword(TEST_PASSWORD);
      expect(match).toBe(true);
    });

    test("customer cannot modify another customer's profile", async () => {
      // customer2 updates their profile
      await request(app)
        .put("/api/customer/profile")
        .set(authHeader(customer2Token))
        .send({ name: "Customer Two Modified" });

      // Check customer1 profile remained unchanged
      const res = await request(app)
        .get("/api/customer/profile")
        .set(authHeader(customerToken));

      expect(res.body.name).toBe("Customer One Updated");
    });
  });

  describe("POST /api/customer/logout", () => {
    test("unauthenticated request returns 401", async () => {
      const res = await request(app).post("/api/customer/logout");
      expect(res.status).toBe(401);
    });

    test("customer logout returns 200 with success message", async () => {
      const res = await request(app)
        .post("/api/customer/logout")
        .set(authHeader(customerToken));

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/logged out/i);
    });
  });
});

describe("Phase 2: Product Browsing Enhancements", () => {
  describe("A. Existing Behavior", () => {
    test("GET /api/products returns all products with populated category name", async () => {
      const res = await request(app).get("/api/products");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(4);
      expect(res.body[0].category.name).toBeDefined();
    });

    test("GET /api/products?category=<id> filters by category", async () => {
      const res = await request(app).get(`/api/products?category=${ringsCategory._id}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      expect(res.body.every((p) => p.category._id.toString() === ringsCategory._id.toString())).toBe(true);
    });

    test("GET /api/products?category=invalid-id returns 400 Bad Request", async () => {
      const res = await request(app).get("/api/products?category=not-an-id");
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid category id/i);
    });

    test("GET /api/products/:id returns single product details", async () => {
      const res = await request(app).get(`/api/products/${goldRingProduct._id}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Gold Ring");
      expect(res.body.category.name).toBe("Rings");
    });

    test("GET /api/products/:id with non-existent ID returns 404", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/api/products/${nonExistentId}`);
      expect(res.status).toBe(404);
    });
  });

  describe("B. Search Filter", () => {
    test("search by product name", async () => {
      const res = await request(app).get("/api/products?search=Ring");
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      const names = res.body.map((p) => p.name);
      expect(names).toContain("Gold Ring");
      expect(names).toContain("Silver Ring");
    });

    test("search by product description", async () => {
      const res = await request(app).get("/api/products?search=wedding%20band");
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe("Gold Ring");
    });

    test("case-insensitive search", async () => {
      const res = await request(app).get("/api/products?search=dIaMoNd");
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe("Diamond Necklace");
    });

    test("no-match search returns empty array", async () => {
      const res = await request(app).get("/api/products?search=RubyEmeraldSapphire");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("C. Price Range Filter", () => {
    test("filter by minPrice", async () => {
      const res = await request(app).get("/api/products?minPrice=15000");
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      expect(res.body.every((p) => p.price >= 15000)).toBe(true);
    });

    test("filter by maxPrice", async () => {
      const res = await request(app).get("/api/products?maxPrice=12000");
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      expect(res.body.every((p) => p.price <= 12000)).toBe(true);
    });

    test("filter by minPrice and maxPrice", async () => {
      const res = await request(app).get("/api/products?minPrice=3000&maxPrice=20000");
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      const names = res.body.map((p) => p.name);
      expect(names).toContain("Gold Ring");
      expect(names).toContain("Pearl Necklace");
    });

    test("invalid non-numeric minPrice returns 400", async () => {
      const res = await request(app).get("/api/products?minPrice=abc");
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/minPrice/i);
    });

    test("invalid negative maxPrice returns 400", async () => {
      const res = await request(app).get("/api/products?maxPrice=-50");
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/maxPrice/i);
    });

    test("minPrice greater than maxPrice returns 400", async () => {
      const res = await request(app).get("/api/products?minPrice=50000&maxPrice=1000");
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/greater than/i);
    });
  });

  describe("D. Availability Filter", () => {
    test("filter by available=true returns only available products", async () => {
      const res = await request(app).get("/api/products?available=true");
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(3);
      expect(res.body.every((p) => p.available === true)).toBe(true);
    });

    test("filter by available=false returns only unavailable products", async () => {
      const res = await request(app).get("/api/products?available=false");
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe("Pearl Necklace");
      expect(res.body[0].available).toBe(false);
    });

    test("invalid availability value returns 400", async () => {
      const res = await request(app).get("/api/products?available=maybe");
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/available must be true or false/i);
    });
  });

  describe("E. Sorting", () => {
    test("sort by price_asc orders products lowest to highest price", async () => {
      const res = await request(app).get("/api/products?sort=price_asc");
      expect(res.status).toBe(200);
      expect(res.body[0].name).toBe("Silver Ring"); // 2500
      expect(res.body[res.body.length - 1].name).toBe("Diamond Necklace"); // 55000
    });

    test("sort by price_desc orders products highest to lowest price", async () => {
      const res = await request(app).get("/api/products?sort=price_desc");
      expect(res.status).toBe(200);
      expect(res.body[0].name).toBe("Diamond Necklace"); // 55000
      expect(res.body[res.body.length - 1].name).toBe("Silver Ring"); // 2500
    });

    test("sort by newest orders products by createdAt descending", async () => {
      const res = await request(app).get("/api/products?sort=newest");
      expect(res.status).toBe(200);
      for (let i = 0; i < res.body.length - 1; i++) {
        expect(new Date(res.body[i].createdAt).getTime()).toBeGreaterThanOrEqual(
          new Date(res.body[i + 1].createdAt).getTime()
        );
      }
    });

    test("invalid sort value returns 400", async () => {
      const res = await request(app).get("/api/products?sort=popularity");
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid sort option/i);
    });
  });

  describe("F. Combined Filtering", () => {
    test("search + category filter", async () => {
      const res = await request(app).get(
        `/api/products?search=ring&category=${ringsCategory._id}`
      );
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
    });

    test("category + price range", async () => {
      const res = await request(app).get(
        `/api/products?category=${ringsCategory._id}&minPrice=5000`
      );
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe("Gold Ring");
    });

    test("search + price range + availability", async () => {
      const res = await request(app).get(
        "/api/products?search=gold&minPrice=10000&maxPrice=60000&available=true"
      );
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      const names = res.body.map((p) => p.name);
      expect(names).toContain("Gold Ring");
      expect(names).toContain("Diamond Necklace");
    });

    test("all filters combined (search + category + minPrice + maxPrice + available + sort)", async () => {
      const res = await request(app).get(
        `/api/products?search=ring&category=${ringsCategory._id}&minPrice=1000&maxPrice=20000&available=true&sort=price_asc`
      );
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      expect(res.body[0].name).toBe("Silver Ring");
      expect(res.body[1].name).toBe("Gold Ring");
    });
  });

  describe("G. Authorization Regression", () => {
    test("unauthenticated user can browse products", async () => {
      const res = await request(app).get("/api/products");
      expect(res.status).toBe(200);
    });

    test("customer can browse products", async () => {
      const res = await request(app)
        .get("/api/products")
        .set(authHeader(customerToken));
      expect(res.status).toBe(200);
    });

    test("customer cannot create product (403)", async () => {
      const res = await request(app)
        .post("/api/products")
        .set(authHeader(customerToken))
        .send({
          name: "Customer Created Ring",
          price: 1000,
          category: ringsCategory._id,
        });
      expect(res.status).toBe(403);
    });

    test("customer cannot update product (403)", async () => {
      const res = await request(app)
        .put(`/api/products/${goldRingProduct._id}`)
        .set(authHeader(customerToken))
        .send({ price: 10 });
      expect(res.status).toBe(403);
    });

    test("customer cannot delete product (403)", async () => {
      const res = await request(app)
        .delete(`/api/products/${goldRingProduct._id}`)
        .set(authHeader(customerToken));
      expect(res.status).toBe(403);
    });

    test("admin can create product (201)", async () => {
      const res = await request(app)
        .post("/api/products")
        .set(authHeader(adminToken))
        .send({
          name: "Admin Created Bracelet",
          description: "Fine gold bracelet",
          price: 22000,
          stock: 4,
          category: ringsCategory._id,
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Admin Created Bracelet");

      // Clean up
      await Product.findByIdAndDelete(res.body._id);
    });
  });
});

describe("Phase 3: Customer Cart Module", () => {
  let createdCartItemId;
  let customer2CartItemId;

  describe("A. Empty Cart", () => {
    test("authenticated customer can GET cart and receives empty cart structure", async () => {
      const res = await request(app)
        .get("/api/cart")
        .set(authHeader(customerToken));

      expect(res.status).toBe(200);
      expect(res.body.cart).toBeDefined();
      expect(res.body.cart.items).toEqual([]);
      expect(res.body.cart.totalQuantity).toBe(0);
      expect(res.body.cart.totalAmount).toBe(0);
    });
  });

  describe("B. Add Item", () => {
    test("add valid product to cart with backend price calculation", async () => {
      const res = await request(app)
        .post("/api/cart/items")
        .set(authHeader(customerToken))
        .send({
          productId: goldRingProduct._id,
          quantity: 2,
        });

      expect(res.status).toBe(201);
      expect(res.body.cart).toBeDefined();
      expect(res.body.cart.items.length).toBe(1);

      const item = res.body.cart.items[0];
      createdCartItemId = item._id;
      expect(item.product.name).toBe("Gold Ring");
      expect(item.quantity).toBe(2);
      expect(item.price).toBe(15000);
      expect(item.subtotal).toBe(30000);
      expect(res.body.cart.totalQuantity).toBe(2);
      expect(res.body.cart.totalAmount).toBe(30000);
    });
  });

  describe("C. Add Same Product", () => {
    test("adding same product again increases quantity and recalculates totals without duplicates", async () => {
      const res = await request(app)
        .post("/api/cart/items")
        .set(authHeader(customerToken))
        .send({
          productId: goldRingProduct._id,
          quantity: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.cart.items.length).toBe(1); // No duplicate cart item

      const item = res.body.cart.items[0];
      expect(item.quantity).toBe(3);
      expect(item.subtotal).toBe(45000);
      expect(res.body.cart.totalQuantity).toBe(3);
      expect(res.body.cart.totalAmount).toBe(45000);
    });
  });

  describe("D. Quantity Validation", () => {
    test("quantity 0 returns 400", async () => {
      const res = await request(app)
        .post("/api/cart/items")
        .set(authHeader(customerToken))
        .send({
          productId: silverRingProduct._id,
          quantity: 0,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/quantity/i);
    });

    test("negative quantity returns 400", async () => {
      const res = await request(app)
        .post("/api/cart/items")
        .set(authHeader(customerToken))
        .send({
          productId: silverRingProduct._id,
          quantity: -3,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/quantity/i);
    });

    test("decimal quantity returns 400", async () => {
      const res = await request(app)
        .post("/api/cart/items")
        .set(authHeader(customerToken))
        .send({
          productId: silverRingProduct._id,
          quantity: 1.5,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/positive integer/i);
    });

    test("quantity greater than available stock returns 400", async () => {
      // silverRingProduct stock is 5
      const res = await request(app)
        .post("/api/cart/items")
        .set(authHeader(customerToken))
        .send({
          productId: silverRingProduct._id,
          quantity: 999,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/exceeds available stock/i);
    });

    test("combined existing quantity plus new quantity exceeding stock returns 400", async () => {
      // goldRingProduct stock is 10, current in cart is 3. Adding 8 would make 11 > 10
      const res = await request(app)
        .post("/api/cart/items")
        .set(authHeader(customerToken))
        .send({
          productId: goldRingProduct._id,
          quantity: 8,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/exceeds available stock/i);
    });
  });

  describe("E. Product Validation", () => {
    test("invalid productId returns 400", async () => {
      const res = await request(app)
        .post("/api/cart/items")
        .set(authHeader(customerToken))
        .send({
          productId: "invalid-object-id",
          quantity: 1,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/valid productid/i);
    });

    test("non-existent productId returns 404", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post("/api/cart/items")
        .set(authHeader(customerToken))
        .send({
          productId: nonExistentId,
          quantity: 1,
        });

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/product not found/i);
    });

    test("unavailable product cannot be added to cart returns 400", async () => {
      // pearlNecklaceProduct available is false
      const res = await request(app)
        .post("/api/cart/items")
        .set(authHeader(customerToken))
        .send({
          productId: pearlNecklaceProduct._id,
          quantity: 1,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/unavailable/i);
    });
  });

  describe("F. Update Item", () => {
    test("valid quantity update recalculates subtotal and cart total", async () => {
      const res = await request(app)
        .put(`/api/cart/items/${createdCartItemId}`)
        .set(authHeader(customerToken))
        .send({ quantity: 4 });

      expect(res.status).toBe(200);
      const item = res.body.cart.items.find((i) => i._id.toString() === createdCartItemId.toString());
      expect(item.quantity).toBe(4);
      expect(item.subtotal).toBe(60000); // 4 * 15000
      expect(res.body.cart.totalAmount).toBe(60000);
      expect(res.body.cart.totalQuantity).toBe(4);
    });

    test("cannot update another customer's cart item returns 403", async () => {
      // customer2 creates a cart item
      const addRes = await request(app)
        .post("/api/cart/items")
        .set(authHeader(customer2Token))
        .send({
          productId: silverRingProduct._id,
          quantity: 1,
        });
      customer2CartItemId = addRes.body.cart.items[0]._id;

      // customer1 tries to update customer2's cart item
      const res = await request(app)
        .put(`/api/cart/items/${customer2CartItemId}`)
        .set(authHeader(customerToken))
        .send({ quantity: 2 });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/permission/i);
    });

    test("client price or productId tampering in update body is ignored", async () => {
      const res = await request(app)
        .put(`/api/cart/items/${createdCartItemId}`)
        .set(authHeader(customerToken))
        .send({
          quantity: 2,
          price: 1, // Hacked price attempt
          productId: silverRingProduct._id, // Hacked product attempt
        });

      expect(res.status).toBe(200);
      const item = res.body.cart.items.find((i) => i._id.toString() === createdCartItemId.toString());
      expect(item.price).toBe(15000); // Stored price remains original
      expect(item.subtotal).toBe(30000); // 2 * 15000
      expect(item.product._id.toString()).toBe(goldRingProduct._id.toString()); // Product unchanged
    });

    test("update with quantity exceeding available stock returns 400", async () => {
      const res = await request(app)
        .put(`/api/cart/items/${createdCartItemId}`)
        .set(authHeader(customerToken))
        .send({ quantity: 20 }); // stock is 10

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/exceeds available stock/i);
    });
  });

  describe("G. Delete Item", () => {
    test("customer cannot delete another customer's cart item returns 403", async () => {
      const res = await request(app)
        .delete(`/api/cart/items/${customer2CartItemId}`)
        .set(authHeader(customerToken));

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/permission/i);
    });

    test("customer can delete own cart item and cart total resets", async () => {
      const res = await request(app)
        .delete(`/api/cart/items/${createdCartItemId}`)
        .set(authHeader(customerToken));

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/removed/i);
      expect(res.body.cart.items.length).toBe(0);
      expect(res.body.cart.totalQuantity).toBe(0);
      expect(res.body.cart.totalAmount).toBe(0);
    });
  });

  describe("H. Security & Ownership", () => {
    test("unauthenticated request to cart endpoints returns 401", async () => {
      const resGet = await request(app).get("/api/cart");
      expect(resGet.status).toBe(401);

      const resPost = await request(app).post("/api/cart/items").send({ productId: goldRingProduct._id, quantity: 1 });
      expect(resPost.status).toBe(401);

      const resPut = await request(app).put(`/api/cart/items/${customer2CartItemId}`).send({ quantity: 1 });
      expect(resPut.status).toBe(401);

      const resDel = await request(app).delete(`/api/cart/items/${customer2CartItemId}`);
      expect(resDel.status).toBe(401);
    });

    test("admin or superadmin cannot access cart endpoints returns 403 (restricted to customer)", async () => {
      const resAdmin = await request(app)
        .get("/api/cart")
        .set(authHeader(adminToken));
      expect(resAdmin.status).toBe(403);

      const resSA = await request(app)
        .get("/api/cart")
        .set(authHeader(superadminToken));
      expect(resSA.status).toBe(403);
    });

    test("userId or cartId in POST body is not used to manipulate other users carts", async () => {
      const res = await request(app)
        .post("/api/cart/items")
        .set(authHeader(customerToken))
        .send({
          productId: silverRingProduct._id,
          quantity: 1,
          userId: customer2Id, // Tampering attempt
          cartId: new mongoose.Types.ObjectId(), // Tampering attempt
          price: 1, // Tampering attempt
        });

      expect(res.status).toBe(201);
      expect(res.body.cart.userId.toString()).toBe(customerId); // Bound to authenticated customer
      expect(res.body.cart.items[0].price).toBe(2500); // Backend price maintained
    });
  });

  describe("I. Authorization Regression", () => {
    test("existing customer profile endpoint still works", async () => {
      const res = await request(app)
        .get("/api/customer/profile")
        .set(authHeader(customerToken));
      expect(res.status).toBe(200);
      expect(res.body.name).toBeDefined();
    });

    test("existing product listing and filters still work", async () => {
      const res = await request(app).get("/api/products?sort=price_asc");
      expect(res.status).toBe(200);
      expect(res.body[0].price).toBeLessThanOrEqual(res.body[res.body.length - 1].price);
    });
  });
});

describe("Phase 4: Checkout / Order Creation", () => {
  beforeAll(async () => {
    const c1Cart = await Cart.findOne({ userId: customerId });
    if (c1Cart) await CartItem.deleteMany({ cartId: c1Cart._id });
  });

  describe("A. Authentication & Role Guards", () => {
    test("unauthenticated POST /api/orders returns 401", async () => {
      const res = await request(app).post("/api/orders").send({});
      expect(res.status).toBe(401);
    });

    test("admin cannot access checkout endpoint (403)", async () => {
      const res = await request(app)
        .post("/api/orders")
        .set(authHeader(adminToken))
        .send({});
      expect(res.status).toBe(403);
    });

    test("superadmin cannot access checkout endpoint (403)", async () => {
      const res = await request(app)
        .post("/api/orders")
        .set(authHeader(superadminToken))
        .send({});
      expect(res.status).toBe(403);
    });
  });

  describe("B. Empty Cart", () => {
    test("checkout with empty cart returns 400", async () => {
      // customer2's cart was emptied in previous cart tests
      // Clear customer2's cart to be certain
      const c2Cart = await Cart.findOne({ userId: customer2Id });
      if (c2Cart) await CartItem.deleteMany({ cartId: c2Cart._id });

      const res = await request(app)
        .post("/api/orders")
        .set(authHeader(customer2Token))
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cart is empty/i);
    });
  });

  describe("C. Valid Checkout Flow", () => {
    let createdOrder;
    let initialGoldStock;

    test("customer can checkout cart with valid products and address", async () => {
      // Check initial stock
      const pBefore = await Product.findById(goldRingProduct._id);
      initialGoldStock = pBefore.stock; // 10

      // Add 2 gold rings to customer1 cart
      await request(app)
        .post("/api/cart/items")
        .set(authHeader(customerToken))
        .send({
          productId: goldRingProduct._id,
          quantity: 2,
        });

      // Checkout
      const res = await request(app)
        .post("/api/orders")
        .set(authHeader(customerToken))
        .send({
          shippingAddress: {
            street: "789 Park Blvd",
            city: "Emerald City",
            state: "WA",
            pincode: "98001",
          },
          phone: "5551234567",
        });

      expect(res.status).toBe(201);
      expect(res.body.order).toBeDefined();

      createdOrder = res.body.order;
      expect(createdOrder.userId.toString()).toBe(customerId);
      expect(createdOrder.totalAmount).toBe(30000); // 2 * 15000
      expect(createdOrder.orderStatus).toBe("Order Placed");
      expect(createdOrder.shippingAddress.street).toBe("789 Park Blvd");
      expect(createdOrder.shippingAddress.city).toBe("Emerald City");
      expect(createdOrder.phone).toBe("5551234567");
      expect(createdOrder.items.length).toBe(1);
      expect(createdOrder.items[0].productName).toBe("Gold Ring");
      expect(createdOrder.items[0].quantity).toBe(2);
      expect(createdOrder.items[0].price).toBe(15000);
      expect(createdOrder.items[0].subtotal).toBe(30000);

      // Verify product stock in DB was reduced by 2
      const pAfter = await Product.findById(goldRingProduct._id);
      expect(pAfter.stock).toBe(initialGoldStock - 2);

      // Verify customer's cart is now empty
      const cartRes = await request(app)
        .get("/api/cart")
        .set(authHeader(customerToken));
      expect(cartRes.body.cart.items.length).toBe(0);
      expect(cartRes.body.cart.totalQuantity).toBe(0);
      expect(cartRes.body.cart.totalAmount).toBe(0);
    });

    test("checkout falls back to customer's saved profile address if not in request body", async () => {
      // Add 1 gold ring to customer1 cart
      await request(app)
        .post("/api/cart/items")
        .set(authHeader(customerToken))
        .send({
          productId: goldRingProduct._id,
          quantity: 1,
        });

      // Send checkout without shippingAddress in body (saved address is 456 Oak Avenue)
      const res = await request(app)
        .post("/api/orders")
        .set(authHeader(customerToken))
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.order.shippingAddress.street).toBe("456 Oak Avenue");
      expect(res.body.order.shippingAddress.city).toBe("Gotham");
    });
  });

  describe("D. Price & OrderStatus Security", () => {
    test("client-provided price, totalAmount, and orderStatus are ignored", async () => {
      await request(app)
        .post("/api/cart/items")
        .set(authHeader(customerToken))
        .send({
          productId: silverRingProduct._id,
          quantity: 1,
        });

      const res = await request(app)
        .post("/api/orders")
        .set(authHeader(customerToken))
        .send({
          price: 1, // Tampering attempt
          totalAmount: 1, // Tampering attempt
          orderStatus: "Delivered", // Tampering attempt
        });

      expect(res.status).toBe(201);
      expect(res.body.order.totalAmount).toBe(2500); // Recalculated from DB product price
      expect(res.body.order.orderStatus).toBe("Order Placed"); // Default maintained
    });
  });

  describe("E. Stock & Product Validation at Checkout", () => {
    test("checkout fails if stock becomes insufficient before order creation, no stock deducted", async () => {
      // Add silver ring to cart (stock was 5, now 4)
      await request(app)
        .post("/api/cart/items")
        .set(authHeader(customerToken))
        .send({
          productId: silverRingProduct._id,
          quantity: 2,
        });

      // Directly update silver ring stock to 1 (external inventory change)
      await Product.findByIdAndUpdate(silverRingProduct._id, { stock: 1 });

      const res = await request(app)
        .post("/api/orders")
        .set(authHeader(customerToken))
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/insufficient stock/i);

      // Verify stock remained unchanged at 1
      const pCheck = await Product.findById(silverRingProduct._id);
      expect(pCheck.stock).toBe(1);

      // Restore stock for remaining tests
      await Product.findByIdAndUpdate(silverRingProduct._id, { stock: 10 });
      // Clear cart
      const cart = await Cart.findOne({ userId: customerId });
      await CartItem.deleteMany({ cartId: cart._id });
    });

    test("checkout fails if product becomes unavailable, no order created", async () => {
      // Add silver ring to cart
      await request(app)
        .post("/api/cart/items")
        .set(authHeader(customerToken))
        .send({
          productId: silverRingProduct._id,
          quantity: 1,
        });

      // Mark silver ring unavailable
      await Product.findByIdAndUpdate(silverRingProduct._id, { available: false });

      const res = await request(app)
        .post("/api/orders")
        .set(authHeader(customerToken))
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/unavailable/i);

      // Restore availability and clear cart
      await Product.findByIdAndUpdate(silverRingProduct._id, { available: true });
      const cart = await Cart.findOne({ userId: customerId });
      await CartItem.deleteMany({ cartId: cart._id });
    });
  });

  describe("F. Multiple Products Checkout", () => {
    test("checkout with multiple items calculates total and decreases stock for each", async () => {
      // Add gold ring (qty 1, price 15000) and diamond necklace (qty 1, price 55000)
      await request(app)
        .post("/api/cart/items")
        .set(authHeader(customerToken))
        .send({ productId: goldRingProduct._id, quantity: 1 });

      await request(app)
        .post("/api/cart/items")
        .set(authHeader(customerToken))
        .send({ productId: diamondNecklaceProduct._id, quantity: 1 });

      const p1Before = await Product.findById(goldRingProduct._id);
      const p2Before = await Product.findById(diamondNecklaceProduct._id);

      const res = await request(app)
        .post("/api/orders")
        .set(authHeader(customerToken))
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.order.items.length).toBe(2);
      expect(res.body.order.totalAmount).toBe(15000 + 55000); // 70000

      // Verify both product stocks decremented
      const p1After = await Product.findById(goldRingProduct._id);
      const p2After = await Product.findById(diamondNecklaceProduct._id);
      expect(p1After.stock).toBe(p1Before.stock - 1);
      expect(p2After.stock).toBe(p2Before.stock - 1);
    });
  });

  describe("G. Snapshot Behavior", () => {
    test("later product price changes or address changes do not alter existing order items or shippingAddress", async () => {
      // Add silver ring to customer1 cart
      await request(app)
        .post("/api/cart/items")
        .set(authHeader(customerToken))
        .send({ productId: silverRingProduct._id, quantity: 1 });

      const orderRes = await request(app)
        .post("/api/orders")
        .set(authHeader(customerToken))
        .send({
          shippingAddress: {
            street: "Original Snapshot St",
            city: "Original City",
            state: "CA",
            pincode: "90001",
          },
        });

      const orderId = orderRes.body.order._id;
      const orderItemId = orderRes.body.order.items[0]._id;

      // Admin updates the product's price and name in catalog
      await Product.findByIdAndUpdate(silverRingProduct._id, {
        name: "Renamed Silver Ring",
        price: 99999,
      });

      // Customer updates their user profile address
      await request(app)
        .put("/api/customer/profile")
        .set(authHeader(customerToken))
        .send({
          address: {
            street: "New Changed Street",
            city: "New Changed City",
            state: "TX",
            pincode: "75001",
          },
        });

      // Inspect the historical order and order item directly
      const historicalOrder = await Order.findById(orderId);
      const historicalOrderItem = await OrderItem.findById(orderItemId);

      expect(historicalOrderItem.productName).toBe("Silver Ring"); // Original snapshot maintained
      expect(historicalOrderItem.price).toBe(2500); // Original snapshot price maintained
      expect(historicalOrder.shippingAddress.street).toBe("Original Snapshot St"); // Original address snapshot maintained
    });
  });

  describe("H. Ownership Protection", () => {
    test("userId in body cannot create order for another customer", async () => {
      // Add product to customer1's cart
      await request(app)
        .post("/api/cart/items")
        .set(authHeader(customerToken))
        .send({ productId: goldRingProduct._id, quantity: 1 });

      const res = await request(app)
        .post("/api/orders")
        .set(authHeader(customerToken))
        .send({
          userId: customer2Id, // Attempt to assign order to customer2
        });

      expect(res.status).toBe(201);
      expect(res.body.order.userId.toString()).toBe(customerId); // Bound to authenticated caller
    });
  });
});

describe("Phase 5: Customer Order History & Order Details", () => {
  let customer1OrderId;
  let customer2OrderId;
  let customer2User;
  let customer2NewToken;

  beforeAll(async () => {
    // Create a fresh third customer who has placed no orders
    customer2User = await User.create({
      name: "Fresh Customer No Orders",
      email: "noorders@example.com",
      password: TEST_PASSWORD,
      role: "customer",
    });
    customer2NewToken = await loginUser({ email: "noorders@example.com", password: TEST_PASSWORD });

    // Ensure customer1 has at least one order
    const c1Orders = await Order.find({ userId: customerId });
    if (c1Orders.length > 0) {
      customer1OrderId = c1Orders[0]._id.toString();
    }

    // Place an order for customer2
    await Product.findByIdAndUpdate(silverRingProduct._id, { stock: 10, available: true });
    let c2Cart = await Cart.findOne({ userId: customer2Id });
    if (!c2Cart) c2Cart = await Cart.create({ userId: customer2Id });
    await CartItem.create({
      cartId: c2Cart._id,
      productId: silverRingProduct._id,
      quantity: 1,
      price: silverRingProduct.price,
    });

    const c2OrderRes = await request(app)
      .post("/api/orders")
      .set(authHeader(customer2Token))
      .send({
        shippingAddress: {
          street: "Customer2 Street",
          city: "Metropolis",
          state: "NY",
          pincode: "10002",
        },
      });
    customer2OrderId = c2OrderRes.body.order._id.toString();
  });

  describe("A. Authentication & Role Guards", () => {
    test("GET /api/orders without token returns 401", async () => {
      const res = await request(app).get("/api/orders");
      expect(res.status).toBe(401);
    });

    test("GET /api/orders/:id without token returns 401", async () => {
      const res = await request(app).get(`/api/orders/${customer1OrderId}`);
      expect(res.status).toBe(401);
    });

    test("admin cannot access customer orders (403)", async () => {
      const resList = await request(app)
        .get("/api/orders")
        .set(authHeader(adminToken));
      expect(resList.status).toBe(403);

      const resItem = await request(app)
        .get(`/api/orders/${customer1OrderId}`)
        .set(authHeader(adminToken));
      expect(resItem.status).toBe(403);
    });

    test("superadmin cannot access customer orders (403)", async () => {
      const resList = await request(app)
        .get("/api/orders")
        .set(authHeader(superadminToken));
      expect(resList.status).toBe(403);

      const resItem = await request(app)
        .get(`/api/orders/${customer1OrderId}`)
        .set(authHeader(superadminToken));
      expect(resItem.status).toBe(403);
    });
  });

  describe("B. GET /api/orders — Customer History", () => {
    test("customer with no orders receives 200 and empty array", async () => {
      const res = await request(app)
        .get("/api/orders")
        .set(authHeader(customer2NewToken));

      expect(res.status).toBe(200);
      expect(res.body.orders).toEqual([]);
    });

    test("customer with orders receives array of own orders sorted newest first", async () => {
      const res = await request(app)
        .get("/api/orders")
        .set(authHeader(customerToken));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.orders)).toBe(true);
      expect(res.body.orders.length).toBeGreaterThanOrEqual(1);

      // Verify sorting: createdAt descending
      for (let i = 0; i < res.body.orders.length - 1; i++) {
        expect(new Date(res.body.orders[i].createdAt).getTime()).toBeGreaterThanOrEqual(
          new Date(res.body.orders[i + 1].createdAt).getTime()
        );
      }

      const firstOrder = res.body.orders[0];
      expect(firstOrder._id).toBeDefined();
      expect(firstOrder.totalAmount).toBeGreaterThan(0);
      expect(firstOrder.orderStatus).toBe("Order Placed");
      expect(firstOrder.shippingAddress).toBeDefined();
      expect(Array.isArray(firstOrder.items)).toBe(true);
      expect(firstOrder.items[0].productName).toBeDefined();
      expect(firstOrder.items[0].price).toBeDefined();
      expect(firstOrder.items[0].subtotal).toBeDefined();
    });
  });

  describe("C. Customer Ownership & Cross-Customer Isolation", () => {
    test("customer A cannot see customer B orders in order history", async () => {
      const res1 = await request(app)
        .get("/api/orders")
        .set(authHeader(customerToken));

      const res2 = await request(app)
        .get("/api/orders")
        .set(authHeader(customer2Token));

      const c1OrderIds = res1.body.orders.map((o) => o._id.toString());
      const c2OrderIds = res2.body.orders.map((o) => o._id.toString());

      // No intersection between customer1 and customer2 order IDs
      const intersection = c1OrderIds.filter((id) => c2OrderIds.includes(id));
      expect(intersection.length).toBe(0);
      expect(c2OrderIds).toContain(customer2OrderId);
      expect(c1OrderIds).not.toContain(customer2OrderId);
    });

    test("supplying userId in query parameter does not leak another customers orders", async () => {
      const res = await request(app)
        .get(`/api/orders?userId=${customer2Id}`)
        .set(authHeader(customerToken));

      expect(res.status).toBe(200);
      // All returned orders must strictly belong to customer1
      expect(res.body.orders.every((o) => o.userId.toString() === customerId)).toBe(true);
    });
  });

  describe("D. GET /api/orders/:id", () => {
    test("customer can retrieve own order details by ID", async () => {
      const res = await request(app)
        .get(`/api/orders/${customer1OrderId}`)
        .set(authHeader(customerToken));

      expect(res.status).toBe(200);
      expect(res.body.order).toBeDefined();
      expect(res.body.order._id.toString()).toBe(customer1OrderId);
      expect(res.body.order.userId.toString()).toBe(customerId);
      expect(Array.isArray(res.body.order.items)).toBe(true);
    });

    test("invalid order ID returns 400", async () => {
      const res = await request(app)
        .get("/api/orders/not-a-valid-id")
        .set(authHeader(customerToken));

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid order id/i);
    });

    test("non-existent order returns 404", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/orders/${nonExistentId}`)
        .set(authHeader(customerToken));

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/not found/i);
    });

    test("customer cannot retrieve another customers order — returns 404 without leaking existence", async () => {
      // customer1 attempts to access customer2's order
      const res = await request(app)
        .get(`/api/orders/${customer2OrderId}`)
        .set(authHeader(customerToken));

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/not found/i);
    });
  });

  describe("E. Historical OrderItem Snapshot & Resilience", () => {
    let snapshotTestOrderId;
    let temporaryProduct;

    test("order history remains intact with snapshot name/price even if product is deleted", async () => {
      // Create a temporary product
      temporaryProduct = await Product.create({
        name: "Temporary Bracelet",
        description: "Special limited bracelet",
        price: 8000,
        stock: 5,
        category: ringsCategory._id,
        available: true,
      });

      // Customer places order for this product
      let cCart = await Cart.findOne({ userId: customerId });
      await CartItem.create({
        cartId: cCart._id,
        productId: temporaryProduct._id,
        quantity: 2,
        price: 8000,
      });

      const orderRes = await request(app)
        .post("/api/orders")
        .set(authHeader(customerToken))
        .send({});

      snapshotTestOrderId = orderRes.body.order._id.toString();

      // Now permanently delete the product from the catalog
      await Product.findByIdAndDelete(temporaryProduct._id);

      // Retrieve the historical order via GET /api/orders/:id
      const res = await request(app)
        .get(`/api/orders/${snapshotTestOrderId}`)
        .set(authHeader(customerToken));

      expect(res.status).toBe(200);
      expect(res.body.order.items.length).toBe(1);
      const item = res.body.order.items[0];
      expect(item.productName).toBe("Temporary Bracelet"); // Preserved!
      expect(item.quantity).toBe(2);
      expect(item.price).toBe(8000); // Preserved!
      expect(item.subtotal).toBe(16000); // Preserved!
      expect(res.body.order.totalAmount).toBe(16000);
    });
  });

  describe("F. Security & Sensitive Data Protection", () => {
    test("order response never exposes password, hash, or JWT token", async () => {
      const res = await request(app)
        .get(`/api/orders/${customer1OrderId}`)
        .set(authHeader(customerToken));

      expect(res.status).toBe(200);
      expect(res.body.order.password).toBeUndefined();
      expect(res.body.order.token).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/password123/i);
    });

    test("customer cannot modify order status through customer routes", async () => {
      // Trying PUT on /api/orders/:id (route should not exist or not allow status change)
      const resPut = await request(app)
        .put(`/api/orders/${customer1OrderId}`)
        .set(authHeader(customerToken))
        .send({ orderStatus: "Delivered" });

      expect(resPut.status).toBe(404); // Route not found

      // Check that order status is still unchanged
      const checkRes = await request(app)
        .get(`/api/orders/${customer1OrderId}`)
        .set(authHeader(customerToken));
      expect(checkRes.body.order.orderStatus).toBe("Order Placed");
    });
  });
});

describe("Phase 6: Authorization & Security Audit Tests", () => {
  describe("1. Token Validation & Invalidation", () => {
    test("malformed Authorization header without Bearer returns 401", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set({ Authorization: "Basic abcdef123" });
      expect(res.status).toBe(401);
    });

    test("tampered JWT signature returns 401", async () => {
      // Split customer token and change signature
      const parts = customerToken.split(".");
      parts[2] = "tamperedSignature123";
      const tamperedToken = parts.join(".");

      const res = await request(app)
        .get("/api/customer/profile")
        .set(authHeader(tamperedToken));
      expect(res.status).toBe(401);
    });

    test("token of a deleted user returns 401", async () => {
      const tempUser = await User.create({
        name: "Temporary Deletable User",
        email: "deleteme@example.com",
        password: TEST_PASSWORD,
        role: "customer",
      });
      const tempToken = await loginUser({ email: "deleteme@example.com", password: TEST_PASSWORD });

      // Delete the user from database
      await User.findByIdAndDelete(tempUser._id);

      // Attempt to access protected endpoint with the orphaned token
      const res = await request(app)
        .get("/api/customer/profile")
        .set(authHeader(tempToken));

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/no longer exists/i);
    });
  });

  describe("2. RBAC Boundary Enforcement Across Roles", () => {
    test("staff cannot create products (403)", async () => {
      const res = await request(app)
        .post("/api/products")
        .set(authHeader(staffToken))
        .send({ name: "Staff Product", price: 1000, category: ringsCategory._id });
      expect(res.status).toBe(403);
    });

    test("staff cannot create categories (403)", async () => {
      const res = await request(app)
        .post("/api/categories")
        .set(authHeader(staffToken))
        .send({ name: "Staff Category" });
      expect(res.status).toBe(403);
    });

    test("staff cannot create admin users (403)", async () => {
      const res = await request(app)
        .post("/api/admin/create")
        .set(authHeader(staffToken))
        .send({ name: "Staff Admin", username: "staffadmin", password: TEST_PASSWORD });
      expect(res.status).toBe(403);
    });

    test("staff cannot access customer profile (403)", async () => {
      const res = await request(app)
        .get("/api/customer/profile")
        .set(authHeader(staffToken));
      expect(res.status).toBe(403);
    });

    test("customer cannot create categories (403)", async () => {
      const res = await request(app)
        .post("/api/categories")
        .set(authHeader(customerToken))
        .send({ name: "Customer Category" });
      expect(res.status).toBe(403);
    });

    test("customer cannot update categories (403)", async () => {
      const res = await request(app)
        .put(`/api/categories/${ringsCategory._id}`)
        .set(authHeader(customerToken))
        .send({ name: "Renamed Rings" });
      expect(res.status).toBe(403);
    });

    test("customer cannot delete categories (403)", async () => {
      const res = await request(app)
        .delete(`/api/categories/${ringsCategory._id}`)
        .set(authHeader(customerToken));
      expect(res.status).toBe(403);
    });
  });

  describe("3. Input Validation & ID Sanitization", () => {
    test("GET /api/products/:id with malformed ObjectId returns 400", async () => {
      const res = await request(app).get("/api/products/not-an-id");
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid product id/i);
    });

    test("POST /api/products with negative price returns 400", async () => {
      const res = await request(app)
        .post("/api/products")
        .set(authHeader(adminToken))
        .send({
          name: "Negative Price Ring",
          price: -500,
          category: ringsCategory._id,
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/non-negative/i);
    });

    test("POST /api/products with negative stock returns 400", async () => {
      const res = await request(app)
        .post("/api/products")
        .set(authHeader(adminToken))
        .send({
          name: "Negative Stock Ring",
          price: 500,
          stock: -10,
          category: ringsCategory._id,
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/non-negative/i);
    });

    test("POST /api/products with malformed category ID returns 400", async () => {
      const res = await request(app)
        .post("/api/products")
        .set(authHeader(adminToken))
        .send({
          name: "Bad Category Ring",
          price: 500,
          category: "invalid-cat-id",
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid category id/i);
    });

    test("GET /api/categories/:id with malformed ObjectId returns 400", async () => {
      const res = await request(app).get("/api/categories/bad-id");
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid category id/i);
    });
  });

  describe("4. Registration & Profile Tampering Prevention", () => {
    test("POST /api/auth/register ignores role in request body (cannot escalate to admin)", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Hacker Reg",
          email: "hackerreg@example.com",
          password: TEST_PASSWORD,
          role: "admin",
        });

      expect(res.status).toBe(201);
      expect(res.body.role).toBe("customer"); // Enforced as customer

      const dbUser = await User.findById(res.body._id);
      expect(dbUser.role).toBe("customer");
    });
  });

  describe("Phase 7 — Admin Order Management", () => {
    let testOrder1;
    let testOrder2;
    let snapshotProduct;

    beforeEach(async () => {
      await Order.deleteMany({});
      await OrderItem.deleteMany({});

      snapshotProduct = await Product.create({
        name: "Historical Ring",
        price: 2500,
        stock: 50,
        category: ringsCategory._id,
        available: true,
      });

      testOrder1 = await Order.create({
        userId: customerId,
        totalAmount: 5000,
        shippingAddress: {
          street: "123 Main St",
          city: "Metropolis",
          state: "NY",
          pincode: "10001",
        },
        phone: "1234567890",
        orderStatus: "Order Placed",
      });

      await OrderItem.create({
        orderId: testOrder1._id,
        productId: snapshotProduct._id,
        productName: snapshotProduct.name,
        quantity: 2,
        price: 2500,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      testOrder2 = await Order.create({
        userId: customer2Id,
        totalAmount: 2500,
        shippingAddress: {
          street: "456 Oak Ave",
          city: "Gotham",
          state: "NJ",
          pincode: "07001",
        },
        phone: "9876543210",
        orderStatus: "Order Placed",
      });

      await OrderItem.create({
        orderId: testOrder2._id,
        productId: snapshotProduct._id,
        productName: snapshotProduct.name,
        quantity: 1,
        price: 2500,
      });
    });

    // ── A. Authentication & Authorization ────────────────────────────────────
    describe("A. Authentication & Authorization", () => {
      test("GET /api/admin/orders without token returns 401", async () => {
        const res = await request(app).get("/api/admin/orders");
        expect(res.status).toBe(401);
      });

      test("GET /api/admin/orders with customer token returns 403", async () => {
        const res = await request(app)
          .get("/api/admin/orders")
          .set(authHeader(customerToken));
        expect(res.status).toBe(403);
      });

      test("GET /api/admin/orders with staff token returns 403", async () => {
        const res = await request(app)
          .get("/api/admin/orders")
          .set(authHeader(staffToken));
        expect(res.status).toBe(403);
      });

      test("GET /api/admin/orders with admin token returns 200", async () => {
        const res = await request(app)
          .get("/api/admin/orders")
          .set(authHeader(adminToken));
        expect(res.status).toBe(200);
      });

      test("GET /api/admin/orders with superadmin token returns 200", async () => {
        const res = await request(app)
          .get("/api/admin/orders")
          .set(authHeader(superadminToken));
        expect(res.status).toBe(200);
      });
    });

    // ── B. Data Retrieval & Formatting ───────────────────────────────────────
    describe("B. Data Retrieval & Formatting", () => {
      test("Admin can retrieve customer orders across customers", async () => {
        const res = await request(app)
          .get("/api/admin/orders")
          .set(authHeader(adminToken));
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.orders)).toBe(true);
        expect(res.body.orders.length).toBe(2);
      });

      test("Superadmin can retrieve customer orders across customers", async () => {
        const res = await request(app)
          .get("/api/admin/orders")
          .set(authHeader(superadminToken));
        expect(res.status).toBe(200);
        expect(res.body.orders.length).toBe(2);
      });

      test("Orders are sorted newest first (createdAt desc)", async () => {
        const res = await request(app)
          .get("/api/admin/orders")
          .set(authHeader(adminToken));
        expect(res.status).toBe(200);
        expect(res.body.orders[0]._id).toBe(testOrder2._id.toString());
        expect(res.body.orders[1]._id).toBe(testOrder1._id.toString());
      });

      test("Empty order collection returns 200 with empty array []", async () => {
        await Order.deleteMany({});
        await OrderItem.deleteMany({});

        const res = await request(app)
          .get("/api/admin/orders")
          .set(authHeader(adminToken));
        expect(res.status).toBe(200);
        expect(res.body.orders).toEqual([]);
      });

      test("Correct totalAmount, orderStatus, and shippingAddress are returned", async () => {
        const res = await request(app)
          .get("/api/admin/orders")
          .set(authHeader(adminToken));
        expect(res.status).toBe(200);

        const order1Data = res.body.orders.find(
          (o) => o._id === testOrder1._id.toString()
        );
        expect(order1Data).toBeDefined();
        expect(order1Data.totalAmount).toBe(5000);
        expect(order1Data.orderStatus).toBe("Order Placed");
        expect(order1Data.shippingAddress.street).toBe("123 Main St");
        expect(order1Data.shippingAddress.city).toBe("Metropolis");
        expect(order1Data.phone).toBe("1234567890");
      });

      test("Order items and item subtotals are returned correctly", async () => {
        const res = await request(app)
          .get("/api/admin/orders")
          .set(authHeader(adminToken));
        expect(res.status).toBe(200);

        const order1Data = res.body.orders.find(
          (o) => o._id === testOrder1._id.toString()
        );
        expect(order1Data.items.length).toBe(1);
        expect(order1Data.items[0].productName).toBe("Historical Ring");
        expect(order1Data.items[0].quantity).toBe(2);
        expect(order1Data.items[0].price).toBe(2500);
        expect(order1Data.items[0].subtotal).toBe(5000);
      });
    });

    // ── C. Customer Information Security ─────────────────────────────────────
    describe("C. Customer Information Security", () => {
      test("Customer identification is populated safely without sensitive fields", async () => {
        const res = await request(app)
          .get("/api/admin/orders")
          .set(authHeader(adminToken));
        expect(res.status).toBe(200);

        const order1Data = res.body.orders.find(
          (o) => o._id === testOrder1._id.toString()
        );
        const customerUser = await User.findById(customerId);
        expect(order1Data.userId).toBeDefined();
        expect(order1Data.userId._id).toBe(customerId);
        expect(order1Data.userId.name).toBe(customerUser.name);
        expect(order1Data.userId.email).toBe(customerUser.email);

        expect(order1Data.userId.password).toBeUndefined();
        expect(order1Data.userId.token).toBeUndefined();
        expect(JSON.stringify(res.body)).not.toMatch(/password/i);
      });
    });

    // ── D. Historical Snapshot Handling ──────────────────────────────────────
    describe("D. Historical Snapshot Handling", () => {
      test("Modifying product price does not mutate historical OrderItem price", async () => {
        snapshotProduct.price = 99999;
        await snapshotProduct.save();

        const res = await request(app)
          .get("/api/admin/orders")
          .set(authHeader(adminToken));
        expect(res.status).toBe(200);

        const order1Data = res.body.orders.find(
          (o) => o._id === testOrder1._id.toString()
        );
        expect(order1Data.items[0].price).toBe(2500);
        expect(order1Data.items[0].subtotal).toBe(5000);
      });

      test("Deleting product from DB does not break historical OrderItem display", async () => {
        await Product.findByIdAndDelete(snapshotProduct._id);

        const res = await request(app)
          .get("/api/admin/orders")
          .set(authHeader(adminToken));
        expect(res.status).toBe(200);

        const order1Data = res.body.orders.find(
          (o) => o._id === testOrder1._id.toString()
        );
        expect(order1Data.items.length).toBe(1);
        expect(order1Data.items[0].productName).toBe("Historical Ring");
        expect(order1Data.items[0].price).toBe(2500);
      });
    });

    // ── E. PUT /api/admin/orders/:id/status ──────────────────────────────────
    describe("E. PUT /api/admin/orders/:id/status", () => {
      test("Admin can update order status", async () => {
        const res = await request(app)
          .put(`/api/admin/orders/${testOrder1._id}/status`)
          .set(authHeader(adminToken))
          .send({ orderStatus: "Processing" });

        expect(res.status).toBe(200);
        expect(res.body.order.orderStatus).toBe("Processing");

        const updated = await Order.findById(testOrder1._id);
        expect(updated.orderStatus).toBe("Processing");
      });

      test("Superadmin can update order status", async () => {
        const res = await request(app)
          .put(`/api/admin/orders/${testOrder1._id}/status`)
          .set(authHeader(superadminToken))
          .send({ orderStatus: "Shipped" });

        expect(res.status).toBe(200);
        expect(res.body.order.orderStatus).toBe("Shipped");
      });

      test("Customer receives 403 on status update", async () => {
        const res = await request(app)
          .put(`/api/admin/orders/${testOrder1._id}/status`)
          .set(authHeader(customerToken))
          .send({ orderStatus: "Delivered" });
        expect(res.status).toBe(403);
      });

      test("Staff receives 403 on status update", async () => {
        const res = await request(app)
          .put(`/api/admin/orders/${testOrder1._id}/status`)
          .set(authHeader(staffToken))
          .send({ orderStatus: "Delivered" });
        expect(res.status).toBe(403);
      });

      test("Unauthenticated request receives 401", async () => {
        const res = await request(app)
          .put(`/api/admin/orders/${testOrder1._id}/status`)
          .send({ orderStatus: "Delivered" });
        expect(res.status).toBe(401);
      });

      test("Invalid order ID returns 400", async () => {
        const res = await request(app)
          .put("/api/admin/orders/invalid-mongo-id/status")
          .set(authHeader(adminToken))
          .send({ orderStatus: "Confirmed" });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Invalid order ID");
      });

      test("Non-existent order ID returns 404", async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        const res = await request(app)
          .put(`/api/admin/orders/${nonExistentId}/status`)
          .set(authHeader(adminToken))
          .send({ orderStatus: "Confirmed" });
        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Order not found");
      });

      test("Invalid status value returns 400", async () => {
        const res = await request(app)
          .put(`/api/admin/orders/${testOrder1._id}/status`)
          .set(authHeader(adminToken))
          .send({ orderStatus: "InvalidArbitraryStatus" });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Invalid order status");
      });

      test("Empty or non-string status returns 400", async () => {
        const resNull = await request(app)
          .put(`/api/admin/orders/${testOrder1._id}/status`)
          .set(authHeader(adminToken))
          .send({ orderStatus: null });
        expect(resNull.status).toBe(400);

        const resNum = await request(app)
          .put(`/api/admin/orders/${testOrder1._id}/status`)
          .set(authHeader(adminToken))
          .send({ orderStatus: 123 });
        expect(resNum.status).toBe(400);
      });

      test("All valid enum statuses succeed: Confirmed, Processing, Shipped, Delivered, Cancelled", async () => {
        const statuses = [
          "Confirmed",
          "Processing",
          "Shipped",
          "Delivered",
          "Cancelled",
        ];

        for (const st of statuses) {
          const res = await request(app)
            .put(`/api/admin/orders/${testOrder1._id}/status`)
            .set(authHeader(adminToken))
            .send({ orderStatus: st });
          expect(res.status).toBe(200);
          expect(res.body.order.orderStatus).toBe(st);
        }
      });
    });

    // ── F. Field Tampering Protection ────────────────────────────────────────
    describe("F. Field Tampering Protection", () => {
      test("Client cannot tamper with userId, totalAmount, shippingAddress, phone, or items", async () => {
        const rogueUserId = new mongoose.Types.ObjectId();
        const res = await request(app)
          .put(`/api/admin/orders/${testOrder1._id}/status`)
          .set(authHeader(adminToken))
          .send({
            orderStatus: "Delivered",
            userId: rogueUserId,
            totalAmount: 1,
            shippingAddress: { street: "Hacked St", city: "Hacked", state: "HK", pincode: "00000" },
            phone: "9999999999",
            items: [],
          });

        expect(res.status).toBe(200);
        expect(res.body.order.orderStatus).toBe("Delivered");

        // Verify database state is untouched except orderStatus
        const dbOrder = await Order.findById(testOrder1._id);
        expect(dbOrder.userId.toString()).toBe(customerId);
        expect(dbOrder.totalAmount).toBe(5000);
        expect(dbOrder.shippingAddress.street).toBe("123 Main St");
        expect(dbOrder.phone).toBe("1234567890");

        // OrderItems untouched
        const items = await OrderItem.find({ orderId: testOrder1._id });
        expect(items.length).toBe(1);
        expect(items[0].quantity).toBe(2);
        expect(items[0].price).toBe(2500);
      });
    });
  });
});





