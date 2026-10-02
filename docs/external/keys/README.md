# External service credentials

Never commit API keys, server keys, tokens, passwords, or private URLs to this directory or any other repository file.

Store local credentials in an ignored file in this directory, or preferably in the team's secret manager. Configure the application with environment variables:

- `BREVO_API_KEY`
- `MIDTRANS_SERVER_KEY`
- `MIDTRANS_CLIENT_KEY`
- `BITESHIP_API_TOKEN`

If a credential is committed or shared accidentally, revoke and replace it immediately; removing it from a later commit does not invalidate the exposed value.
