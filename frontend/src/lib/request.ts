function csrfToken() {
  return document.cookie.split('; ').find(value => value.startsWith('nilam_csrf='))?.split('=')[1] || ''
}

export function requestHeaders(headers?: HeadersInit) {
  const next = new Headers(headers)
  if (!next.has('content-type')) next.set('content-type', 'application/json')
  const token = csrfToken()
  if (token) next.set('x-csrf-token', token)
  return next
}
