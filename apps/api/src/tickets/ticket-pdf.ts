import PDFDocument = require("pdfkit");
import { renderTicketQr } from "./ticket-qr";

export type TicketDocument = {
  eventTitle: string;
  venue: string;
  startsAt: Date;
  displayName: string;
  eventCancelled?: boolean;
  tickets: Array<{ code: string; tier: string; status: string }>;
};

export function formatTicketDate(date: Date) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "full", timeStyle: "short", timeZone: "Africa/Lagos"
  }).format(date);
}

/** Each code is a separate admission ticket, checked against the live database at entry. */
export async function renderTicketPdf(input: TicketDocument): Promise<Buffer> {
  const qrImages = await Promise.all(input.tickets.map((ticket) =>
    !input.eventCancelled && ["PAID", "CONFIRMED"].includes(ticket.status) ? renderTicketQr(ticket.code) : null));
  const doc = new PDFDocument({ size: "A4", margin: 32, autoFirstPage: false,
    info: { Title: `Tickets for ${input.eventTitle}`, Author: "Crushclub" } });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  input.tickets.forEach((ticket, index) => {
    doc.addPage();
    const width = doc.page.width - 64;
    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#ffffff");
    doc.rect(0, 0, doc.page.width, 90).fill("#0d0d0d");
    doc.font("Helvetica-Bold").fontSize(22).fillColor("#ffffff").text("CRUSHCLUB", 32, 28);
    doc.font("Helvetica").fontSize(10).text(`EVENT TICKET  /  ${index + 1} OF ${input.tickets.length}`, 32, 60);
    doc.fillColor("#111111").font("Helvetica-Bold").fontSize(20)
      .text(input.eventTitle, 32, 116, { width, height: 65, ellipsis: true });
    doc.font("Helvetica").fontSize(11).fillColor("#555555")
      .text(formatTicketDate(input.startsAt), 32, 192, { width, height: 34, ellipsis: true });
    doc.text(input.venue, 32, 236, { width, height: 34, ellipsis: true });
    const columnWidth = width / 2 - 10;
    doc.fontSize(9).text("TICKET HOLDER", 32, 290, { width: columnWidth });
    doc.text("TICKET TYPE", 42 + width / 2, 290, { width: columnWidth });
    doc.fontSize(14).fillColor("#111111").text(input.displayName, 32, 308, { width: columnWidth, height: 26, ellipsis: true });
    doc.text(ticket.tier, 42 + width / 2, 308, { width: columnWidth, height: 26, ellipsis: true });

    doc.roundedRect(32, 350, width, 306, 12).fill("#f8e8f8");
    const qr = qrImages[index];
    if (qr) doc.image(qr, (doc.page.width - 210) / 2, 362, { width: 210, height: 210 });
    else doc.font("Helvetica-Bold").fontSize(17).fillColor("#81208c")
      .text("NOT VALID FOR ENTRY", 48, 450, { width: width - 32, align: "center" });
    doc.font("Helvetica").fontSize(9).fillColor("#81208c")
      .text("ADMISSION CODE / MANUAL BACKUP", 48, 586, { width: width - 32, align: "center" });
    doc.font("Courier-Bold").fontSize(ticket.code.length > 32 ? 11 : 18)
      .text(ticket.code, 48, 607, { width: width - 32, height: 36, align: "center" });
    const status = input.eventCancelled || ticket.status === "CANCELLED"
      ? "CANCELLED - not valid for entry"
      : ticket.status === "CHECKED_IN" ? "ALREADY CHECKED IN"
      : qr ? "Present this QR code for scanning at the event entrance." : "This ticket is not valid for entry.";
    doc.font("Helvetica").fontSize(10).fillColor("#555555").text(status, 32, 678, { width });
    doc.fontSize(9).text("Each ticket admits one person and can only be checked in once. Keep your QR and ticket code private.", 32, 708, { width });
    doc.fontSize(9).fillColor("#81208c").text("crushclub.ng", 32, doc.page.height - 45, { width, link: "https://crushclub.ng" });
  });
  doc.end();
  return result;
}
