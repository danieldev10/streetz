import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, Transporter } from "nodemailer";
import type { Attachment } from "nodemailer/lib/mailer";
import { formatTicketDate, renderTicketPdf, TicketDocument } from "../tickets/ticket-pdf";

type PasswordResetEmailInput = {
  messageId?: string;
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
  displayName?: string | null;
};

type GuestTicketVerificationEmailInput = {
  messageId?: string;
  to: string;
  displayName: string;
  eventTitle: string;
  code: string;
  expiresInMinutes: number;
};

type GuestTicketConfirmationEmailInput = {
  to: string;
  displayName: string;
  eventTitle: string;
  venue: string;
  startsAt: Date;
  ticketTier: string;
  ticketCodes: string[];
  manageUrl: string;
};

type SupportRequestReceivedEmailInput = {
  messageId?: string;
  to: string;
  displayName: string;
  reference: string;
  subject: string;
  supportUrl: string;
};

type SupportReplyEmailInput = {
  messageId?: string;
  to: string;
  displayName: string;
  reference: string;
  subject: string;
  message: string;
  supportUrl?: string | null;
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
      messageId: input.messageId,
      to: input.to,
      subject,
      text,
      html
    });

    return true;
  }

  async sendGuestTicketVerificationEmail(input: GuestTicketVerificationEmailInput) {
    const subject = `Confirm your free ticket for ${input.eventTitle}`;
    const text = [
      `Hi ${input.displayName},`,
      "",
      `Your Crushclub verification code is ${input.code}.`,
      `Enter it within ${input.expiresInMinutes} minutes to confirm your free ticket for ${input.eventTitle}.`,
      "",
      "If you did not request this ticket, you can ignore this email."
    ].join("\n");
    const html = `
      <div style="font-family: Arial, sans-serif; color: #111111; line-height: 1.6; max-width: 560px;">
        <h1 style="font-size: 24px; margin: 0 0 16px;">Confirm your free ticket</h1>
        <p>Hi ${this.escapeHtml(input.displayName)},</p>
        <p>Enter this code to confirm your ticket for <strong>${this.escapeHtml(input.eventTitle)}</strong>:</p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; margin: 24px 0;">${this.escapeHtml(input.code)}</p>
        <p>This code expires in ${input.expiresInMinutes} minutes.</p>
        <p>If you did not request this ticket, you can ignore this email.</p>
      </div>
    `;

    return this.sendEmail({ to: input.to, messageId: input.messageId, subject, text, html }, "guest ticket verification");
  }

  async sendGuestTicketConfirmationEmail(input: GuestTicketConfirmationEmailInput) {
    return this.sendTicketConfirmationEmail({
      ...input,
      tickets: input.ticketCodes.map((code) => ({ code, tier: input.ticketTier, status: "CONFIRMED" }))
    });
  }

  async sendTicketConfirmationEmail(input: TicketDocument & { to: string; manageUrl?: string; messageId?: string }) {
    const formattedDate = formatTicketDate(input.startsAt);
    const subject = `Your tickets for ${input.eventTitle}`;
    const text = [
      `Hi ${input.displayName},`, "",
      `Your ${input.tickets.length === 1 ? "ticket is" : "tickets are"} confirmed for ${input.eventTitle}.`,
      formattedDate, input.venue, "", "Ticket codes:",
      ...input.tickets.map((ticket) => `${ticket.tier}: ${ticket.code}`), "",
      "Download the attached PDF and present each ticket code at the event entrance.",
      ...(input.manageUrl ? ["", "View your tickets:", input.manageUrl] : []), "",
      "Each code can only be checked in once. Keep your ticket codes private."
    ].join("\n");
    const html = `
      <div style="font-family: Arial, sans-serif; color: #111111; line-height: 1.6; max-width: 560px;">
        <h1 style="font-size: 24px; margin: 0 0 16px;">Your tickets are confirmed</h1>
        <p>Hi ${this.escapeHtml(input.displayName)},</p>
        <p>Your booking for <strong>${this.escapeHtml(input.eventTitle)}</strong> is confirmed.</p>
        <p>${this.escapeHtml(formattedDate)}<br />${this.escapeHtml(input.venue)}</p>
        <ul style="list-style: none; padding: 0;">${input.tickets.map((ticket) =>
          `<li style="margin: 8px 0;"><strong>${this.escapeHtml(ticket.tier)}</strong>: <span style="font-family: monospace; font-size: 18px;">${this.escapeHtml(ticket.code)}</span></li>`).join("")}</ul>
        <p>Download the attached PDF and present each ticket code at the event entrance.</p>
        ${input.manageUrl ? `<p><a href="${this.escapeHtml(input.manageUrl)}" style="display: inline-block; background: #0d0d0d; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 999px; font-weight: 700;">View my tickets</a></p>` : ""}
        <p>Each code can only be checked in once. Keep your ticket codes private.</p>
      </div>
    `;
    const pdf = await renderTicketPdf(input);
    return this.sendEmail({ to: input.to, messageId: input.messageId, subject, text, html,
      attachments: [{ filename: "crushclub-tickets.pdf", content: pdf, contentType: "application/pdf" }]
    }, "ticket confirmation");
  }

  async sendSupportRequestReceivedEmail(input: SupportRequestReceivedEmailInput) {
    const subject = `We received your support request ${input.reference}`;
    const text = [
      `Hi ${input.displayName},`,
      "",
      `We received your support request: ${input.subject}`,
      `Reference: ${input.reference}`,
      "",
      "You can view the request and reply here:",
      input.supportUrl,
      "",
      "Keep this email. If you submitted as a guest, the link is private and should not be shared."
    ].join("\n");
    const html = `
      <div style="font-family: Arial, sans-serif; color: #111111; line-height: 1.6; max-width: 560px;">
        <h1 style="font-size: 24px; margin: 0 0 16px;">We received your request</h1>
        <p>Hi ${this.escapeHtml(input.displayName)},</p>
        <p>Our support team has received <strong>${this.escapeHtml(input.subject)}</strong>.</p>
        <p>Reference: <strong>${this.escapeHtml(input.reference)}</strong></p>
        <p><a href="${this.escapeHtml(input.supportUrl)}" style="display: inline-block; background: #0d0d0d; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 999px; font-weight: 700;">View support request</a></p>
        <p style="color: #666666;">Keep this email. If you submitted as a guest, the link is private and should not be shared.</p>
      </div>
    `;

    return this.sendEmail({ to: input.to, messageId: input.messageId, subject, text, html }, "support request confirmation");
  }

  async sendSupportReplyEmail(input: SupportReplyEmailInput) {
    const subject = `Update on ${input.reference}: ${input.subject}`;
    const text = [
      `Hi ${input.displayName},`,
      "",
      "Crushclub Support replied:",
      input.message,
      "",
      input.supportUrl
        ? `View the full conversation and reply:\n${input.supportUrl}`
        : "Use the private link in your original support email to view the full conversation and reply."
    ].join("\n");
    const html = `
      <div style="font-family: Arial, sans-serif; color: #111111; line-height: 1.6; max-width: 560px;">
        <h1 style="font-size: 24px; margin: 0 0 16px;">Support replied</h1>
        <p>Hi ${this.escapeHtml(input.displayName)},</p>
        <p>There is an update on <strong>${this.escapeHtml(input.reference)}</strong>.</p>
        <div style="background: #f6f6f6; border-radius: 16px; padding: 16px; white-space: pre-wrap;">${this.escapeHtml(input.message)}</div>
        ${input.supportUrl
          ? `<p><a href="${this.escapeHtml(input.supportUrl)}" style="display: inline-block; background: #0d0d0d; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 999px; font-weight: 700;">View conversation</a></p>`
          : "<p>Use the private link in your original support email to view the full conversation and reply.</p>"}
      </div>
    `;

    return this.sendEmail({ to: input.to, messageId: input.messageId, subject, text, html }, "support reply");
  }

  private async sendEmail(
    input: { to: string; messageId?: string; subject: string; text: string; html: string; attachments?: Attachment[] },
    description: string
  ) {
    const from = this.config.get<string>("SMTP_FROM");
    const transporter = this.getTransporter();

    if (!from || !transporter) {
      this.logger.warn(`SMTP is not configured; ${description} email was not sent.`);
      return false;
    }

    await transporter.sendMail({ from, ...input });
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
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
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
