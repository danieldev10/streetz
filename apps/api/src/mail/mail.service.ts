import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, Transporter } from "nodemailer";

type PasswordResetEmailInput = {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
  displayName?: string | null;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;

  constructor(private readonly config: ConfigService) {}

  async sendPasswordResetEmail(input: PasswordResetEmailInput) {
    const from = this.config.get<string>("SMTP_FROM");
    const transporter = this.getTransporter();

    if (!from || !transporter) {
      this.logger.warn("SMTP is not configured; password reset email was not sent.");
      return false;
    }

    const recipientName = input.displayName?.trim() || "there";
    const subject = "Reset your crushclub password";
    const text = [
      `Hi ${recipientName},`,
      "",
      "We received a request to reset your crushclub password.",
      `Use this link within ${input.expiresInMinutes} minutes:`,
      input.resetUrl,
      "",
      "If you did not request this, you can ignore this email."
    ].join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; color: #111111; line-height: 1.6; max-width: 560px;">
        <h1 style="font-size: 24px; margin: 0 0 16px;">Reset your password</h1>
        <p>Hi ${this.escapeHtml(recipientName)},</p>
        <p>We received a request to reset your crushclub password.</p>
        <p>
          <a href="${this.escapeHtml(input.resetUrl)}" style="display: inline-block; background: #0d0d0d; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 999px; font-weight: 700;">
            Reset password
          </a>
        </p>
        <p>This link expires in ${input.expiresInMinutes} minutes.</p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>
    `;

    await transporter.sendMail({
      from,
      to: input.to,
      subject,
      text,
      html
    });

    return true;
  }

  private getTransporter() {
    if (this.transporter) {
      return this.transporter;
    }

    const host = this.config.get<string>("SMTP_HOST");
    const port = this.getSmtpPort();

    if (!host || !port) {
      return undefined;
    }

    const user = this.config.get<string>("SMTP_USER");
    const pass = this.config.get<string>("SMTP_PASS");
    const secure = this.getSmtpSecure(port);

    this.transporter = createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined
    });

    return this.transporter;
  }

  private getSmtpPort() {
    const portValue = this.config.get<string>("SMTP_PORT");

    if (!portValue) {
      return this.parseBoolean(this.config.get<string>("SMTP_SECURE")) ? 465 : 587;
    }

    const port = Number.parseInt(portValue, 10);

    return Number.isFinite(port) ? port : undefined;
  }

  private getSmtpSecure(port: number) {
    const secureValue = this.config.get<string>("SMTP_SECURE");

    if (secureValue === undefined) {
      return port === 465;
    }

    return this.parseBoolean(secureValue);
  }

  private parseBoolean(value: string | undefined) {
    return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
  }

  private escapeHtml(value: string) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
}
