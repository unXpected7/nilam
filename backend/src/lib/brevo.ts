type Recipient = { email: string; name?: string }
export async function sendTransactionalEmail({ to, subject, textContent }: { to: Recipient[]; subject: string; textContent: string }) {
  const apiKey = process.env.BREVO_API_KEY; const senderEmail = process.env.BREVO_SENDER_EMAIL
  if (!apiKey || !senderEmail) throw new Error('Brevo is not configured')
  const response = await fetch(`${process.env.BREVO_API_BASE_URL || 'https://api.brevo.com/v3'}/smtp/email`, { method: 'POST', headers: { 'api-key': apiKey, accept: 'application/json', 'content-type': 'application/json', ...(process.env.BREVO_SANDBOX === 'true' ? { 'x-sib-sandbox': 'drop' } : {}) }, body: JSON.stringify({ sender: { email: senderEmail, name: process.env.BREVO_SENDER_NAME || 'Nilam' }, to, subject, textContent }) })
  const body = await response.json() as { messageId?: string; message?: string }
  if (!response.ok) throw new Error(body.message || 'Brevo could not send email')
  return body.messageId
}
