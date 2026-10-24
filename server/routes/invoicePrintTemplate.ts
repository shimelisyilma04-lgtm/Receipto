import { escapeHtml } from '../email.js';

export function renderInvoiceNotFoundHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Invoice Not Found - Receipto</title>
  <style>body{font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:60px 20px;color:#1e293b;background:#f8fafc;}.card{max-width:480px;margin:0 auto;background:#fff;padding:40px;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);}</style>
</head>
<body>
  <div class="card">
    <h2 style="font-size:20px;font-weight:700;margin-bottom:12px;color:#0f172a;">Invoice Not Found</h2>
    <p style="font-size:14px;color:#64748b;margin-bottom:24px;line-height:1.6;">The requested invoice does not exist or you do not have permission to view it.</p>
    <a href="/" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;border-radius:8px;font-weight:600;text-decoration:none;font-size:14px;">Return to Receipto</a>
  </div>
</body>
</html>`;
}

export function renderInvoiceErrorHtml(message: string = 'An error occurred generating the printable invoice.'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Print Error - Receipto</title>
  <style>body{font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:60px 20px;color:#1e293b;background:#f8fafc;}.card{max-width:480px;margin:0 auto;background:#fff;padding:40px;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);}</style>
</head>
<body>
  <div class="card">
    <h2 style="font-size:20px;font-weight:700;margin-bottom:12px;color:#e11d48;">Unable to Load Printable Invoice</h2>
    <p style="font-size:14px;color:#64748b;margin-bottom:24px;line-height:1.6;">${escapeHtml(message)} Please try again.</p>
    <a href="/" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;border-radius:8px;font-weight:600;text-decoration:none;font-size:14px;">Return to Receipto</a>
  </div>
</body>
</html>`;
}

export function renderInvoicePrintHtml(invoice: any, client: any, user: any): string {
  const isPaid = invoice.payment_status === 'PAID';
  const isOverdue = invoice.payment_status === 'OVERDUE';
  const isCancelled = invoice.payment_status === 'CANCELLED';

  let statusBg = '#fffbeb';
  let statusText = '#92400e';
  let statusBorder = '#fde68a';
  if (isPaid) {
    statusBg = '#ecfdf5';
    statusText = '#065f46';
    statusBorder = '#a7f3d0';
  } else if (isOverdue) {
    statusBg = '#fff1f2';
    statusText = '#9f1239';
    statusBorder = '#fecdd3';
  } else if (isCancelled) {
    statusBg = '#f1f5f9';
    statusText = '#475569';
    statusBorder = '#cbd5e1';
  }

  const formattedAmount = `${invoice.currency} $${Number(invoice.amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice #${escapeHtml(invoice.invoice_number)} - Receipto</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      padding: 0;
      margin: 0;
    }
    .no-print {
      background-color: #ffffff;
      border-bottom: 1px solid #e2e8f0;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .no-print-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-title {
      font-weight: 700;
      font-size: 15px;
      color: #0f172a;
    }
    .brand-hint {
      font-size: 12px;
      color: #64748b;
    }
    .no-print-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s ease-in-out;
      text-decoration: none;
    }
    .btn-primary {
      background-color: #4f46e5;
      color: #ffffff;
    }
    .btn-primary:hover {
      background-color: #4338ca;
    }
    .btn-secondary {
      background-color: #ffffff;
      color: #334155;
      border-color: #cbd5e1;
    }
    .btn-secondary:hover {
      background-color: #f1f5f9;
    }
    .page-container {
      max-width: 820px;
      margin: 28px auto 40px auto;
      padding: 0 16px;
    }
    .invoice-card {
      background: #ffffff;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
      padding: 48px;
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 28px;
      margin-bottom: 32px;
    }
    .company-name {
      font-size: 24px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.02em;
    }
    .company-sub {
      font-size: 13px;
      color: #64748b;
      margin-top: 4px;
    }
    .invoice-badge-title {
      font-size: 28px;
      font-weight: 900;
      letter-spacing: -0.03em;
      color: #0f172a;
      text-align: right;
    }
    .meta-list {
      margin-top: 8px;
      text-align: right;
      font-size: 13px;
      color: #475569;
    }
    .meta-list span {
      font-weight: 600;
      color: #0f172a;
    }
    .status-pill {
      display: inline-block;
      margin-top: 8px;
      padding: 4px 12px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-radius: 9999px;
      background-color: ${statusBg};
      color: ${statusText};
      border: 1px solid ${statusBorder};
    }
    .parties-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      margin-bottom: 36px;
    }
    .party-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
      margin-bottom: 8px;
    }
    .party-name {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
    }
    .party-detail {
      font-size: 13px;
      color: #475569;
      margin-top: 2px;
      white-space: pre-line;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 32px;
    }
    .items-table th {
      text-align: left;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      padding: 12px 16px;
      background-color: #f8fafc;
      border-top: 1px solid #e2e8f0;
      border-bottom: 1px solid #e2e8f0;
    }
    .items-table th.text-right, .items-table td.text-right {
      text-align: right;
    }
    .items-table td {
      padding: 16px;
      font-size: 14px;
      color: #1e293b;
      border-bottom: 1px solid #f1f5f9;
    }
    .totals-area {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 36px;
    }
    .totals-box {
      width: 280px;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 13px;
      color: #475569;
    }
    .totals-grand {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      border-top: 2px solid #e2e8f0;
      margin-top: 6px;
    }
    .notes-box {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 32px;
    }
    .notes-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      margin-bottom: 6px;
    }
    .notes-content {
      font-size: 13px;
      color: #334155;
      white-space: pre-line;
    }
    .footer-note {
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
      border-top: 1px solid #f1f5f9;
      padding-top: 24px;
    }
    @media print {
      body {
        background-color: #ffffff !important;
      }
      .no-print {
        display: none !important;
      }
      .page-container {
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .invoice-card {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
      }
      @page {
        margin: 12mm;
        size: auto;
      }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <div class="no-print-left">
      <span class="brand-title">Receipto Printable Invoice</span>
      <span class="brand-hint">Invoice #${escapeHtml(invoice.invoice_number)}</span>
    </div>
    <div class="no-print-actions">
      <button class="btn btn-primary" onclick="window.print()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
        Print / Save PDF
      </button>
      <button class="btn btn-secondary" onclick="window.close()">✕ Close</button>
    </div>
  </div>

  <div class="page-container">
    <div class="invoice-card">
      <div class="header-row">
        <div>
          <div class="company-name">${escapeHtml(user.business_name || user.name || 'Receipto Merchant')}</div>
          <div class="company-sub">Billed by: ${escapeHtml(user.name || '')} &bull; ${escapeHtml(user.email || '')}</div>
        </div>

        <div>
          <div class="invoice-badge-title">INVOICE</div>
          <div class="meta-list">
            <div>Invoice No: <span>#${escapeHtml(invoice.invoice_number)}</span></div>
            <div>Issue Date: <span>${escapeHtml(invoice.issue_date || 'N/A')}</span></div>
            <div>Due Date: <span>${escapeHtml(invoice.due_date || 'N/A')}</span></div>
            ${
              invoice.paid_date
                ? `<div>Paid Date: <span>${escapeHtml(invoice.paid_date.split('T')[0])}</span></div>`
                : ''
            }
            <div><span class="status-pill">${escapeHtml(invoice.payment_status || 'UNPAID')}</span></div>
          </div>
        </div>
      </div>

      <div class="parties-grid">
        <div>
          <div class="party-title">Billed From</div>
          <div class="party-name">${escapeHtml(user.business_name || user.name || 'Merchant')}</div>
          <div class="party-detail">${escapeHtml(user.email || '')}</div>
        </div>

        <div>
          <div class="party-title">Billed To</div>
          <div class="party-name">${escapeHtml(client?.name || invoice.client_name || 'Client')}</div>
          ${
            client?.company || invoice.client_company
              ? `<div class="party-detail"><strong>${escapeHtml(client?.company || invoice.client_company || '')}</strong></div>`
              : ''
          }
          <div class="party-detail">${escapeHtml(client?.email || invoice.client_email || '')}</div>
          ${
            client?.address
              ? `<div class="party-detail">${escapeHtml(client.address)}</div>`
              : ''
          }
          ${
            client?.phone
              ? `<div class="party-detail">${escapeHtml(client.phone)}</div>`
              : ''
          }
        </div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th>Item & Description</th>
            <th class="text-right">Qty</th>
            <th class="text-right">Rate</th>
            <th class="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Professional Services / Products Deliverable</strong><br>
              <span style="font-size: 12px; color: #64748b;">As referenced in invoice #${escapeHtml(invoice.invoice_number)}</span>
            </td>
            <td class="text-right">1</td>
            <td class="text-right">${formattedAmount}</td>
            <td class="text-right"><strong>${formattedAmount}</strong></td>
          </tr>
        </tbody>
      </table>

      <div class="totals-area">
        <div class="totals-box">
          <div class="totals-row">
            <span>Subtotal</span>
            <span>${formattedAmount}</span>
          </div>
          <div class="totals-row">
            <span>Tax (0.00%)</span>
            <span>${invoice.currency} $0.00</span>
          </div>
          <div class="totals-grand">
            <span>Total Due</span>
            <span>${formattedAmount}</span>
          </div>
        </div>
      </div>

      ${
        invoice.notes
          ? `<div class="notes-box">
              <div class="notes-title">Notes & Payment Instructions</div>
              <div class="notes-content">${escapeHtml(invoice.notes)}</div>
            </div>`
          : ''
      }

      <div class="footer-note">
        Thank you for your business. For any questions regarding this invoice, please contact ${escapeHtml(user.email || 'support')}.<br>
        <span style="font-size: 11px; color: #cbd5e1;">Generated by Receipto</span>
      </div>
    </div>
  </div>

  <script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        try {
          window.print();
        } catch (e) {
          console.log('Auto print prevented by browser environment.');
        }
      }, 350);
    });
  </script>
</body>
</html>`;
}
