/**
 * Email Client for TimeTide
 * Using Resend for transactional emails
 */

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/** Escape HTML special characters to prevent injection in email templates */
function esc(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? 'TimeTide <noreply@timetide.app>',
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
      reply_to: options.replyTo,
    });

    if (error) {
      console.error('Email send error:', error);
      return false;
    }

    console.log('Email sent:', data?.id);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

export interface BookingEmailData {
  hostName: string;
  hostEmail: string;
  hostUsername?: string;
  inviteeName: string;
  inviteeEmail: string;
  eventTitle: string;
  eventSlug?: string;
  eventDescription?: string;
  startTime: string; // Formatted string
  endTime: string;
  timezone: string;
  location?: string;
  meetingUrl?: string;
  bookingUid: string;
  notes?: string;
}

const baseStyles = `
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 32px; }
    .logo { font-size: 24px; font-weight: 700; color: #0ea5e9; text-align: center; }
    .logo img { width: 32px; height: 32px; display: inline-block; vertical-align: middle; margin-right: 8px; }
    .card { background: #f8fafc; border-radius: 12px; padding: 24px; margin: 24px 0; }
    .detail-row { margin: 12px 0; }
    .detail-label { color: #64748b; width: 100px; display: inline-block; vertical-align: top; }
    .detail-value { font-weight: 500; display: inline-block; vertical-align: top; }
    .btn { display: inline-block; padding: 12px 24px; background: #0ea5e9; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 500; }
    .btn-outline { background: #f0f9ff; border: 1px solid #0ea5e9; color: #0369a1 !important; }
    .footer { text-align: center; margin-top: 40px; color: #94a3b8; font-size: 14px; }
    .divider { border-top: 1px solid #e2e8f0; margin: 24px 0; }
  </style>
`;

export function generateBookingConfirmedEmail(
  data: BookingEmailData,
  isHost: boolean
): string {
  const manageUrl = `${process.env.NEXT_PUBLIC_APP_URL}/bookings/${data.bookingUid}`;
  const addToCalendarUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/bookings/${data.bookingUid}/calendar`;

  return `
    <!DOCTYPE html>
    <html>
    <head>${baseStyles}</head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo"><img src="${process.env.NEXT_PUBLIC_APP_URL}/email-logo.png" alt="TimeTide" width="32" height="32" style="display:inline-block;vertical-align:middle;width:32px;height:32px;" /> TimeTide</div>
        </div>
        
        <h2 style="text-align: center; margin-bottom: 8px;">
          ${isHost ? 'New Booking Confirmed' : 'Your Booking is Confirmed!'}
        </h2>
        <p style="text-align: center; color: #64748b;">
          ${isHost
            ? `${esc(data.inviteeName)} has booked a meeting with you`
            : `Your meeting with ${esc(data.hostName)} is scheduled`}
        </p>

        <div class="card">
          <h3 style="margin: 0 0 16px 0;">${esc(data.eventTitle)}</h3>
          ${data.eventDescription ? `<p style="color: #64748b; margin: 0 0 16px 0;">${esc(data.eventDescription)}</p>` : ''}

          <div class="detail-row">
            <span class="detail-label">📅 When</span>
            <span class="detail-value">${esc(data.startTime)} - ${esc(data.endTime)}</span>
          </div>

          <div class="detail-row">
            <span class="detail-label">🌍 Timezone</span>
            <span class="detail-value">${esc(data.timezone)}</span>
          </div>

          ${data.location ? `
          <div class="detail-row">
            <span class="detail-label">📍 Where</span>
            <span class="detail-value">${esc(data.location)}</span>
          </div>
          ` : ''}

          ${data.meetingUrl ? `
          <div class="detail-row">
            <span class="detail-label">🔗 Link</span>
            <span class="detail-value">
              <a href="${esc(data.meetingUrl)}" style="color: #0ea5e9;">${esc(data.meetingUrl)}</a>
            </span>
          </div>
          ` : ''}

          <div class="divider"></div>

          <div class="detail-row">
            <span class="detail-label">👤 ${isHost ? 'Invitee' : 'Host'}</span>
            <span class="detail-value">${isHost ? esc(data.inviteeName) : esc(data.hostName)}</span>
          </div>

          <div class="detail-row">
            <span class="detail-label">✉️ Email</span>
            <span class="detail-value">${isHost ? esc(data.inviteeEmail) : esc(data.hostEmail)}</span>
          </div>

          ${data.notes ? `
          <div class="divider"></div>
          <div>
            <span class="detail-label">📝 Notes</span>
            <p style="margin: 8px 0 0 0; color: #475569;">${esc(data.notes)}</p>
          </div>
          ` : ''}
        </div>
        
        <div style="text-align: center; margin: 32px 0;">
          <a href="${manageUrl}" class="btn" style="color: #ffffff;">Manage Booking</a>
          <a href="${addToCalendarUrl}" class="btn btn-outline" style="margin-left: 12px; color: #0369a1; background: #f0f9ff; border: 1px solid #0ea5e9;">Add to Calendar</a>
        </div>
        
        <div class="footer">
          <p>TimeTide Powered by SeekaHost Technologies Ltd.</p>
          <p style="font-size: 12px;">
            Need to make changes? 
            <a href="${manageUrl}" style="color: #0ea5e9;">Reschedule or cancel</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generateBookingCancelledEmail(
  data: BookingEmailData,
  isHost: boolean,
  reason?: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>${baseStyles}</head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo"><img src="${process.env.NEXT_PUBLIC_APP_URL}/email-logo.png" alt="TimeTide" width="32" height="32" style="display:inline-block;vertical-align:middle;width:32px;height:32px;" /> TimeTide</div>
        </div>
        
        <h2 style="text-align: center; margin-bottom: 8px; color: #ef4444;">
          Booking Cancelled
        </h2>
        <p style="text-align: center; color: #64748b;">
          ${isHost
            ? `${esc(data.inviteeName)} has cancelled their booking`
            : `Your meeting with ${esc(data.hostName)} has been cancelled`}
        </p>

        <div class="card" style="border-left: 4px solid #ef4444;">
          <h3 style="margin: 0 0 16px 0; text-decoration: line-through; color: #94a3b8;">
            ${esc(data.eventTitle)}
          </h3>

          <div class="detail-row">
            <span class="detail-label">📅 Was</span>
            <span class="detail-value" style="text-decoration: line-through; color: #94a3b8;">
              ${esc(data.startTime)} - ${esc(data.endTime)}
            </span>
          </div>

          ${reason ? `
          <div class="divider"></div>
          <div>
            <span class="detail-label">📝 Reason</span>
            <p style="margin: 8px 0 0 0; color: #475569;">${esc(reason)}</p>
          </div>
          ` : ''}
        </div>
        
        ${!isHost ? `
        <div style="text-align: center; margin: 32px 0;">
          <a href="${data.hostUsername && data.eventSlug
            ? `${process.env.NEXT_PUBLIC_APP_URL}/${encodeURIComponent(data.hostUsername)}/${encodeURIComponent(data.eventSlug)}`
            : process.env.NEXT_PUBLIC_APP_URL}" class="btn" style="color: #ffffff;">
            Book a New Time
          </a>
        </div>
        ` : ''}
        
        <div class="footer">
          <p>TimeTide Powered by SeekaHost Technologies Ltd.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generateBookingRescheduledEmail(
  data: BookingEmailData,
  oldTime: { start: string; end: string },
  isHost: boolean
): string {
  const manageUrl = `${process.env.NEXT_PUBLIC_APP_URL}/bookings/${data.bookingUid}`;

  return `
    <!DOCTYPE html>
    <html>
    <head>${baseStyles}</head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo"><img src="${process.env.NEXT_PUBLIC_APP_URL}/email-logo.png" alt="TimeTide" width="32" height="32" style="display:inline-block;vertical-align:middle;width:32px;height:32px;" /> TimeTide</div>
        </div>
        
        <h2 style="text-align: center; margin-bottom: 8px; color: #f59e0b;">
          Booking Rescheduled
        </h2>
        <p style="text-align: center; color: #64748b;">
          ${isHost
            ? `${esc(data.inviteeName)} has rescheduled their booking`
            : `Your meeting with ${esc(data.hostName)} has been rescheduled`}
        </p>

        <div class="card">
          <h3 style="margin: 0 0 16px 0;">${esc(data.eventTitle)}</h3>

          <div style="background: #fef3c7; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            <p style="margin: 0; font-size: 14px; color: #92400e;">
              <strong>Old time:</strong>
              <span style="text-decoration: line-through;">${esc(oldTime.start)} - ${esc(oldTime.end)}</span>
            </p>
          </div>

          <div style="background: #d1fae5; padding: 12px; border-radius: 8px;">
            <p style="margin: 0; font-size: 14px; color: #065f46;">
              <strong>New time:</strong> ${esc(data.startTime)} - ${esc(data.endTime)}
            </p>
          </div>

          <div class="divider"></div>

          <div class="detail-row">
            <span class="detail-label">🌍 Timezone</span>
            <span class="detail-value">${esc(data.timezone)}</span>
          </div>

          ${data.meetingUrl ? `
          <div class="detail-row">
            <span class="detail-label">🔗 Link</span>
            <span class="detail-value">
              <a href="${esc(data.meetingUrl)}" style="color: #0ea5e9;">${esc(data.meetingUrl)}</a>
            </span>
          </div>
          ` : ''}
        </div>
        
        <div style="text-align: center; margin: 32px 0;">
          <a href="${manageUrl}" class="btn" style="color: #ffffff;">View Booking</a>
        </div>
        
        <div class="footer">
          <p>TimeTide Powered by SeekaHost Technologies Ltd.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generateBookingPendingEmail(
  data: BookingEmailData,
  isHost: boolean
): string {
  const manageUrl = `${process.env.NEXT_PUBLIC_APP_URL}/${isHost ? 'dashboard/bookings/' + data.bookingUid : 'bookings/' + data.bookingUid}`;

  return `
    <!DOCTYPE html>
    <html>
    <head>${baseStyles}</head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo"><img src="${process.env.NEXT_PUBLIC_APP_URL}/email-logo.png" alt="TimeTide" width="32" height="32" style="display:inline-block;vertical-align:middle;width:32px;height:32px;" /> TimeTide</div>
        </div>

        <h2 style="text-align: center; margin-bottom: 8px; color: #f59e0b;">
          ${isHost ? 'New Booking Request' : 'Booking Pending Confirmation'}
        </h2>
        <p style="text-align: center; color: #64748b;">
          ${isHost
            ? `${esc(data.inviteeName)} has requested a meeting with you`
            : `Your meeting request with ${esc(data.hostName)} is awaiting confirmation`}
        </p>

        <div class="card" style="border-left: 4px solid #f59e0b;">
          <h3 style="margin: 0 0 16px 0;">${esc(data.eventTitle)}</h3>
          ${data.eventDescription ? `<p style="color: #64748b; margin: 0 0 16px 0;">${esc(data.eventDescription)}</p>` : ''}

          <div class="detail-row">
            <span class="detail-label">📅 When</span>
            <span class="detail-value">${esc(data.startTime)} - ${esc(data.endTime)}</span>
          </div>

          <div class="detail-row">
            <span class="detail-label">🌍 Timezone</span>
            <span class="detail-value">${esc(data.timezone)}</span>
          </div>

          ${data.location ? `
          <div class="detail-row">
            <span class="detail-label">📍 Where</span>
            <span class="detail-value">${esc(data.location)}</span>
          </div>
          ` : ''}

          <div class="divider"></div>

          <div class="detail-row">
            <span class="detail-label">👤 ${isHost ? 'Invitee' : 'Host'}</span>
            <span class="detail-value">${isHost ? esc(data.inviteeName) : esc(data.hostName)}</span>
          </div>

          <div class="detail-row">
            <span class="detail-label">✉️ Email</span>
            <span class="detail-value">${isHost ? esc(data.inviteeEmail) : esc(data.hostEmail)}</span>
          </div>

          ${data.notes ? `
          <div class="divider"></div>
          <div>
            <span class="detail-label">📝 Notes</span>
            <p style="margin: 8px 0 0 0; color: #475569;">${esc(data.notes)}</p>
          </div>
          ` : ''}
        </div>

        ${isHost ? `
        <div style="text-align: center; margin: 32px 0;">
          <p style="color: #64748b; margin-bottom: 16px;">Please review and confirm or decline this booking request.</p>
          <a href="${manageUrl}" class="btn" style="color: #ffffff;">Review Booking</a>
        </div>
        ` : `
        <div style="text-align: center; margin: 32px 0; padding: 16px; background: #fef3c7; border-radius: 8px;">
          <p style="color: #92400e; margin: 0;">
            ⏳ This booking is pending confirmation by ${esc(data.hostName)}. You will receive another email once it's confirmed.
          </p>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${manageUrl}" class="btn btn-outline" style="color: #0369a1; background: #f0f9ff; border: 1px solid #0ea5e9;">View Booking Details</a>
        </div>
        `}

        <div class="footer">
          <p>TimeTide Powered by SeekaHost Technologies Ltd.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generateBookingConfirmedByHostEmail(
  data: BookingEmailData
): string {
  const manageUrl = `${process.env.NEXT_PUBLIC_APP_URL}/bookings/${data.bookingUid}`;
  const addToCalendarUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/bookings/${data.bookingUid}/calendar`;

  return `
    <!DOCTYPE html>
    <html>
    <head>${baseStyles}</head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo"><img src="${process.env.NEXT_PUBLIC_APP_URL}/email-logo.png" alt="TimeTide" width="32" height="32" style="display:inline-block;vertical-align:middle;width:32px;height:32px;" /> TimeTide</div>
        </div>

        <h2 style="text-align: center; margin-bottom: 8px; color: #10b981;">
          Your Booking is Confirmed!
        </h2>
        <p style="text-align: center; color: #64748b;">
          ${esc(data.hostName)} has confirmed your meeting request
        </p>

        <div class="card" style="border-left: 4px solid #10b981;">
          <h3 style="margin: 0 0 16px 0;">${esc(data.eventTitle)}</h3>
          ${data.eventDescription ? `<p style="color: #64748b; margin: 0 0 16px 0;">${esc(data.eventDescription)}</p>` : ''}

          <div class="detail-row">
            <span class="detail-label">📅 When</span>
            <span class="detail-value">${esc(data.startTime)} - ${esc(data.endTime)}</span>
          </div>

          <div class="detail-row">
            <span class="detail-label">🌍 Timezone</span>
            <span class="detail-value">${esc(data.timezone)}</span>
          </div>

          ${data.location ? `
          <div class="detail-row">
            <span class="detail-label">📍 Where</span>
            <span class="detail-value">${esc(data.location)}</span>
          </div>
          ` : ''}

          ${data.meetingUrl ? `
          <div class="detail-row">
            <span class="detail-label">🔗 Link</span>
            <span class="detail-value">
              <a href="${esc(data.meetingUrl)}" style="color: #0ea5e9;">${esc(data.meetingUrl)}</a>
            </span>
          </div>
          ` : ''}

          <div class="divider"></div>

          <div class="detail-row">
            <span class="detail-label">👤 Host</span>
            <span class="detail-value">${esc(data.hostName)}</span>
          </div>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${manageUrl}" class="btn" style="color: #ffffff;">View Booking</a>
          <a href="${addToCalendarUrl}" class="btn btn-outline" style="margin-left: 12px; color: #0369a1; background: #f0f9ff; border: 1px solid #0ea5e9;">Add to Calendar</a>
        </div>

        <div class="footer">
          <p>TimeTide Powered by SeekaHost Technologies Ltd.</p>
          <p style="font-size: 12px;">
            Need to make changes?
            <a href="${manageUrl}" style="color: #0ea5e9;">Reschedule or cancel</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generateBookingRejectedEmail(
  data: BookingEmailData,
  reason?: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>${baseStyles}</head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo"><img src="${process.env.NEXT_PUBLIC_APP_URL}/email-logo.png" alt="TimeTide" width="32" height="32" style="display:inline-block;vertical-align:middle;width:32px;height:32px;" /> TimeTide</div>
        </div>

        <h2 style="text-align: center; margin-bottom: 8px; color: #ef4444;">
          Booking Request Declined
        </h2>
        <p style="text-align: center; color: #64748b;">
          Unfortunately, ${esc(data.hostName)} was unable to confirm your meeting request
        </p>

        <div class="card" style="border-left: 4px solid #ef4444;">
          <h3 style="margin: 0 0 16px 0; text-decoration: line-through; color: #94a3b8;">
            ${esc(data.eventTitle)}
          </h3>

          <div class="detail-row">
            <span class="detail-label">📅 Was</span>
            <span class="detail-value" style="text-decoration: line-through; color: #94a3b8;">
              ${esc(data.startTime)} - ${esc(data.endTime)}
            </span>
          </div>

          ${reason ? `
          <div class="divider"></div>
          <div>
            <span class="detail-label">📝 Message from host</span>
            <p style="margin: 8px 0 0 0; color: #475569;">${esc(reason)}</p>
          </div>
          ` : ''}
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <p style="color: #64748b; margin-bottom: 16px;">You can try booking a different time.</p>
          <a href="${data.hostUsername && data.eventSlug
            ? `${process.env.NEXT_PUBLIC_APP_URL}/${encodeURIComponent(data.hostUsername)}/${encodeURIComponent(data.eventSlug)}`
            : process.env.NEXT_PUBLIC_APP_URL}" class="btn" style="color: #ffffff;">
            Book a New Time
          </a>
        </div>

        <div class="footer">
          <p>TimeTide Powered by SeekaHost Technologies Ltd.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generateReminderEmail(
  data: BookingEmailData,
  hoursUntil: number
): string {
  const manageUrl = `${process.env.NEXT_PUBLIC_APP_URL}/bookings/${data.bookingUid}`;

  return `
    <!DOCTYPE html>
    <html>
    <head>${baseStyles}</head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo"><img src="${process.env.NEXT_PUBLIC_APP_URL}/email-logo.png" alt="TimeTide" width="32" height="32" style="display:inline-block;vertical-align:middle;width:32px;height:32px;" /> TimeTide</div>
        </div>
        
        <h2 style="text-align: center; margin-bottom: 8px;">
          ⏰ Meeting Reminder
        </h2>
        <p style="text-align: center; color: #64748b;">
          Your meeting starts in ${hoursUntil === 1 ? '1 hour' : `${hoursUntil} hours`}
        </p>
        
        <div class="card">
          <h3 style="margin: 0 0 16px 0;">${esc(data.eventTitle)}</h3>

          <div class="detail-row">
            <span class="detail-label">📅 When</span>
            <span class="detail-value">${esc(data.startTime)} - ${esc(data.endTime)}</span>
          </div>

          <div class="detail-row">
            <span class="detail-label">👤 With</span>
            <span class="detail-value">${esc(data.hostName)}</span>
          </div>

          ${data.meetingUrl ? `
          <div class="divider"></div>
          <div style="text-align: center;">
            <a href="${esc(data.meetingUrl)}" class="btn" style="color: #ffffff;">Join Meeting</a>
          </div>
          ` : ''}
        </div>
        
        <div style="text-align: center; margin: 24px 0;">
          <a href="${manageUrl}" style="color: #0ea5e9; text-decoration: none;">
            Need to reschedule?
          </a>
        </div>
        
        <div class="footer">
          <p>TimeTide Powered by SeekaHost Technologies Ltd.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// ============================================================================
// SEND BOOKING EMAILS
// ============================================================================

export async function sendBookingConfirmationEmails(
  data: BookingEmailData
): Promise<void> {
  // Send to invitee
  await sendEmail({
    to: data.inviteeEmail,
    subject: `Confirmed: ${data.eventTitle} with ${data.hostName}`,
    html: generateBookingConfirmedEmail(data, false),
    replyTo: data.hostEmail,
  });

  // Send to host
  await sendEmail({
    to: data.hostEmail,
    subject: `New Booking: ${data.eventTitle} with ${data.inviteeName}`,
    html: generateBookingConfirmedEmail(data, true),
    replyTo: data.inviteeEmail,
  });
}

export async function sendBookingCancellationEmails(
  data: BookingEmailData,
  reason?: string,
  cancelledByHost: boolean = false
): Promise<void> {
  // Send to the other party
  const recipient = cancelledByHost ? data.inviteeEmail : data.hostEmail;
  const subject = cancelledByHost
    ? `Cancelled: ${data.eventTitle} - ${data.hostName} cancelled`
    : `Cancelled: ${data.eventTitle} - ${data.inviteeName} cancelled`;

  await sendEmail({
    to: recipient,
    subject,
    html: generateBookingCancelledEmail(data, !cancelledByHost, reason),
  });
}

export async function sendBookingRescheduledEmails(
  data: BookingEmailData,
  oldTime: { start: string; end: string },
  rescheduledByHost: boolean = false
): Promise<void> {
  // Send to invitee
  await sendEmail({
    to: data.inviteeEmail,
    subject: `Rescheduled: ${data.eventTitle} with ${data.hostName}`,
    html: generateBookingRescheduledEmail(data, oldTime, false),
    replyTo: data.hostEmail,
  });

  // Send to host if invitee rescheduled
  if (!rescheduledByHost) {
    await sendEmail({
      to: data.hostEmail,
      subject: `Rescheduled: ${data.eventTitle} - ${data.inviteeName} changed time`,
      html: generateBookingRescheduledEmail(data, oldTime, true),
      replyTo: data.inviteeEmail,
    });
  }
}

export async function sendBookingPendingEmails(
  data: BookingEmailData
): Promise<void> {
  // Send to invitee - let them know it's pending
  await sendEmail({
    to: data.inviteeEmail,
    subject: `Pending: ${data.eventTitle} with ${data.hostName} - Awaiting Confirmation`,
    html: generateBookingPendingEmail(data, false),
    replyTo: data.hostEmail,
  });

  // Send to host - let them know they need to confirm
  await sendEmail({
    to: data.hostEmail,
    subject: `Action Required: New booking request from ${data.inviteeName}`,
    html: generateBookingPendingEmail(data, true),
    replyTo: data.inviteeEmail,
  });
}

export async function sendBookingConfirmedByHostEmail(
  data: BookingEmailData
): Promise<void> {
  // Send confirmation to invitee
  await sendEmail({
    to: data.inviteeEmail,
    subject: `Confirmed: ${data.eventTitle} with ${data.hostName}`,
    html: generateBookingConfirmedByHostEmail(data),
    replyTo: data.hostEmail,
  });
}

export async function sendBookingRejectedEmail(
  data: BookingEmailData,
  reason?: string
): Promise<void> {
  // Send rejection to invitee
  await sendEmail({
    to: data.inviteeEmail,
    subject: `Declined: ${data.eventTitle} with ${data.hostName}`,
    html: generateBookingRejectedEmail(data, reason),
    replyTo: data.hostEmail,
  });
}

// ============================================================================
// PASSWORD RESET EMAILS
// ============================================================================

export function generatePasswordResetEmail(
  name: string,
  resetUrl: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>${baseStyles}</head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo"><img src="${process.env.NEXT_PUBLIC_APP_URL}/email-logo.png" alt="TimeTide" width="32" height="32" style="display:inline-block;vertical-align:middle;width:32px;height:32px;" /> TimeTide</div>
        </div>

        <h2 style="text-align: center; margin-bottom: 8px;">
          Reset Your Password
        </h2>
        <p style="text-align: center; color: #64748b;">
          Hi ${esc(name) || 'there'}, we received a request to reset your password.
        </p>

        <div class="card">
          <p style="margin: 0 0 16px 0; color: #475569;">
            Click the button below to reset your password. This link will expire in 1 hour.
          </p>

          <div style="text-align: center; margin: 24px 0;">
            <a href="${resetUrl}" class="btn" style="color: #ffffff;">Reset Password</a>
          </div>

          <p style="margin: 16px 0 0 0; font-size: 14px; color: #94a3b8;">
            If you didn't request this, you can safely ignore this email. Your password won't be changed.
          </p>
        </div>

        <div style="margin: 24px 0; padding: 16px; background: #f1f5f9; border-radius: 8px;">
          <p style="margin: 0; font-size: 12px; color: #64748b;">
            If the button doesn't work, copy and paste this link into your browser:
          </p>
          <p style="margin: 8px 0 0 0; font-size: 12px; word-break: break-all; color: #0ea5e9;">
            ${resetUrl}
          </p>
        </div>

        <div class="footer">
          <p>TimeTide Powered by SeekaHost Technologies Ltd.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  resetUrl: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: 'Reset your TimeTide password',
    html: generatePasswordResetEmail(name, resetUrl),
  });
}

// ============================================================================
// EMAIL VERIFICATION EMAILS
// ============================================================================

export function generateEmailVerificationEmail(
  name: string,
  verifyUrl: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>${baseStyles}</head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo"><img src="${process.env.NEXT_PUBLIC_APP_URL}/email-logo.png" alt="TimeTide" width="32" height="32" style="display:inline-block;vertical-align:middle;width:32px;height:32px;" /> TimeTide</div>
        </div>

        <h2 style="text-align: center; margin-bottom: 8px;">
          Verify Your Email
        </h2>
        <p style="text-align: center; color: #64748b;">
          Welcome to TimeTide, ${esc(name) || 'there'}! Please verify your email address.
        </p>

        <div class="card">
          <p style="margin: 0 0 16px 0; color: #475569;">
            Click the button below to verify your email address and complete your account setup.
          </p>

          <div style="text-align: center; margin: 24px 0;">
            <a href="${verifyUrl}" class="btn" style="color: #ffffff;">Verify Email</a>
          </div>

          <p style="margin: 16px 0 0 0; font-size: 14px; color: #94a3b8;">
            This link will expire in 24 hours.
          </p>
        </div>

        <div style="margin: 24px 0; padding: 16px; background: #f1f5f9; border-radius: 8px;">
          <p style="margin: 0; font-size: 12px; color: #64748b;">
            If the button doesn't work, copy and paste this link into your browser:
          </p>
          <p style="margin: 8px 0 0 0; font-size: 12px; word-break: break-all; color: #0ea5e9;">
            ${verifyUrl}
          </p>
        </div>

        <div class="footer">
          <p>TimeTide Powered by SeekaHost Technologies Ltd.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function sendEmailVerificationEmail(
  email: string,
  name: string,
  verifyUrl: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: 'Verify your TimeTide email address',
    html: generateEmailVerificationEmail(name, verifyUrl),
  });
}

// ============================================================================
// WELCOME EMAILS
// ============================================================================

export function generateWelcomeEmail(name: string): string {
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`;
  const settingsUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`;

  return `
    <!DOCTYPE html>
    <html>
    <head>${baseStyles}</head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo"><img src="${process.env.NEXT_PUBLIC_APP_URL}/email-logo.png" alt="TimeTide" width="32" height="32" style="display:inline-block;vertical-align:middle;width:32px;height:32px;" /> TimeTide</div>
        </div>

        <h2 style="text-align: center; margin-bottom: 8px;">
          Welcome to TimeTide!
        </h2>
        <p style="text-align: center; color: #64748b;">
          Hi ${esc(name) || 'there'}, your account is all set up and ready to go.
        </p>

        <div class="card">
          <h3 style="margin: 0 0 16px 0;">Get started in 3 easy steps:</h3>

          <div style="margin: 12px 0; padding: 12px; background: #f0f9ff; border-radius: 8px;">
            <p style="margin: 0; color: #0369a1;"><strong>1.</strong> Set your availability schedule</p>
          </div>

          <div style="margin: 12px 0; padding: 12px; background: #f0f9ff; border-radius: 8px;">
            <p style="margin: 0; color: #0369a1;"><strong>2.</strong> Customize your booking page</p>
          </div>

          <div style="margin: 12px 0; padding: 12px; background: #f0f9ff; border-radius: 8px;">
            <p style="margin: 0; color: #0369a1;"><strong>3.</strong> Share your link and start getting bookings</p>
          </div>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${dashboardUrl}" class="btn" style="color: #ffffff;">Go to Dashboard</a>
          <a href="${settingsUrl}" class="btn btn-outline" style="margin-left: 12px; color: #0369a1; background: #f0f9ff; border: 1px solid #0ea5e9;">Settings</a>
        </div>

        <div class="footer">
          <p>TimeTide Powered by SeekaHost Technologies Ltd.</p>
          <p style="font-size: 12px; color: #94a3b8;">
            You're receiving this because you created a TimeTide account.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function sendWelcomeEmail(
  email: string,
  name: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: 'Welcome to TimeTide - Let\'s get you started!',
    html: generateWelcomeEmail(name),
  });
}

// ============================================================================
// Team Emails
// ============================================================================

export interface TeamEmailData {
  memberName: string;
  teamName: string;
  actorName: string;
  role: string;
  teamUrl: string;
}

export function generateTeamMemberAddedEmail(data: TeamEmailData): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>${baseStyles}</head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo"><img src="${process.env.NEXT_PUBLIC_APP_URL}/email-logo.png" alt="TimeTide" width="32" height="32" style="display:inline-block;vertical-align:middle;width:32px;height:32px;" /> TimeTide</div>
        </div>

        <h2 style="text-align: center; color: #0f172a; margin-bottom: 8px;">You've been added to a team!</h2>
        <p style="text-align: center; color: #64748b;">
          ${esc(data.actorName)} added you to <strong>${esc(data.teamName)}</strong> as a <strong>${esc(data.role)}</strong>.
        </p>

        <div class="card">
          <div class="detail-row">
            <span class="detail-label">Team</span>
            <span class="detail-value">${esc(data.teamName)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Your Role</span>
            <span class="detail-value">${esc(data.role)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Added By</span>
            <span class="detail-value">${esc(data.actorName)}</span>
          </div>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${data.teamUrl}" class="btn" style="color: #ffffff;">View Team</a>
        </div>

        <div class="footer">
          <p>TimeTide Powered by SeekaHost Technologies Ltd.</p>
          <p style="font-size: 12px; color: #94a3b8;">
            You're receiving this because you were added to a team on TimeTide.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function sendTeamMemberAddedEmail(
  email: string,
  data: TeamEmailData
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: `You've been added to ${data.teamName} on TimeTide`,
    html: generateTeamMemberAddedEmail(data),
  });
}

export function generateTeamInvitationEmail(data: TeamEmailData & { expiresIn: string; acceptUrl: string }): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>${baseStyles}</head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo"><img src="${process.env.NEXT_PUBLIC_APP_URL}/email-logo.png" alt="TimeTide" width="32" height="32" style="display:inline-block;vertical-align:middle;width:32px;height:32px;" /> TimeTide</div>
        </div>

        <h2 style="text-align: center; color: #0f172a; margin-bottom: 8px;">You're invited to join a team!</h2>
        <p style="text-align: center; color: #64748b;">
          ${esc(data.actorName)} has invited you to join <strong>${esc(data.teamName)}</strong> as a <strong>${esc(data.role)}</strong>.
        </p>

        <div class="card">
          <div class="detail-row">
            <span class="detail-label">Team</span>
            <span class="detail-value">${esc(data.teamName)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Your Role</span>
            <span class="detail-value">${esc(data.role)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Invited By</span>
            <span class="detail-value">${esc(data.actorName)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Expires</span>
            <span class="detail-value">${esc(data.expiresIn)}</span>
          </div>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${data.acceptUrl}" class="btn" style="color: #ffffff;">Accept Invitation</a>
        </div>

        <p style="text-align: center; color: #94a3b8; font-size: 13px;">
          If you don't have a TimeTide account, you'll need to create one first using this email address.
        </p>

        <div class="footer">
          <p>TimeTide Powered by SeekaHost Technologies Ltd.</p>
          <p style="font-size: 12px; color: #94a3b8;">
            You're receiving this because someone invited you to a team on TimeTide.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function sendTeamInvitationEmail(
  email: string,
  data: TeamEmailData & { expiresIn: string; acceptUrl: string }
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: `You're invited to join ${data.teamName} on TimeTide`,
    html: generateTeamInvitationEmail(data),
  });
}
