import sgMail from "@sendgrid/mail"

/**
 * Sending a document out of the building.
 *
 * Deliberately small and general: the reminder pipeline in notifications.ts has
 * its own delivery loop wound together with preferences, retries and per-record
 * error accounting, and is left alone. This exists for mail an advocate sends
 * deliberately, to a recipient they named, with a file attached.
 */

export type MailAttachment = {
  filename: string
  content: Buffer | Uint8Array
  type: string
}

export function getMailerConfig() {
  const apiKey = process.env.SENDGRID_API_KEY?.trim() || ""
  const fromEmail = process.env.NOTIFICATION_FROM_EMAIL?.trim() || ""
  const fromName = process.env.NOTIFICATION_FROM_NAME?.trim() || "Ravenslaw"

  return { apiKey, fromEmail, fromName, isEnabled: Boolean(apiKey && fromEmail) }
}

/**
 * Sends one message, with attachments, as the configured sender.
 *
 * `replyTo` is what makes this usable: the mail leaves from the product's own
 * verified sender (anything else fails SPF/DKIM), so without a reply-to the
 * recipient's answer would go nowhere the advocate can read it.
 */
export async function sendMail(options: {
  to: string
  subject: string
  text: string
  html?: string
  replyTo?: string
  attachments?: MailAttachment[]
}): Promise<void> {
  const config = getMailerConfig()
  if (!config.isEnabled) {
    throw new Error("Email delivery is not configured.")
  }

  sgMail.setApiKey(config.apiKey)

  await sgMail.send({
    to: options.to,
    from: { email: config.fromEmail, name: config.fromName },
    ...(options.replyTo ? { replyTo: options.replyTo } : {}),
    subject: options.subject,
    text: options.text,
    ...(options.html ? { html: options.html } : {}),
    attachments: (options.attachments ?? []).map((attachment) => ({
      filename: attachment.filename,
      content: Buffer.from(attachment.content).toString("base64"),
      type: attachment.type,
      disposition: "attachment",
    })),
  })
}
