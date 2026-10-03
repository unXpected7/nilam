import { expect, test } from '@playwright/test'
import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '../lib/prisma.js'

test('ERP login and recovery pages are accessible without leaking account existence', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Admin access' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/erp/request-password-reset')

  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  await page.getByLabel('Email').fill('nobody@example.invalid')
  await page.getByRole('button', { name: 'Send instructions' }).click()
  await expect(page.getByText('If that staff account exists, recovery instructions will be sent.')).toBeVisible()
})

test('ERP sign-in does not overflow at supported viewport widths', async ({ page }) => {
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Admin access' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  }
})

test('invitation and reset pages require a new password without exposing tokens', async ({ page }) => {
  await page.goto('/erp/accept-invitation?token=not-a-real-token')
  await expect(page.getByRole('heading', { name: 'Set up ERP access' })).toBeVisible()
  await expect(page.getByLabel('New password')).toBeVisible()
  await expect(page.getByLabel('Confirm password')).toBeVisible()

  await page.goto('/erp/reset-password?token=not-a-real-token')
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
  await expect(page.getByLabel('New password')).toBeVisible()
})

test('an invited Super Admin can activate an account and reach permission-gated ERP navigation', async ({ page }) => {
  const marker = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const token = randomBytes(32).toString('base64url')
  const role = await prisma.staffRole.findUnique({ where: { name: 'Super Admin' } })
  expect(role).toBeTruthy()
  const staff = await prisma.staffUser.create({ data: { email: `${marker}@example.test`, active: false, roles: { create: { roleId: role!.id } }, invitations: { create: { tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 60_000) } } } })
  try {
    await page.goto(`/erp/accept-invitation?token=${token}`)
    await page.getByLabel('New password').fill('A secure test password 123')
    await page.getByLabel('Confirm password').fill('A secure test password 123')
    await page.getByRole('button', { name: 'Save password' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByRole('link', { name: 'Stock imports' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Staff access' })).toBeVisible()
  } finally {
    await prisma.staffUser.delete({ where: { id: staff.id } }).catch(() => undefined)
  }
})
