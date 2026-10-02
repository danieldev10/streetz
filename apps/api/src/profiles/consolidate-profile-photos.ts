import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

type CleanupPhoto = {
  id: string;
  objectKey: string | null;
  thumbObjectKey: string | null;
  cardObjectKey: string | null;
  fullObjectKey: string | null;
  sortOrder: number;
  slot: number;
  createdAt: Date;
};

type ManifestEntry = {
  userId: string;
  keptPhotoId: string;
  removedPhotos: Array<{
    id: string;
    objectKeys: string[];
  }>;
  status: "pending" | "database-cleaned" | "complete" | "s3-partial" | "skipped" | "failed";
  deletedObjectKeys: string[];
  failedObjectKeys: string[];
  error?: string;
};

type CleanupManifest = {
  generatedAt: string;
  mode: "dry-run" | "apply" | "retry-s3";
  entries: ManifestEntry[];
};

const photoOrderBy = [
  { sortOrder: "asc" as const },
  { createdAt: "asc" as const },
  { id: "asc" as const }
];

function getArgument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function getObjectKeys(photo: CleanupPhoto) {
  return Array.from(new Set([
    photo.objectKey,
    photo.thumbObjectKey,
    photo.cardObjectKey,
    photo.fullObjectKey
  ].filter((objectKey): objectKey is string => Boolean(objectKey))));
}

async function writeManifest(path: string, manifest: CleanupManifest) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
}

async function isObjectKeyReferenced(prisma: PrismaService, objectKey: string) {
  return (await prisma.profilePhoto.count({
    where: {
      OR: [
        { objectKey },
        { thumbObjectKey: objectKey },
        { cardObjectKey: objectKey },
        { fullObjectKey: objectKey }
      ]
    }
  })) > 0;
}

async function deleteUnreferencedObjects(
  prisma: PrismaService,
  storage: StorageService,
  objectKeys: string[]
) {
  const deletedObjectKeys: string[] = [];
  const failedObjectKeys: string[] = [];

  for (const objectKey of Array.from(new Set(objectKeys))) {
    try {
      if (await isObjectKeyReferenced(prisma, objectKey)) {
        failedObjectKeys.push(objectKey);
        continue;
      }

      await storage.deleteObject(objectKey);
      deletedObjectKeys.push(objectKey);
    } catch {
      failedObjectKeys.push(objectKey);
    }
  }

  return { deletedObjectKeys, failedObjectKeys };
}

async function buildManifest(prisma: PrismaService, mode: CleanupManifest["mode"]): Promise<CleanupManifest> {
  const duplicateUsers = await prisma.$queryRaw<Array<{ userId: string }>>`
    SELECT "userId"
    FROM "ProfilePhoto"
    GROUP BY "userId"
    HAVING COUNT(*) > 1
    ORDER BY "userId" ASC
  `;
  const entries: ManifestEntry[] = [];

  for (const { userId } of duplicateUsers) {
    const photos = await prisma.profilePhoto.findMany({
      where: { userId },
      orderBy: photoOrderBy
    });
    const keptPhoto = photos[0];

    if (!keptPhoto || photos.length <= 1) {
      continue;
    }

    entries.push({
      userId,
      keptPhotoId: keptPhoto.id,
      removedPhotos: photos.slice(1).map((photo) => ({
        id: photo.id,
        objectKeys: getObjectKeys(photo)
      })),
      status: "pending",
      deletedObjectKeys: [],
      failedObjectKeys: []
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    mode,
    entries
  };
}

async function applyManifest(
  prisma: PrismaService,
  storage: StorageService,
  manifest: CleanupManifest,
  manifestPath: string
) {
  let hasFailures = false;

  for (const entry of manifest.entries) {
    try {
      const cleanup = await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM "User" WHERE id = ${entry.userId} FOR UPDATE`;
        const photos = await transaction.profilePhoto.findMany({
          where: { userId: entry.userId },
          orderBy: photoOrderBy
        });

        if (photos.length <= 1) {
          if (photos[0]?.id !== entry.keptPhotoId) {
            throw new Error("The retained photo changed after the manifest was generated. Create a new manifest.");
          }

          return [];
        }

        if (photos[0]?.id !== entry.keptPhotoId) {
          throw new Error("The primary photo changed after the manifest was generated. Create a new manifest.");
        }

        const removedPhotos = photos.slice(1);
        const plannedPhotoIds = entry.removedPhotos.map((photo) => photo.id).sort();
        const currentPhotoIds = removedPhotos.map((photo) => photo.id).sort();

        if (
          plannedPhotoIds.length !== currentPhotoIds.length
          || plannedPhotoIds.some((photoId, index) => photoId !== currentPhotoIds[index])
        ) {
          throw new Error("The secondary photo set changed after the manifest was generated. Create a new manifest.");
        }

        await transaction.profilePhoto.deleteMany({
          where: { id: { in: plannedPhotoIds } }
        });
        await transaction.profilePhoto.update({
          where: { id: entry.keptPhotoId },
          data: { slot: 0, sortOrder: 0 }
        });

        return removedPhotos;
      });

      if (cleanup.length > 0) {
        entry.removedPhotos = cleanup.map((photo) => ({
          id: photo.id,
          objectKeys: getObjectKeys(photo)
        }));
      }
      entry.status = "database-cleaned";
      await writeManifest(manifestPath, manifest);

      const deletion = await deleteUnreferencedObjects(
        prisma,
        storage,
        entry.removedPhotos.flatMap((photo) => photo.objectKeys)
      );
      entry.deletedObjectKeys = deletion.deletedObjectKeys;
      entry.failedObjectKeys = deletion.failedObjectKeys;
      entry.status = deletion.failedObjectKeys.length === 0 ? "complete" : "s3-partial";
      hasFailures ||= deletion.failedObjectKeys.length > 0;
    } catch (error) {
      entry.status = "failed";
      entry.error = error instanceof Error ? error.message : String(error);
      hasFailures = true;
    }

    await writeManifest(manifestPath, manifest);
  }

  return hasFailures;
}

async function retryS3Cleanup(
  prisma: PrismaService,
  storage: StorageService,
  manifest: CleanupManifest,
  manifestPath: string
) {
  let hasFailures = false;
  manifest.mode = "retry-s3";

  for (const entry of manifest.entries) {
    const deletion = await deleteUnreferencedObjects(
      prisma,
      storage,
      entry.removedPhotos.flatMap((photo) => photo.objectKeys)
    );
    entry.deletedObjectKeys = deletion.deletedObjectKeys;
    entry.failedObjectKeys = deletion.failedObjectKeys;
    entry.status = deletion.failedObjectKeys.length === 0 ? "complete" : "s3-partial";
    hasFailures ||= deletion.failedObjectKeys.length > 0;
    await writeManifest(manifestPath, manifest);
  }

  return hasFailures;
}

async function bootstrap() {
  const shouldApply = process.argv.includes("--apply");
  const manifestArgument = getArgument("manifest");
  const retryManifestArgument = getArgument("retry-manifest");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const manifestPath = resolve(
    manifestArgument ?? retryManifestArgument ?? `profile-photo-consolidation-${timestamp}.json`
  );

  if (shouldApply && !manifestArgument) {
    throw new Error("--apply requires --manifest=<reviewed dry-run manifest>.");
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"]
  });

  try {
    const prisma = app.get(PrismaService, { strict: false });
    const storage = app.get(StorageService, { strict: false });

    if (retryManifestArgument) {
      const manifest = JSON.parse(await readFile(resolve(retryManifestArgument), "utf8")) as CleanupManifest;
      const hasFailures = await retryS3Cleanup(prisma, storage, manifest, manifestPath);
      console.log(JSON.stringify({ mode: "retry-s3", manifestPath, users: manifest.entries.length, hasFailures }, null, 2));
      process.exitCode = hasFailures ? 1 : 0;
      return;
    }

    if (!shouldApply) {
      const manifest = await buildManifest(prisma, "dry-run");
      await writeManifest(manifestPath, manifest);
      console.log(JSON.stringify({
        mode: "dry-run",
        manifestPath,
        usersWithExtraPhotos: manifest.entries.length,
        photosToRemove: manifest.entries.reduce((total, entry) => total + entry.removedPhotos.length, 0),
        objectsToDelete: manifest.entries.reduce(
          (total, entry) => total + entry.removedPhotos.reduce((photoTotal, photo) => photoTotal + photo.objectKeys.length, 0),
          0
        )
      }, null, 2));
      return;
    }

    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as CleanupManifest;
    manifest.mode = "apply";
    await writeManifest(manifestPath, manifest);
    const hasFailures = await applyManifest(prisma, storage, manifest, manifestPath);
    console.log(JSON.stringify({ mode: "apply", manifestPath, users: manifest.entries.length, hasFailures }, null, 2));
    process.exitCode = hasFailures ? 1 : 0;
  } finally {
    await app.close();
  }
}

void bootstrap();
