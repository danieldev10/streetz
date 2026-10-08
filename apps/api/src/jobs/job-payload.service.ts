import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "crypto";
import { JobError } from "./job-errors";

@Injectable()
export class JobPayloadService {
  constructor(private readonly config: ConfigService) {}

  private key() {
    const dedicated = this.config.get<string>("JOBS_ENCRYPTION_KEY");
    if (dedicated) {
      const key = Buffer.from(dedicated, "base64");
      if (key.length !== 32)
        throw new JobError("JOB_ENCRYPTION_KEY_INVALID", true);
      return key;
    }
    // A distinct derived key avoids reusing JWT key material directly. Set a
    // dedicated key before rotating JWT secrets while private jobs are queued.
    return Buffer.from(
      hkdfSync(
        "sha256",
        this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
        "crushclub-jobs-v1",
        "encrypted-mail-payload",
        32,
      ),
    );
  }

  encrypt(value: unknown, context: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    cipher.setAAD(Buffer.from(context));
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return [
      "v1",
      iv.toString("base64"),
      cipher.getAuthTag().toString("base64"),
      data.toString("base64"),
    ].join(".");
  }

  decrypt<T>(value: string | null, context: string): T {
    try {
      const [version, iv, tag, data, extra] = (value ?? "").split(".");
      if (version !== "v1" || !iv || !tag || !data || extra) throw new Error();
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key(),
        Buffer.from(iv, "base64"),
      );
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(Buffer.from(tag, "base64"));
      return JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(data, "base64")),
          decipher.final(),
        ]).toString("utf8"),
      ) as T;
    } catch {
      throw new JobError("JOB_PAYLOAD_UNREADABLE", true);
    }
  }
}
