/**
 * Email Client for TimeTide
 * Using Resend for transactional emails
 */

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

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
  inviteeName: string;
  inviteeEmail: string;
  eventTitle: string;
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
    .logo { font-size: 24px; font-weight: 700; color: #0ea5e9; }
    .card { background: #f8fafc; border-radius: 12px; padding: 24px; margin: 24px 0; }
    .detail-row { display: flex; margin: 12px 0; }
    .detail-label { color: #64748b; width: 100px; }
    .detail-value { font-weight: 500; }
    .btn { display: inline-block; padding: 12px 24px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 8px; font-weight: 500; }
    .btn-outline { background: transparent; border: 1px solid #0ea5e9; color: #0ea5e9; }
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
          <div class="logo">🌊 TimeTide</div>
        </div>
        
        <h2 style="text-align: center; margin-bottom: 8px;">
          ${isHost ? 'New Booking Confirmed' : 'Your Booking is Confirmed!'}
        </h2>
        <p style="text-align: center; color: #64748b;">
          ${isHost
            ? `${data.inviteeName} has booked a meeting with you`
            : `Your meeting with ${data.hostName} is scheduled`}
        </p>
        
        <div class="card">
          <h3 style="margin: 0 0 16px 0;">${data.eventTitle}</h3>
          ${data.eventDescription ? `<p style="color: #64748b; margin: 0 0 16px 0;">${data.eventDescription}</p>` : ''}
          
          <div class="detail-row">
            <span class="detail-label">📅 When</span>
            <span class="detail-value">${data.startTime} - ${data.endTime}</span>
          </div>
          
          <div class="detail-row">
            <span class="detail-label">🌍 Timezone</span>
            <span class="detail-value">${data.timezone}</span>
          </div>
          
          ${data.location ? `
          <div class="detail-row">
            <span class="detail-label">📍 Where</span>
            <span class="detail-value">${data.location}</span>
          </div>
          ` : ''}
          
          ${data.meetingUrl ? `
          <div class="detail-row">
            <span class="detail-label">🔗 Link</span>
            <span class="detail-value">
              <a href="${data.meetingUrl}" style="color: #0ea5e9;">${data.meetingUrl}</a>
            </span>
          </div>
          ` : ''}
          
          <div class="divider"></div>
          
          <div class="detail-row">
            <span class="detail-label">👤 ${isHost ? 'Invitee' : 'Host'}</span>
            <span class="detail-value">${isHost ? data.inviteeName : data.hostName}</span>
          </div>
          
          <div class="detail-row">
            <span class="detail-label">✉️ Email</span>
            <span class="detail-value">${isHost ? data.inviteeEmail : data.hostEmail}</span>
          </div>
          
          ${data.notes ? `
          <div class="divider"></div>
          <div>
            <span class="detail-label">📝 Notes</span>
            <p style="margin: 8px 0 0 0; color: #475569;">${data.notes}</p>
          </div>
          ` : ''}
        </div>
        
        <div style="text-align: center; margin: 32px 0;">
          <a href="${manageUrl}" class="btn">Manage Booking</a>
          <a href="${addToCalendarUrl}" class="btn btn-outline" style="margin-left: 12px;">Add to Calendar</a>
        </div>
        
        <div class="footer">
          <p>Powered by TimeTide - Modern Scheduling</p>
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
          <div class="logo">🌊 TimeTide</div>
        </div>
        
        <h2 style="text-align: center; margin-bottom: 8px; color: #ef4444;">
          Booking Cancelled
        </h2>
        <p style="text-align: center; color: #64748b;">
          ${isHost
            ? `${data.inviteeName} has cancelled their booking`
            : `Your meeting with ${data.hostName} has been cancelled`}
        </p>
        
        <div class="card" style="border-left: 4px solid #ef4444;">
          <h3 style="margin: 0 0 16px 0; text-decoration: line-through; color: #94a3b8;">
            ${data.eventTitle}
          </h3>
          
          <div class="detail-row">
            <span class="detail-label">📅 Was</span>
            <span class="detail-value" style="text-decoration: line-through; color: #94a3b8;">
              ${data.startTime} - ${data.endTime}
            </span>
          </div>
          
          ${reason ? `
          <div class="divider"></div>
          <div>
            <span class="detail-label">📝 Reason</span>
            <p style="margin: 8px 0 0 0; color: #475569;">${reason}</p>
          </div>
          ` : ''}
        </div>
        
        ${!isHost ? `
        <div style="text-align: center; margin: 32px 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/${data.hostName}/${data.eventTitle}" class="btn">
            Book a New Time
          </a>
        </div>
        ` : ''}
        
        <div class="footer">
          <p>Powered by TimeTide - Modern Scheduling</p>
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
          <div class="logo">🌊 TimeTide</div>
        </div>
        
        <h2 style="text-align: center; margin-bottom: 8px; color: #f59e0b;">
          Booking Rescheduled
        </h2>
        <p style="text-align: center; color: #64748b;">
          ${isHost
            ? `${data.inviteeName} has rescheduled their booking`
            : `Your meeting with ${data.hostName} has been rescheduled`}
        </p>
        
        <div class="card">
          <h3 style="margin: 0 0 16px 0;">${data.eventTitle}</h3>
          
          <div style="background: #fef3c7; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            <p style="margin: 0; font-size: 14px; color: #92400e;">
              <strong>Old time:</strong> 
              <span style="text-decoration: line-through;">${oldTime.start} - ${oldTime.end}</span>
            </p>
          </div>
          
          <div style="background: #d1fae5; padding: 12px; border-radius: 8px;">
            <p style="margin: 0; font-size: 14px; color: #065f46;">
              <strong>New time:</strong> ${data.startTime} - ${data.endTime}
            </p>
          </div>
          
          <div class="divider"></div>
          
          <div class="detail-row">
            <span class="detail-label">🌍 Timezone</span>
            <span class="detail-value">${data.timezone}</span>
          </div>
          
          ${data.meetingUrl ? `
          <div class="detail-row">
            <span class="detail-label">🔗 Link</span>
            <span class="detail-value">
              <a href="${data.meetingUrl}" style="color: #0ea5e9;">${data.meetingUrl}</a>
            </span>
          </div>
          ` : ''}
        </div>
        
        <div style="text-align: center; margin: 32px 0;">
          <a href="${manageUrl}" class="btn">View Booking</a>
        </div>
        
        <div class="footer">
          <p>Powered by TimeTide - Modern Scheduling</p>
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
          <div class="logo">🌊 TimeTide</div>
        </div>
        
        <h2 style="text-align: center; margin-bottom: 8px;">
          ⏰ Meeting Reminder
        </h2>
        <p style="text-align: center; color: #64748b;">
          Your meeting starts in ${hoursUntil === 1 ? '1 hour' : `${hoursUntil} hours`}
        </p>
        
        <div class="card">
          <h3 style="margin: 0 0 16px 0;">${data.eventTitle}</h3>
          
          <div class="detail-row">
            <span class="detail-label">📅 When</span>
            <span class="detail-value">${data.startTime} - ${data.endTime}</span>
          </div>
          
          <div class="detail-row">
            <span class="detail-label">👤 With</span>
            <span class="detail-value">${data.hostName}</span>
          </div>
          
          ${data.meetingUrl ? `
          <div class="divider"></div>
          <div style="text-align: center;">
            <a href="${data.meetingUrl}" class="btn">Join Meeting</a>
          </div>
          ` : ''}
        </div>
        
        <div style="text-align: center; margin: 24px 0;">
          <a href="${manageUrl}" style="color: #0ea5e9; text-decoration: none;">
            Need to reschedule?
          </a>
        </div>
        
        <div class="footer">
          <p>Powered by TimeTide - Modern Scheduling</p>
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
