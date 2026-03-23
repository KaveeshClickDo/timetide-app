import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sendEmail } from '@/server/integrations/email/client'
import { verifyCode } from '@/server/auth/email-verification'
import { checkContactRateLimit } from '@/server/infrastructure/queue'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const contactSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  subject: z.string().min(1, 'Subject is required').max(200),
  message: z.string().min(10, 'Message must be at least 10 characters').max(5000),
})

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const rateLimitResult = await checkContactRateLimit(ip);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many submissions. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json()
    const data = contactSchema.parse(body)

    // Verify email ownership
    const ev = body.emailVerification
    if (!ev?.code || !ev?.signature || !ev?.expiresAt) {
      return NextResponse.json(
        { error: 'Email verification is required' },
        { status: 400 }
      )
    }
    const verification = verifyCode(data.email, ev.code, 'BOOKING_CREATE', ev.signature, ev.expiresAt)
    if (!verification.valid) {
      return NextResponse.json(
        { error: verification.error || 'Email verification failed' },
        { status: 403 }
      )
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0369a1;">New Contact Form Submission</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #374151;">Name:</td>
            <td style="padding: 8px 0; color: #4b5563;">${escapeHtml(data.name)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #374151;">Email:</td>
            <td style="padding: 8px 0; color: #4b5563;">${escapeHtml(data.email)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #374151;">Subject:</td>
            <td style="padding: 8px 0; color: #4b5563;">${escapeHtml(data.subject)}</td>
          </tr>
        </table>
        <div style="margin-top: 16px; padding: 16px; background: #f3f4f6; border-radius: 8px;">
          <p style="font-weight: bold; color: #374151; margin: 0 0 8px 0;">Message:</p>
          <p style="color: #4b5563; margin: 0; white-space: pre-wrap;">${escapeHtml(data.message)}</p>
        </div>
      </div>
    `

    const sent = await sendEmail({
      to: 'hello@timetide.app',
      subject: `[Contact Form] ${data.subject}`,
      html,
      replyTo: data.email,
    })

    if (!sent) {
      return NextResponse.json(
        { error: 'Failed to send message. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      )
    }
    console.error('Contact form error:', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}
