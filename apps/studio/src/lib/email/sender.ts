/**
 * Email Sender — stub interface for newsletter delivery.
 *
 * Actual email provider (Resend, SendGrid, etc.) will be integrated later.
 * For now, logs the email content and returns a mock batch ID.
 */
import { createLogger } from "@/lib/logger";

const log = createLogger({ module: "email-sender" });

export interface SendEmailInput {
  to: string[];
  subject: string;
  html: string;
  text: string;
  /** Optional sender name override */
  fromName?: string;
}

export interface SendEmailResult {
  batchId: string;
  accepted: number;
  rejected: number;
}

/**
 * Send an email to a list of recipients.
 *
 * Currently a stub — logs the email and returns a mock result.
 * Replace the body with actual provider SDK when ready.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  log.info(
    { to: input.to.length, subject: input.subject },
    `[STUB] Sending email to ${input.to.length} recipients: "${input.subject}"`,
  );

  // TODO: Replace with actual email provider integration
  // Example with Resend:
  //   const resend = new Resend(process.env.RESEND_API_KEY);
  //   const result = await resend.batch.send(input.to.map(email => ({
  //     from: `${input.fromName ?? '매거진'} <newsletter@yourdomain.com>`,
  //     to: email,
  //     subject: input.subject,
  //     html: input.html,
  //     text: input.text,
  //   })));

  const mockBatchId = `stub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    batchId: mockBatchId,
    accepted: input.to.length,
    rejected: 0,
  };
}
