const assert = require("node:assert/strict");
const test = require("node:test");
const { StorageService } = require("../dist/src/storage/storage.service.js");

test("stable CDN photo delivery does not generate signed fallback URLs", async () => {
  const config = {
    get(key) {
      return key === "MEDIA_CDN_BASE_URL" ? "https://media.example.com" : undefined;
    }
  };
  const storage = new StorageService(config);
  let signingCalls = 0;
  storage.createReadUrl = async () => {
    signingCalls += 1;
    return "https://signed.example.com/unexpected";
  };

  const photo = await storage.signPhotoUrl({
    id: "photo-1",
    url: "https://old.example.com/original.jpg",
    objectKey: "profiles/user-1/original.jpg",
    thumbObjectKey: "profiles/user-1/thumb.webp",
    cardObjectKey: "profiles/user-1/card.webp",
    fullObjectKey: "profiles/user-1/full.webp"
  });

  assert.equal(signingCalls, 0);
  assert.equal(photo.url, "https://media.example.com/profiles/user-1/card.webp");
  assert.equal(photo.thumbUrl, "https://media.example.com/profiles/user-1/thumb.webp");
  assert.equal(photo.fallbackUrl, null);
  assert.equal(photo.cardFallbackUrl, null);
});
