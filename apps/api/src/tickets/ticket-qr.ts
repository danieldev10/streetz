import QRCode = require("qrcode");

/** A QR carries only the existing admission code, never a guest link or PII. */
export function renderTicketQr(code: string): Promise<Buffer> {
  return QRCode.toBuffer(code, {
    type: "png",
    width: 480,
    margin: 4,
    errorCorrectionLevel: "M",
    color: { dark: "#000000ff", light: "#ffffffff" }
  });
}
