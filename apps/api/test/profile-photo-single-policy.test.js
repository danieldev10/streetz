const assert = require("node:assert/strict");
const test = require("node:test");
const { ProfilesService } = require("../dist/src/profiles/profiles.service.js");

function photo(id, slot, sortOrder) {
  return {
    id,
    userId: "user-1",
    url: `https://cdn.example/${id}.jpg`,
    objectKey: `profiles/user-1/${id}.jpg`,
    thumbUrl: `https://cdn.example/${id}/thumb.webp`,
    thumbObjectKey: `profiles/user-1/${id}/thumb.webp`,
    cardUrl: `https://cdn.example/${id}/card.webp`,
    cardObjectKey: `profiles/user-1/${id}/card.webp`,
    fullUrl: `https://cdn.example/${id}/full.webp`,
    fullObjectKey: `profiles/user-1/${id}/full.webp`,
    blurDataUrl: null,
    slot,
    sortOrder,
    createdAt: new Date(`2026-01-0${slot + 1}T00:00:00.000Z`)
  };
}

test("registering a profile photo atomically replaces the primary and removes all previous S3 objects", async () => {
  const existingPhotos = [photo("primary", 0, 0), photo("secondary", 1, 1)];
  const calls = {
    deletedRows: null,
    updatedPhoto: null,
    updatedUser: null,
    deletedObjects: null
  };
  const transaction = {
    $queryRaw: async () => [{ id: "user-1" }],
    profilePhoto: {
      findMany: async () => existingPhotos,
      deleteMany: async (args) => {
        calls.deletedRows = args;
        return { count: 1 };
      },
      update: async (args) => {
        calls.updatedPhoto = args;
        return { ...existingPhotos[0], ...args.data };
      },
      create: async () => {
        throw new Error("replacement must update the retained row");
      }
    },
    user: {
      update: async (args) => {
        calls.updatedUser = args;
        return {};
      }
    }
  };
  const prisma = {
    $transaction: async (callback) => callback(transaction),
    profilePhoto: {
      count: async () => 1
    }
  };
  const storage = {
    buildPublicUrl: (key) => `https://cdn.example/${key}`,
    deleteObjects: async (keys) => {
      calls.deletedObjects = keys;
    },
    signPhotoUrl: async (value) => value
  };
  const service = new ProfilesService(prisma, storage, {});
  service.createOptimizedPhotoVariants = async () => ({
    thumbObjectKey: "profiles/user-1/new/thumb.webp",
    thumbUrl: "https://cdn.example/profiles/user-1/new/thumb.webp",
    cardObjectKey: "profiles/user-1/new/card.webp",
    cardUrl: "https://cdn.example/profiles/user-1/new/card.webp",
    fullObjectKey: "profiles/user-1/new/full.webp",
    fullUrl: "https://cdn.example/profiles/user-1/new/full.webp",
    blurDataUrl: "data:image/webp;base64,new"
  });

  const result = await service.registerPhoto("user-1", {
    objectKey: "profiles/user-1/new.jpg",
    sortOrder: 3
  });

  assert.deepEqual(calls.deletedRows, { where: { id: { in: ["secondary"] } } });
  assert.equal(calls.updatedPhoto.where.id, "primary");
  assert.equal(calls.updatedPhoto.data.slot, 0);
  assert.equal(calls.updatedPhoto.data.sortOrder, 0);
  assert.equal(calls.updatedPhoto.data.objectKey, "profiles/user-1/new.jpg");
  assert.deepEqual(calls.updatedUser.data, {
    faceVerificationStatus: "NOT_STARTED",
    faceVerificationVerifiedAt: null,
    faceVerificationOverrideReason: null
  });
  assert.deepEqual(
    new Set(calls.deletedObjects),
    new Set(existingPhotos.flatMap((item) => [
      item.objectKey,
      item.thumbObjectKey,
      item.cardObjectKey,
      item.fullObjectKey
    ]))
  );
  assert.equal(result.id, "primary");
  assert.equal(result.objectKey, "profiles/user-1/new.jpg");
});

test("the last profile photo cannot be deleted directly", async () => {
  const prisma = {
    profilePhoto: {
      findUnique: async () => photo("primary", 0, 0),
      count: async () => 1
    }
  };
  const service = new ProfilesService(prisma, {}, {});

  await assert.rejects(
    service.deletePhoto("user-1", "primary"),
    /Upload a replacement before removing your current profile photo/
  );
});
