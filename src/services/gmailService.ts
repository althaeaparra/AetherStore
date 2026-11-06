import { Order } from '../types';
import { getCachedAccessToken } from './authService';

/**
 * Encodes string to base64url format for Gmail API
 */
function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Sends order confirmation via Gmail API
 */
export async function sendOrderConfirmationEmail(
  order: Order,
  recipientEmail: string,
  userConfirmed: boolean
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!userConfirmed) {
    return { success: false, error: 'User confirmation required to send email.' };
  }

  const token = getCachedAccessToken();
  if (!token) {
    return { success: false, error: 'Google authentication required to send email.' };
  }

  const itemsListHtml = order.items
    .map(
      (item) =>
        `<tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">
            <strong style="color: #0f172a;">${item.productId}</strong>
          </td>
          <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; text-align: center;">${item.quantity}</td>
        </tr>`
    )
    .join('');

  const emailBody = [
    `To: ${recipientEmail}`,
    `Subject: AetherStore Order Confirmed: #${order.id}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    `<!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 24px; margin: 0;">
        <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #0f172a; font-size: 24px; margin: 0; letter-spacing: -0.5px;">AETHERSTORE</h1>
            <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Next-Gen Spatial Electronics</p>
          </div>

          <div style="background: #f1f5f9; border-radius: 12px; padding: 18px; margin-bottom: 24px; text-align: center;">
            <h2 style="color: #0f172a; font-size: 18px; margin: 0 0 6px 0;">Order #${order.id} Confirmed</h2>
            <p style="color: #475569; font-size: 14px; margin: 0;">Your spatial hardware has been scheduled for priority dispatch.</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
            <thead>
              <tr style="color: #64748b; border-bottom: 1px solid #cbd5e1; text-align: left;">
                <th style="padding-bottom: 8px;">Item</th>
                <th style="padding-bottom: 8px; text-align: center;">Qty</th>
              </tr>
            </thead>
            <tbody>
              ${itemsListHtml}
            </tbody>
          </table>

          <div style="border-top: 2px solid #0f172a; padding-top: 14px; margin-bottom: 24px; display: flex; justify-content: space-between;">
            <span style="font-size: 16px; font-weight: bold; color: #0f172a;">Total Amount:</span>
            <span style="font-size: 18px; font-weight: bold; color: #2563eb;">$${order.totalAmount.toLocaleString()} USD</span>
          </div>

          <div style="font-size: 13px; color: #64748b; line-height: 1.5; margin-bottom: 24px;">
            <p style="margin: 0 0 4px 0;"><strong>Shipping Address:</strong></p>
            <p style="margin: 0;">${order.shippingAddress.fullName}<br>${order.shippingAddress.street}, ${order.shippingAddress.city}, ${order.shippingAddress.country}</p>
          </div>

          <div style="text-align: center; border-top: 1px solid #f1f5f9; padding-top: 18px;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">256-bit AES-GCM Encrypted · PCI-DSS Compliant Transaction</p>
          </div>
        </div>
      </body>
    </html>`,
  ].join('\r\n');

  try {
    const raw = base64UrlEncode(emailBody);
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });

    if (!response.ok) {
      const errJson = await response.json();
      throw new Error(errJson.error?.message || 'Failed to send Gmail message');
    }

    const data = await response.json();
    return { success: true, messageId: data.id };
  } catch (err: any) {
    console.error('Gmail send error:', err);
    return { success: false, error: err.message || 'Error communicating with Gmail API' };
  }
}

/**
 * Sends 2FA verification code via Gmail API
 */
export async function send2FACodeEmail(
  code: string,
  recipientEmail: string
): Promise<{ success: boolean; error?: string }> {
  const token = getCachedAccessToken();
  if (!token) {
    return { success: false, error: 'Token not available' };
  }

  const emailBody = [
    `To: ${recipientEmail}`,
    'Subject: Your AetherStore 2FA Verification Code',
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    `<!DOCTYPE html>
    <html>
      <body style="font-family: sans-serif; background-color: #f8fafc; padding: 20px;">
        <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0; text-align: center;">
          <h2 style="color: #0f172a; margin: 0 0 8px 0;">Security Verification</h2>
          <p style="color: #64748b; font-size: 14px; margin-bottom: 24px;">Enter the code below to complete your checkout authentication:</p>
          <div style="display: inline-block; padding: 14px 28px; background: #f1f5f9; border: 2px dashed #3b82f6; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1e3a8a; margin-bottom: 20px;">
            ${code}
          </div>
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">Code expires in 5 minutes. If you did not request this code, please secure your account.</p>
        </div>
      </body>
    </html>`,
  ].join('\r\n');

  try {
    const raw = base64UrlEncode(emailBody);
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });

    if (!response.ok) {
      throw new Error('Gmail 2FA send failed');
    }
    return { success: true };
  } catch (err: any) {
    console.error('2FA email error:', err);
    return { success: false, error: err.message };
  }
}
