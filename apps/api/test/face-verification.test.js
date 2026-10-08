const assert = require("node:assert/strict");
const test = require("node:test");
const sharp = require("sharp");
const { VerificationService } = require("../dist/src/verification/verification.service.js");

const storedPhoto = sharp({
  create: { width: 64, height: 64, channels: 3, background: "#dddddd" }
}).webp().toBuffer();

function harness({ mode = "prototype-pass", result = {}, compare, storageError, resultError } = {}) {
  const calls = { attempts: [], users: [], comparisons: [] };
  const prisma = {
    faceVerificationAttempt: {
      findFirst: async ({ where }) => {
        assert.deepEqual(where, { id: "attempt-1", userId: "user-1" });
        return { id: "attempt-1", providerSessionId: "session-1", referenceImageBucket: "staging-verification" };
      },
      update: async ({ data }) => {
        calls.attempts.push(data);
        return data;
      }
    },
    user: { update: async ({ data }) => { calls.users.push(data); } },
    profilePhoto: {
      findMany: async () => [{ id: "photo-1", fullObjectKey: "profiles/user-1/full.webp" }]
    }
  };
  const storage = {
    getObjectBuffer: async (key) => {
      assert.equal(key, "profiles/user-1/full.webp");
      if (storageError) throw storageError;
      return storedPhoto;
    }
  };
  const config = {
    get: (key) => ({
      FACE_VERIFICATION_MODE: mode,
      FACE_VERIFICATION_REQUIRED: "true",
      AWS_VERIFICATION_BUCKET: "staging-verification"
    })[key]
  };
  const service = new VerificationService(prisma, storage, config);
  service.getClient = () => ({
    send: async (command) => {
      if (command.constructor.name === "GetFaceLivenessSessionResultsCommand") {
        if (resultError) throw resultError;
        return {
          Status: "SUCCEEDED",
          Confidence: 99,
          ReferenceImage: { S3Object: { Bucket: "staging-verification", Name: "face-liveness/reference.jpg" } },
          ...result
        };
      }
      assert.equal(command.constructor.name, "CompareFacesCommand");
      calls.comparisons.push(command.input);
      return compare ? compare(command.input) : { FaceMatches: [{ Similarity: 32.5 }] };
    }
  });
  return { service, calls, complete: () => service.completeFaceLivenessSession("user-1", "attempt-1") };
}

test("verification converts stored WebP to JPEG before comparing faces", async () => {
  const { complete } = harness({
    compare: async ({ SourceImage, TargetImage, SimilarityThreshold }) => {
      assert.equal((await sharp(TargetImage.Bytes).metadata()).format, "jpeg");
      assert.equal(SourceImage.S3Object.Bucket, "staging-verification");
      assert.equal(SimilarityThreshold, 0);
      return { FaceMatches: [{ Similarity: 95 }] };
    }
  });
  const result = await complete();
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.overrideReason, null);
});

for (const mode of ["prototype-pass", "enforce"]) {
  test(`${mode} preserves a failed face match and applies only the configured override`, async () => {
    const { complete, calls } = harness({ mode });
    const result = await complete();
    const bypass = mode === "prototype-pass";
    assert.equal(result.status, "FAILED");
    assert.equal(result.faceMatchSimilarity, 32.5);
    assert.equal(result.effectiveStatus, bypass ? "VERIFIED" : "FAILED");
    assert.equal(result.verified, bypass);
    assert.equal(result.overrideReason, bypass ? "PROTOTYPE_BYPASS" : null);
    assert.equal(calls.attempts[0].status, "FAILED");
    assert.equal(calls.users[0].faceVerificationStatus, result.effectiveStatus);
    assert.equal(calls.users[0].faceVerificationVerifiedAt !== null, bypass);
  });

  test(`${mode} records a no-face AWS rejection instead of losing the completed result`, async () => {
    const { complete, calls } = harness({
      mode,
      compare: () => { throw Object.assign(new Error("No faces detected"), { name: "InvalidParameterException" }); }
    });
    const result = await complete();
    assert.equal(result.status, "REVIEW_REQUIRED");
    assert.equal(result.faceMatchSimilarity, null);
    assert.match(result.failureReason, /No comparable face/);
    assert.equal(result.verified, mode === "prototype-pass");
    assert.equal(calls.attempts[0].status, "REVIEW_REQUIRED");
  });

  test(`${mode} records failed liveness even when AWS returns no reference image`, async () => {
    const { complete, calls } = harness({ mode, result: { Status: "FAILED", Confidence: 12, ReferenceImage: undefined } });
    const result = await complete();
    assert.equal(result.status, "FAILED");
    assert.equal(result.livenessConfidence, 12);
    assert.equal(result.verified, mode === "prototype-pass");
    assert.equal(calls.attempts[0].referenceImageKey, null);
    assert.equal(calls.comparisons.length, 0);
  });
}

test("low liveness confidence is recorded without requiring a comparison image", async () => {
  const { complete, calls } = harness({ result: { Confidence: 35, ReferenceImage: undefined } });
  const result = await complete();
  assert.equal(result.status, "FAILED");
  assert.equal(result.verified, true);
  assert.match(result.failureReason, /below the required threshold/);
  assert.equal(calls.comparisons.length, 0);
});

for (const status of ["CREATED", "IN_PROGRESS", "EXPIRED", undefined]) {
  test(`prototype mode cannot verify a session with AWS status ${status}`, async () => {
    const { complete, calls } = harness({ result: { Status: status } });
    await assert.rejects(complete(), /not complete|expired/);
    assert.equal(calls.attempts.length, 0);
    assert.equal(calls.users.length, 0);
    assert.equal(calls.comparisons.length, 0);
  });
}

for (const name of ["AccessDeniedException", "InvalidS3ObjectException", "ThrottlingException", "InternalServerError"]) {
  test(`prototype mode does not bypass the AWS comparison error ${name}`, async () => {
    const error = Object.assign(new Error(name), { name });
    const { complete, calls } = harness({ compare: () => { throw error; } });
    await assert.rejects(complete(), (actual) => actual === error);
    assert.equal(calls.attempts.length, 0);
    assert.equal(calls.users.length, 0);
  });
}

test("prototype mode does not bypass a storage failure", async () => {
  const error = new Error("Photo storage unavailable");
  const { complete, calls } = harness({ storageError: error });
  await assert.rejects(complete(), (actual) => actual === error);
  assert.equal(calls.users.length, 0);
});

test("prototype mode requires a real AWS session result", async () => {
  const error = Object.assign(new Error("Access denied"), { name: "AccessDeniedException" });
  const { complete, calls } = harness({ resultError: error });
  await assert.rejects(complete(), (actual) => actual === error);
  assert.equal(calls.attempts.length, 0);
  assert.equal(calls.users.length, 0);
});

test("a successful liveness result still needs its reference image for face comparison", async () => {
  const { complete, calls } = harness({ result: { ReferenceImage: undefined } });
  await assert.rejects(complete(), /did not include a reference image/);
  assert.equal(calls.users.length, 0);
});
