/**
 * tests/superadmin.test.js
 *
 * Comprehensive test suite for:
 *   - All 8 new Super Admin management endpoints
 *   - Authorization (unauthenticated / customer / staff / admin / superadmin)
 *   - Inactive-user handling (login blocked + JWT rejected)
 *   - Password reset with existing bcrypt pre-save hook
 *   - Super Admin self-protection rules
 *   - Regression: existing endpoints still behave correctly
 *
 * Test environment:
 *   - In-memory MongoDB via mongodb-memory-server (no real DB touched)
 *   - Express app imported from app.js (no server.listen called)
 *   - JWT_SECRET set via process.env before any request is made
 */

const request    = require("supertest");
const mongoose   = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const app  = require("../app");
const User = require("../models/User");

// ─────────────────────────────────────────────────────────────────────────────
// Shared state
// ─────────────────────────────────────────────────────────────────────────────
let mongod;

const TEST_PASSWORD = "password123";

// Tokens (set in beforeAll)
let superadminToken;
let adminToken;
let staffToken;
let customerToken;

// Base user IDs (persistent across test suites)
let superadminId;
let adminId;
let staffId;
let customerId;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

const loginUser = async (credentials) => {
  const res = await request(app).post("/api/auth/login").send(credentials);
  return res.body.token;
};

// ─────────────────────────────────────────────────────────────────────────────
// Global setup / teardown
// ─────────────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  // Env vars required by JWT middleware — must be set before any request
  process.env.JWT_SECRET      = "test-jwt-secret-for-testing-only";
  process.env.JWT_EXPIRES_IN  = "1d";

  // Create base users (password is hashed by the pre("save") hook)
  const sa = await User.create({
    name: "Test SuperAdmin", username: "testsuperadmin",
    password: TEST_PASSWORD, role: "superadmin",
  });
  superadminId = sa._id.toString();

  const admin = await User.create({
    name: "Test Admin", username: "testadmin",
    password: TEST_PASSWORD, role: "admin",
  });
  adminId = admin._id.toString();

  const staff = await User.create({
    name: "Test Staff", username: "teststaff",
    password: TEST_PASSWORD, role: "staff",
  });
  staffId = staff._id.toString();

  const customer = await User.create({
    name: "Test Customer", email: "testcustomer@example.com",
    password: TEST_PASSWORD, role: "customer",
  });
  customerId = customer._id.toString();

  // Get JWTs via the login endpoint (verifies login flow also works)
  superadminToken = await loginUser({ username: "testsuperadmin",          password: TEST_PASSWORD });
  adminToken      = await loginUser({ username: "testadmin",               password: TEST_PASSWORD });
  staffToken      = await loginUser({ username: "teststaff",               password: TEST_PASSWORD });
  customerToken   = await loginUser({ email: "testcustomer@example.com",   password: TEST_PASSWORD });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

// =============================================================================
// REGRESSION — Existing Endpoints
// =============================================================================
describe("Regression: Existing Auth Endpoints", () => {
  test("POST /api/auth/register creates a customer account", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Reg User", email: "reguser@example.com", password: "pass123",
    });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("customer");
    expect(res.body.token).toBeDefined();
    expect(res.body.password).toBeUndefined();
  });

  test("POST /api/auth/register ignores any 'role' field in body (always customer)", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Fake SA", email: "fakesa@example.com", password: "pass123", role: "superadmin",
    });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("customer");
  });

  test("POST /api/auth/login works for superadmin with username", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "testsuperadmin", password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.role).toBe("superadmin");
    expect(res.body.password).toBeUndefined();
  });

  test("POST /api/auth/login works for admin with username", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "testadmin", password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test("POST /api/auth/login works for customer with email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "testcustomer@example.com", password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test("GET /api/auth/me returns current user without password", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set(authHeader(superadminToken));
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("superadmin");
    expect(res.body.password).toBeUndefined();
  });

  test("GET /api/auth/me → 401 with no token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  test("POST /api/admin/create (superadmin) creates an admin", async () => {
    const res = await request(app)
      .post("/api/admin/create")
      .set(authHeader(superadminToken))
      .send({ name: "Reg Admin", username: "regadmin", password: "pass123", role: "admin" });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("admin");
  });

  test("POST /api/admin/create (superadmin) falls back to 'staff' when role='superadmin'", async () => {
    const res = await request(app)
      .post("/api/admin/create")
      .set(authHeader(superadminToken))
      .send({ name: "No SA", username: "nosaattempt", password: "pass123", role: "superadmin" });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("staff"); // superadmin is blocked; defaults to staff
  });

  test("POST /api/admin/create (admin) always creates staff regardless of body.role", async () => {
    const res = await request(app)
      .post("/api/admin/create")
      .set(authHeader(adminToken))
      .send({ name: "Forced Staff", username: "forcedstaff", password: "pass123", role: "admin" });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("staff");
  });

  test("GET /api/admin/customers returns only customers without passwords (admin)", async () => {
    const res = await request(app)
      .get("/api/admin/customers")
      .set(authHeader(adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    res.body.forEach((u) => {
      expect(u.role).toBe("customer");
      expect(u.password).toBeUndefined();
    });
  });

  test("GET /api/admin/customers returns only customers (superadmin)", async () => {
    const res = await request(app)
      .get("/api/admin/customers")
      .set(authHeader(superadminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("GET /api/admin/customers → 403 for staff", async () => {
    const res = await request(app)
      .get("/api/admin/customers")
      .set(authHeader(staffToken));
    expect(res.status).toBe(403);
  });
});

// =============================================================================
// INACTIVE USER HANDLING
// =============================================================================
describe("Inactive User Handling", () => {
  let inactiveUser;
  let inactiveToken; // token obtained while user was still active

  beforeAll(async () => {
    inactiveUser = await User.create({
      name: "Inactive Admin", username: "inactiveadmin",
      password: TEST_PASSWORD, role: "admin",
    });
    // Capture token while user is still active
    inactiveToken = await loginUser({ username: "inactiveadmin", password: TEST_PASSWORD });
    // Deactivate via DB (simulates an admin deactivating the user)
    await User.findByIdAndUpdate(inactiveUser._id, { isActive: false });
  });

  test("Inactive user cannot log in — receives 403", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "inactiveadmin", password: TEST_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/deactivated/i);
  });

  test("Inactive user's previously issued JWT is rejected on GET /api/auth/me — 401", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set(authHeader(inactiveToken));
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/deactivated/i);
  });

  test("Inactive user's JWT is rejected on a protected admin route — 401", async () => {
    const res = await request(app)
      .get("/api/admin/customers")
      .set(authHeader(inactiveToken));
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// GET /api/admin/admins
// =============================================================================
describe("GET /api/admin/admins", () => {
  test("unauthenticated → 401", async () => {
    const res = await request(app).get("/api/admin/admins");
    expect(res.status).toBe(401);
  });

  test("customer token → 403", async () => {
    const res = await request(app).get("/api/admin/admins").set(authHeader(customerToken));
    expect(res.status).toBe(403);
  });

  test("staff token → 403", async () => {
    const res = await request(app).get("/api/admin/admins").set(authHeader(staffToken));
    expect(res.status).toBe(403);
  });

  test("admin token → 403", async () => {
    const res = await request(app).get("/api/admin/admins").set(authHeader(adminToken));
    expect(res.status).toBe(403);
  });

  test("superadmin → 200, array of admin-role users, no passwords", async () => {
    const res = await request(app).get("/api/admin/admins").set(authHeader(superadminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    res.body.forEach((u) => {
      expect(u.role).toBe("admin");
      expect(u.password).toBeUndefined();
    });
  });
});

// =============================================================================
// GET /api/admin/staff
// =============================================================================
describe("GET /api/admin/staff", () => {
  test("unauthenticated → 401", async () => {
    const res = await request(app).get("/api/admin/staff");
    expect(res.status).toBe(401);
  });

  test("customer token → 403", async () => {
    const res = await request(app).get("/api/admin/staff").set(authHeader(customerToken));
    expect(res.status).toBe(403);
  });

  test("staff token → 403", async () => {
    const res = await request(app).get("/api/admin/staff").set(authHeader(staffToken));
    expect(res.status).toBe(403);
  });

  test("admin token → 403", async () => {
    const res = await request(app).get("/api/admin/staff").set(authHeader(adminToken));
    expect(res.status).toBe(403);
  });

  test("superadmin → 200, array of staff-role users, no passwords", async () => {
    const res = await request(app).get("/api/admin/staff").set(authHeader(superadminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    res.body.forEach((u) => {
      expect(u.role).toBe("staff");
      expect(u.password).toBeUndefined();
    });
  });
});

// =============================================================================
// GET /api/admin/users/:id
// =============================================================================
describe("GET /api/admin/users/:id", () => {
  test("unauthenticated → 401", async () => {
    const res = await request(app).get(`/api/admin/users/${adminId}`);
    expect(res.status).toBe(401);
  });

  test("customer token → 403", async () => {
    const res = await request(app)
      .get(`/api/admin/users/${adminId}`)
      .set(authHeader(customerToken));
    expect(res.status).toBe(403);
  });

  test("staff token → 403", async () => {
    const res = await request(app)
      .get(`/api/admin/users/${adminId}`)
      .set(authHeader(staffToken));
    expect(res.status).toBe(403);
  });

  test("admin token → 403", async () => {
    const res = await request(app)
      .get(`/api/admin/users/${adminId}`)
      .set(authHeader(adminToken));
    expect(res.status).toBe(403);
  });

  test("superadmin can retrieve an admin by id", async () => {
    const res = await request(app)
      .get(`/api/admin/users/${adminId}`)
      .set(authHeader(superadminToken));
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(adminId);
    expect(res.body.role).toBe("admin");
    expect(res.body.password).toBeUndefined();
  });

  test("superadmin can retrieve a staff member by id", async () => {
    const res = await request(app)
      .get(`/api/admin/users/${staffId}`)
      .set(authHeader(superadminToken));
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(staffId);
    expect(res.body.role).toBe("staff");
    expect(res.body.password).toBeUndefined();
  });

  test("customer id on this endpoint → 403 (wrong endpoint)", async () => {
    const res = await request(app)
      .get(`/api/admin/users/${customerId}`)
      .set(authHeader(superadminToken));
    expect(res.status).toBe(403);
  });

  test("non-existent ObjectId → 404", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/admin/users/${fakeId}`)
      .set(authHeader(superadminToken));
    expect(res.status).toBe(404);
  });

  test("invalid ObjectId string → 400", async () => {
    const res = await request(app)
      .get("/api/admin/users/not-a-valid-objectid")
      .set(authHeader(superadminToken));
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// PUT /api/admin/users/:id  (update profile)
// =============================================================================
describe("PUT /api/admin/users/:id", () => {
  let updateTargetId;

  beforeAll(async () => {
    const u = await User.create({
      name: "Update Target", username: "updatetarget",
      password: TEST_PASSWORD, role: "admin",
    });
    updateTargetId = u._id.toString();
  });

  test("unauthenticated → 401", async () => {
    const res = await request(app)
      .put(`/api/admin/users/${updateTargetId}`)
      .send({ name: "X" });
    expect(res.status).toBe(401);
  });

  test("customer token → 403", async () => {
    const res = await request(app)
      .put(`/api/admin/users/${updateTargetId}`)
      .set(authHeader(customerToken))
      .send({ name: "X" });
    expect(res.status).toBe(403);
  });

  test("staff token → 403", async () => {
    const res = await request(app)
      .put(`/api/admin/users/${updateTargetId}`)
      .set(authHeader(staffToken))
      .send({ name: "X" });
    expect(res.status).toBe(403);
  });

  test("admin token → 403", async () => {
    const res = await request(app)
      .put(`/api/admin/users/${updateTargetId}`)
      .set(authHeader(adminToken))
      .send({ name: "X" });
    expect(res.status).toBe(403);
  });

  test("superadmin can update an admin's name", async () => {
    const res = await request(app)
      .put(`/api/admin/users/${updateTargetId}`)
      .set(authHeader(superadminToken))
      .send({ name: "Updated Name" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Name");
    expect(res.body.password).toBeUndefined();
  });

  test("superadmin can update an admin's username", async () => {
    const res = await request(app)
      .put(`/api/admin/users/${updateTargetId}`)
      .set(authHeader(superadminToken))
      .send({ username: "updatedusername" });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("updatedusername");
    expect(res.body.password).toBeUndefined();
  });

  test("duplicate username → 400", async () => {
    const res = await request(app)
      .put(`/api/admin/users/${updateTargetId}`)
      .set(authHeader(superadminToken))
      .send({ username: "testadmin" }); // already used by testadmin
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/taken/i);
  });

  test("injected 'role' field in body is silently ignored", async () => {
    const res = await request(app)
      .put(`/api/admin/users/${updateTargetId}`)
      .set(authHeader(superadminToken))
      .send({ role: "superadmin", name: "Role Inject Test" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin"); // unchanged
  });

  test("cannot update a superadmin account → 403", async () => {
    const res = await request(app)
      .put(`/api/admin/users/${superadminId}`)
      .set(authHeader(superadminToken))
      .send({ name: "Hacked SA" });
    expect(res.status).toBe(403);
  });

  test("cannot update a customer via this endpoint → 403", async () => {
    const res = await request(app)
      .put(`/api/admin/users/${customerId}`)
      .set(authHeader(superadminToken))
      .send({ name: "Hacked Customer" });
    expect(res.status).toBe(403);
  });

  test("non-existent id → 404", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .put(`/api/admin/users/${fakeId}`)
      .set(authHeader(superadminToken))
      .send({ name: "Ghost" });
    expect(res.status).toBe(404);
  });

  test("invalid ObjectId → 400", async () => {
    const res = await request(app)
      .put("/api/admin/users/bad-id")
      .set(authHeader(superadminToken))
      .send({ name: "X" });
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// PATCH /api/admin/users/:id/status  (activate / deactivate)
// =============================================================================
describe("PATCH /api/admin/users/:id/status", () => {
  let statusAdmin;
  let statusStaff;

  beforeAll(async () => {
    statusAdmin = await User.create({
      name: "Status Admin", username: "statusadmin",
      password: TEST_PASSWORD, role: "admin",
    });
    statusStaff = await User.create({
      name: "Status Staff", username: "statusstaff",
      password: TEST_PASSWORD, role: "staff",
    });
  });

  test("unauthenticated → 401", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${statusAdmin._id}/status`)
      .send({ isActive: false });
    expect(res.status).toBe(401);
  });

  test("customer token → 403", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${statusAdmin._id}/status`)
      .set(authHeader(customerToken))
      .send({ isActive: false });
    expect(res.status).toBe(403);
  });

  test("staff token → 403", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${statusAdmin._id}/status`)
      .set(authHeader(staffToken))
      .send({ isActive: false });
    expect(res.status).toBe(403);
  });

  test("admin token → 403", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${statusAdmin._id}/status`)
      .set(authHeader(adminToken))
      .send({ isActive: false });
    expect(res.status).toBe(403);
  });

  test("superadmin can deactivate an admin", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${statusAdmin._id}/status`)
      .set(authHeader(superadminToken))
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
    expect(res.body.password).toBeUndefined();
  });

  test("superadmin can re-activate an admin", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${statusAdmin._id}/status`)
      .set(authHeader(superadminToken))
      .send({ isActive: true });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(true);
  });

  test("superadmin can deactivate a staff member", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${statusStaff._id}/status`)
      .set(authHeader(superadminToken))
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
  });

  test("superadmin can re-activate a staff member", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${statusStaff._id}/status`)
      .set(authHeader(superadminToken))
      .send({ isActive: true });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(true);
  });

  test("cannot deactivate self → 403", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${superadminId}/status`)
      .set(authHeader(superadminToken))
      .send({ isActive: false });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/own/i);
  });

  test("cannot deactivate another superadmin → 403", async () => {
    const sa2 = await User.create({
      name: "SA2", username: "sa2status", password: TEST_PASSWORD, role: "superadmin",
    });
    const res = await request(app)
      .patch(`/api/admin/users/${sa2._id}/status`)
      .set(authHeader(superadminToken))
      .send({ isActive: false });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/super admin/i);
    await User.findByIdAndDelete(sa2._id);
  });

  test("cannot change status of a customer via this endpoint → 403", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${customerId}/status`)
      .set(authHeader(superadminToken))
      .send({ isActive: false });
    expect(res.status).toBe(403);
  });

  test("isActive as string 'false' is rejected → 400", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${statusAdmin._id}/status`)
      .set(authHeader(superadminToken))
      .send({ isActive: "false" });  // string, not boolean
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/boolean/i);
  });

  test("non-existent id → 404", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .patch(`/api/admin/users/${fakeId}/status`)
      .set(authHeader(superadminToken))
      .send({ isActive: false });
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// DELETE /api/admin/users/:id
// =============================================================================
describe("DELETE /api/admin/users/:id", () => {
  test("unauthenticated → 401", async () => {
    const tmp = await User.create({
      name: "Del Tmp", username: "deltmp1", password: TEST_PASSWORD, role: "staff",
    });
    const res = await request(app).delete(`/api/admin/users/${tmp._id}`);
    expect(res.status).toBe(401);
    await User.findByIdAndDelete(tmp._id); // cleanup
  });

  test("customer token → 403", async () => {
    const tmp = await User.create({
      name: "Del Tmp", username: "deltmp2", password: TEST_PASSWORD, role: "staff",
    });
    const res = await request(app)
      .delete(`/api/admin/users/${tmp._id}`)
      .set(authHeader(customerToken));
    expect(res.status).toBe(403);
    await User.findByIdAndDelete(tmp._id);
  });

  test("staff token → 403", async () => {
    const tmp = await User.create({
      name: "Del Tmp", username: "deltmp3", password: TEST_PASSWORD, role: "admin",
    });
    const res = await request(app)
      .delete(`/api/admin/users/${tmp._id}`)
      .set(authHeader(staffToken));
    expect(res.status).toBe(403);
    await User.findByIdAndDelete(tmp._id);
  });

  test("admin token → 403", async () => {
    const tmp = await User.create({
      name: "Del Tmp", username: "deltmp4", password: TEST_PASSWORD, role: "staff",
    });
    const res = await request(app)
      .delete(`/api/admin/users/${tmp._id}`)
      .set(authHeader(adminToken));
    expect(res.status).toBe(403);
    await User.findByIdAndDelete(tmp._id);
  });

  test("superadmin can delete an admin account", async () => {
    const tmp = await User.create({
      name: "Delete Me Admin", username: "deletemeadmin",
      password: TEST_PASSWORD, role: "admin",
    });
    const res = await request(app)
      .delete(`/api/admin/users/${tmp._id}`)
      .set(authHeader(superadminToken));
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
    const gone = await User.findById(tmp._id);
    expect(gone).toBeNull();
  });

  test("superadmin can delete a staff account", async () => {
    const tmp = await User.create({
      name: "Delete Me Staff", username: "deletemestaff",
      password: TEST_PASSWORD, role: "staff",
    });
    const res = await request(app)
      .delete(`/api/admin/users/${tmp._id}`)
      .set(authHeader(superadminToken));
    expect(res.status).toBe(200);
    const gone = await User.findById(tmp._id);
    expect(gone).toBeNull();
  });

  test("cannot delete self → 403", async () => {
    const res = await request(app)
      .delete(`/api/admin/users/${superadminId}`)
      .set(authHeader(superadminToken));
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/own/i);
  });

  test("cannot delete another superadmin → 403", async () => {
    const sa2 = await User.create({
      name: "SA2 Del", username: "sa2del", password: TEST_PASSWORD, role: "superadmin",
    });
    const res = await request(app)
      .delete(`/api/admin/users/${sa2._id}`)
      .set(authHeader(superadminToken));
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/super admin/i);
    await User.findByIdAndDelete(sa2._id);
  });

  test("cannot delete a customer via this endpoint → 403", async () => {
    const res = await request(app)
      .delete(`/api/admin/users/${customerId}`)
      .set(authHeader(superadminToken));
    expect(res.status).toBe(403);
  });

  test("non-existent id → 404", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/api/admin/users/${fakeId}`)
      .set(authHeader(superadminToken));
    expect(res.status).toBe(404);
  });

  test("invalid ObjectId → 400", async () => {
    const res = await request(app)
      .delete("/api/admin/users/bad-object-id")
      .set(authHeader(superadminToken));
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// PATCH /api/admin/users/:id/role  (role change)
// =============================================================================
describe("PATCH /api/admin/users/:id/role", () => {
  let roleAdmin;
  let roleStaff;

  beforeAll(async () => {
    roleAdmin = await User.create({
      name: "Role Admin", username: "roleadmin",
      password: TEST_PASSWORD, role: "admin",
    });
    roleStaff = await User.create({
      name: "Role Staff", username: "rolestaff",
      password: TEST_PASSWORD, role: "staff",
    });
  });

  test("unauthenticated → 401", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${roleAdmin._id}/role`)
      .send({ role: "staff" });
    expect(res.status).toBe(401);
  });

  test("customer token → 403", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${roleAdmin._id}/role`)
      .set(authHeader(customerToken))
      .send({ role: "staff" });
    expect(res.status).toBe(403);
  });

  test("staff token → 403", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${roleAdmin._id}/role`)
      .set(authHeader(staffToken))
      .send({ role: "staff" });
    expect(res.status).toBe(403);
  });

  test("admin token → 403", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${roleAdmin._id}/role`)
      .set(authHeader(adminToken))
      .send({ role: "staff" });
    expect(res.status).toBe(403);
  });

  test("superadmin can demote admin → staff", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${roleAdmin._id}/role`)
      .set(authHeader(superadminToken))
      .send({ role: "staff" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("staff");
    expect(res.body.password).toBeUndefined();
    // Reset for subsequent tests
    await User.findByIdAndUpdate(roleAdmin._id, { role: "admin" });
  });

  test("superadmin can promote staff → admin", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${roleStaff._id}/role`)
      .set(authHeader(superadminToken))
      .send({ role: "admin" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");
    await User.findByIdAndUpdate(roleStaff._id, { role: "staff" });
  });

  test("promotion to 'superadmin' is rejected → 400", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${roleAdmin._id}/role`)
      .set(authHeader(superadminToken))
      .send({ role: "superadmin" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/staff.*admin|admin.*staff/i);
  });

  test("promotion to 'customer' is rejected → 400", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${roleAdmin._id}/role`)
      .set(authHeader(superadminToken))
      .send({ role: "customer" });
    expect(res.status).toBe(400);
  });

  test("cannot change role of a superadmin → 403", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${superadminId}/role`)
      .set(authHeader(superadminToken))
      .send({ role: "admin" });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/super admin/i);
  });

  test("cannot change own role → 403", async () => {
    // superadminId === self; superadmin check fires first
    const res = await request(app)
      .patch(`/api/admin/users/${superadminId}/role`)
      .set(authHeader(superadminToken))
      .send({ role: "admin" });
    expect(res.status).toBe(403);
  });

  test("cannot change role of a customer via this endpoint → 403", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${customerId}/role`)
      .set(authHeader(superadminToken))
      .send({ role: "admin" });
    expect(res.status).toBe(403);
  });

  test("no-op: same role → 400", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${roleAdmin._id}/role`)
      .set(authHeader(superadminToken))
      .send({ role: "admin" }); // already admin
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already/i);
  });

  test("invalid role string → 400", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${roleAdmin._id}/role`)
      .set(authHeader(superadminToken))
      .send({ role: "manager" });
    expect(res.status).toBe(400);
  });

  test("missing role field → 400", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${roleAdmin._id}/role`)
      .set(authHeader(superadminToken))
      .send({});
    expect(res.status).toBe(400);
  });

  test("non-existent id → 404", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .patch(`/api/admin/users/${fakeId}/role`)
      .set(authHeader(superadminToken))
      .send({ role: "staff" });
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// PATCH /api/admin/users/:id/password  (password reset)
// =============================================================================
describe("PATCH /api/admin/users/:id/password", () => {
  let pwAdmin;
  let pwStaff;

  beforeAll(async () => {
    pwAdmin = await User.create({
      name: "PW Admin", username: "pwadmin",
      password: TEST_PASSWORD, role: "admin",
    });
    pwStaff = await User.create({
      name: "PW Staff", username: "pwstaff",
      password: TEST_PASSWORD, role: "staff",
    });
  });

  test("unauthenticated → 401", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${pwAdmin._id}/password`)
      .send({ newPassword: "newpass123" });
    expect(res.status).toBe(401);
  });

  test("customer token → 403", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${pwAdmin._id}/password`)
      .set(authHeader(customerToken))
      .send({ newPassword: "newpass123" });
    expect(res.status).toBe(403);
  });

  test("staff token → 403", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${pwAdmin._id}/password`)
      .set(authHeader(staffToken))
      .send({ newPassword: "newpass123" });
    expect(res.status).toBe(403);
  });

  test("admin token → 403", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${pwAdmin._id}/password`)
      .set(authHeader(adminToken))
      .send({ newPassword: "newpass123" });
    expect(res.status).toBe(403);
  });

  test("superadmin can reset admin password — returns success message only", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${pwAdmin._id}/password`)
      .set(authHeader(superadminToken))
      .send({ newPassword: "newadminpass" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset/i);
    // Password hash must NEVER appear in the response
    expect(res.body.password).toBeUndefined();
    expect(res.body.newPassword).toBeUndefined();
  });

  test("admin can log in with new password after reset", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "pwadmin", password: "newadminpass" });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();
  });

  test("admin cannot log in with old password after reset", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "pwadmin", password: TEST_PASSWORD }); // old password
    expect(loginRes.status).toBe(401);
  });

  test("password is stored hashed (pre-save hook) — not plaintext", async () => {
    const dbUser = await User.findById(pwAdmin._id);
    // The hash should start with $2b$ (bcrypt) and NOT equal the plaintext
    expect(dbUser.password).not.toBe("newadminpass");
    expect(dbUser.password).toMatch(/^\$2[ab]\$/);
  });

  test("superadmin can reset staff password", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${pwStaff._id}/password`)
      .set(authHeader(superadminToken))
      .send({ newPassword: "newstaffpass" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset/i);
    expect(res.body.password).toBeUndefined();
  });

  test("cannot reset a superadmin's password → 403", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${superadminId}/password`)
      .set(authHeader(superadminToken))
      .send({ newPassword: "hackedsapass" });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/super admin/i);
  });

  test("cannot reset a customer's password via this endpoint → 403", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${customerId}/password`)
      .set(authHeader(superadminToken))
      .send({ newPassword: "hackedcust" });
    expect(res.status).toBe(403);
  });

  test("password shorter than 6 chars → 400", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${pwAdmin._id}/password`)
      .set(authHeader(superadminToken))
      .send({ newPassword: "abc" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/6/);
  });

  test("missing newPassword field → 400", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${pwAdmin._id}/password`)
      .set(authHeader(superadminToken))
      .send({});
    expect(res.status).toBe(400);
  });

  test("non-existent id → 404", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .patch(`/api/admin/users/${fakeId}/password`)
      .set(authHeader(superadminToken))
      .send({ newPassword: "newpass123" });
    expect(res.status).toBe(404);
  });

  test("invalid ObjectId → 400", async () => {
    const res = await request(app)
      .patch("/api/admin/users/bad-id/password")
      .set(authHeader(superadminToken))
      .send({ newPassword: "newpass123" });
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// SUPER ADMIN SELF-PROTECTION (consolidated)
// =============================================================================
describe("Super Admin Self-Protection", () => {
  test("cannot delete own account", async () => {
    const res = await request(app)
      .delete(`/api/admin/users/${superadminId}`)
      .set(authHeader(superadminToken));
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/own/i);
  });

  test("cannot deactivate own account", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${superadminId}/status`)
      .set(authHeader(superadminToken))
      .send({ isActive: false });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/own/i);
  });

  test("cannot change own role", async () => {
    // Blocked by 'superadmin target' check (fires before self-check)
    const res = await request(app)
      .patch(`/api/admin/users/${superadminId}/role`)
      .set(authHeader(superadminToken))
      .send({ role: "admin" });
    expect(res.status).toBe(403);
  });

  test("cannot create another superadmin via /api/admin/create", async () => {
    const res = await request(app)
      .post("/api/admin/create")
      .set(authHeader(superadminToken))
      .send({ name: "SA Attempt", username: "saattempt2", password: "pass123", role: "superadmin" });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("staff"); // silently demoted to staff
    // Clean up
    await User.findByIdAndDelete(res.body._id);
  });
});
