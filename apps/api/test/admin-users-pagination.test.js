const assert = require("node:assert/strict");
const test = require("node:test");
const { plainToInstance } = require("class-transformer");
const { validate } = require("class-validator");
const { AccountStatus } = require("@prisma/client");
const { AdminService } = require("../dist/src/admin/admin.service.js");
const { AdminUsersListDto } = require("../dist/src/admin/dto/admin-users-list.dto.js");

function fixture(total = 63) {
  const reads = [];
  const service = new AdminService({ user: {
    count: async (query) => { reads.push({ count: query }); return total; },
    findMany: async (query) => {
      reads.push({ users: query });
      return [{ id: "user-26", displayName: "Ada", email: "ada@example.invalid", profile: null,
        _count: { matchesA: 2, matchesB: 3, tickets: 4, roomMemberships: 1 } }];
    }
  } }, {}, {});
  return { service, reads };
}

test("admin users load only one bounded page, with a total count and stable ordering", async () => {
  const { service, reads } = fixture();
  const response = await service.getUsers(plainToInstance(AdminUsersListDto, { page: "2" }));
  assert.deepEqual(response.pagination, { page: 2, pageSize: 25, total: 63, totalPages: 3 });
  assert.equal(reads[1].users.skip, 25);
  assert.equal(reads[1].users.take, 25);
  assert.deepEqual(reads[1].users.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  assert.equal(reads[1].users.where.accountStatus.not, AccountStatus.DELETED);
  assert.deepEqual(reads[0].count.where, reads[1].users.where);
  assert.equal(response.users[0].matchCount, 5);
});

test("search and status filters apply to both the count and the database page", async () => {
  const { service, reads } = fixture(4);
  const query = plainToInstance(AdminUsersListDto, { search: "  ADA  ", status: AccountStatus.BANNED });
  const response = await service.getUsers(query);
  assert.deepEqual(reads[0].count.where, {
    accountStatus: AccountStatus.BANNED,
    OR: [
      { displayName: { contains: "ADA", mode: "insensitive" } },
      { email: { contains: "ADA", mode: "insensitive" } }
    ]
  });
  assert.deepEqual(reads[1].users.where, reads[0].count.where);
  assert.equal(response.pagination.total, 4);
});

test("empty results and pages beyond the last page normalize to a valid page", async () => {
  for (const [total, page, skip] of [[0, 1, 0], [51, 3, 50]]) {
    const { service, reads } = fixture(total);
    const result = await service.getUsers(plainToInstance(AdminUsersListDto, { page: "999" }));
    assert.equal(result.pagination.page, page);
    assert.equal(result.pagination.totalPages, page);
    assert.equal(reads[1].users.skip, skip);
    assert.equal(reads[1].users.take, 25);
  }
});

test("admin user pagination validates query values and caps the page size", async () => {
  const defaults = plainToInstance(AdminUsersListDto, {});
  assert.deepEqual(await validate(defaults), []);
  assert.equal(defaults.page, 1);
  assert.equal(defaults.pageSize, 25);
  assert.deepEqual(await validate(plainToInstance(AdminUsersListDto, { page: "2", pageSize: "100" })), []);
  for (const invalid of [
    { page: "0" }, { page: "-1" }, { page: "1.5" }, { page: "oops" }, { page: "1000001" },
    { pageSize: "0" }, { pageSize: "101" }, { pageSize: "2.5" }, { search: ["Ada", "Bob"] },
    { search: "x".repeat(201) }, { status: AccountStatus.DELETED }, { status: "unknown" }
  ]) {
    assert.ok((await validate(plainToInstance(AdminUsersListDto, invalid))).length > 0, JSON.stringify(invalid));
  }
});
