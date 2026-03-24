import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

let transportLoggedMissing = false;

/**
 * Gmail SMTP transporter. Returns null if credentials are not configured.
 * Never throws — callers should skip sending when null.
 */
export function getTransport(): Transporter | null {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '') ?? '';

  if (!user || !pass) {
    if (!transportLoggedMissing) {
      console.warn(
        '[mailer] GMAIL_USER or GMAIL_APP_PASSWORD not set — outbound email is disabled (set both for Gmail SMTP).'
      );
      transportLoggedMissing = true;
    }
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

export function formatDateRange(startIso: string, endIso: string): string {
  try {
    const s = new Date(startIso);
    const e = new Date(endIso);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      return `${startIso} – ${endIso}`;
    }
    const opts: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    };
    return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
  } catch {
    return `${startIso} – ${endIso}`;
  }
}

const BRAND_PRIMARY = '#4f46e5';
const BRAND_BG = '#f8fafc';
const TEXT = '#0f172a';
const MUTED = '#64748b';

export function shell(innerHtml: string, options: { title: string; preheader?: string }): string {
  const appName = process.env.APP_NAME?.trim() || 'Leave Manager';
  const preheader = options.preheader
    ? `<span style="display:none;font-size:1px;color:#fff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(
        options.preheader
      )}</span>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background-color:${BRAND_BG};font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${TEXT};">
${preheader}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BRAND_BG};padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr>
          <td style="background:${BRAND_PRIMARY};padding:20px 24px;">
            <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${escapeHtml(appName)}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <h2 style="margin:0 0 16px;font-size:18px;color:${TEXT};">${escapeHtml(options.title)}</h2>
            ${innerHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#f1f5f9;font-size:12px;color:${MUTED};">
            You are receiving this because notifications are enabled on your account.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeForHtml(s: string): string {
  return escapeHtml(s);
}

export type SendHtmlEmailOutcome =
  | { ok: true }
  | { ok: false; error: string };

export async function sendHtmlEmailWithOutcome(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendHtmlEmailOutcome> {
  const transport = getTransport();
  if (!transport) {
    return { ok: false, error: 'Email is not configured (GMAIL_USER / GMAIL_APP_PASSWORD)' };
  }
  const from = process.env.GMAIL_USER?.trim() || 'noreply@localhost';
  try {
    await transport.sendMail({
      from: `"${process.env.APP_NAME?.trim() || 'Leave Manager'}" <${from}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    return { ok: true };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : typeof e === 'string' ? e : 'sendMail failed';
    console.error('[mailer] sendMail failed:', msg);
    return { ok: false, error: msg };
  }
}

export async function sendHtmlEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const out = await sendHtmlEmailWithOutcome(params);
  return out.ok;
}
