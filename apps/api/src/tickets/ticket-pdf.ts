import PDFDocument = require("pdfkit");

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
    doc.rect(0, 0, doc.page.width, 90).fill("#0d0d0d");
    doc.font("Helvetica-Bold").fontSize(22).fillColor("#ffffff").text("CRUSHCLUB", 32, 28);
    doc.font("Helvetica").fontSize(10).text(`EVENT TICKET  /  ${index + 1} OF ${input.tickets.length}`, 32, 60);
    doc.fillColor("#111111").font("Helvetica-Bold").fontSize(20).text(input.eventTitle, 32, 118, { width });
    doc.moveDown(0.8).font("Helvetica").fontSize(12).fillColor("#555555");
    doc.text(formatTicketDate(input.startsAt), { width });
    doc.moveDown(0.6).text(input.venue, { width });
    doc.moveDown(1.4).fontSize(9).text("TICKET HOLDER", { width });
    doc.moveDown(0.4).fontSize(14).fillColor("#111111").text(input.displayName, { width });
    doc.moveDown(0.8).fontSize(9).fillColor("#555555").text("TICKET TYPE", { width });
    doc.moveDown(0.4).fontSize(14).fillColor("#111111").text(ticket.tier, { width });

    const codeY = Math.max(350, doc.y + 18);
    doc.roundedRect(32, codeY, width, 86, 12).fill("#f8e8f8");
    doc.font("Helvetica").fontSize(9).fillColor("#81208c").text("ADMISSION CODE", 48, codeY + 17, { width: width - 32 });
    doc.font("Courier-Bold").fontSize(20).text(ticket.code, 48, codeY + 38, { width: width - 32 });
    const status = input.eventCancelled || ticket.status === "CANCELLED"
      ? "CANCELLED - not valid for entry"
      : ticket.status === "CHECKED_IN" ? "ALREADY CHECKED IN" : "Present this ticket code at the event entrance.";
    doc.font("Helvetica").fontSize(10).fillColor("#555555").text(status, 32, codeY + 105, { width });
    doc.moveDown(0.7).fontSize(9).text("Each code admits one person and can only be checked in once. Keep your ticket code private.", { width });
    doc.fontSize(9).fillColor("#81208c").text("crushclub.ng", 32, doc.page.height - 45, { width, link: "https://crushclub.ng" });
  });
  doc.end();
  return result;
}
