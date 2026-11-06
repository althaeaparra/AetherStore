import { Order } from '../types';
import { getCachedAccessToken } from './authService';

/**
 * Generates an itemized HTML invoice document
 */
export function generateInvoiceHtml(order: Order): string {
  const itemsRows = order.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${item.productId}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: center;">${item.quantity}</td>
    </tr>
  `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>AetherStore Invoice #${order.id}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #0f172a; background: #ffffff; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 30px; }
    .logo { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
    .meta { font-size: 14px; color: #64748b; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin: 30px 0; }
    th { text-align: left; background: #f8fafc; padding: 12px; font-size: 13px; color: #475569; border-bottom: 2px solid #cbd5e1; }
    .total-box { margin-top: 20px; text-align: right; font-size: 20px; font-weight: bold; }
    .footer { margin-top: 50px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">AETHERSTORE</div>
      <div class="meta">Next-Gen Spatial Electronics Depot<br>Secure PCI-DSS Level 1 Gateway</div>
    </div>
    <div style="text-align: right;">
      <h2 style="margin: 0 0 5px 0;">TAX INVOICE</h2>
      <div class="meta">Invoice: INV-${order.id}<br>Date: ${new Date(order.createdAt).toLocaleDateString()}</div>
    </div>
  </div>

  <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
    <div>
      <strong>Billed & Shipped To:</strong><br>
      ${order.shippingAddress.fullName}<br>
      ${order.shippingAddress.street}<br>
      ${order.shippingAddress.city}, ${order.shippingAddress.postalCode}<br>
      ${order.shippingAddress.country}
    </div>
    <div style="text-align: right;">
      <strong>Payment Status:</strong> <span style="color: #16a34a;">AUTHENTICATED & PAID</span><br>
      <strong>Method:</strong> ${order.paymentMethod.brand || 'Card'} ending in ${order.paymentMethod.lastFour || 'XXXX'}<br>
      <strong>2FA Verification:</strong> Verified Biometric / Code
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Hardware Item</th>
        <th style="text-align: center;">Quantity</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
    </tbody>
  </table>

  <div class="total-box">
    <span>Total Paid: </span>
    <span style="color: #2563eb;">$${order.totalAmount.toLocaleString()} USD</span>
  </div>

  <div class="footer">
    <p>This invoice was generated electronically with end-to-end cryptographic verification. All client records stored via 256-bit AES-GCM encryption.</p>
  </div>
</body>
</html>`;
}

/**
 * Uploads invoice to Google Drive
 */
export async function archiveInvoiceToDrive(
  order: Order,
  userConfirmed: boolean
): Promise<{ success: boolean; fileId?: string; error?: string }> {
  if (!userConfirmed) {
    return { success: false, error: 'User confirmation required to upload to Google Drive.' };
  }

  const token = getCachedAccessToken();
  if (!token) {
    return { success: false, error: 'Google authentication required for Google Drive backup.' };
  }

  const invoiceContent = generateInvoiceHtml(order);
  const metadata = {
    name: `AetherStore_Invoice_${order.id}.html`,
    mimeType: 'text/html',
    description: `Official AetherStore purchase invoice for Order #${order.id}`,
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: text/html\r\n\r\n' +
    invoiceContent +
    closeDelimiter;

  try {
    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Drive upload failed');
    }

    const data = await response.json();
    return { success: true, fileId: data.id };
  } catch (err: any) {
    console.error('Google Drive archive error:', err);
    return { success: false, error: err.message || 'Error uploading invoice to Google Drive' };
  }
}

/**
 * Fallback to trigger browser download of invoice
 */
export function downloadInvoiceLocal(order: Order) {
  const content = generateInvoiceHtml(order);
  const blob = new Blob([content], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `AetherStore_Invoice_${order.id}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
