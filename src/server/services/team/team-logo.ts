/**
 * Team logo management: upload and delete.
 *
 * Handles: file validation, image processing with sharp,
 * WebP conversion, and audit logging.
 */

import prisma from '@/server/db/prisma'
import { checkTeamAccess } from '@/server/teams/team-access'
import { logTeamAction } from '@/server/teams/team-audit'
import sharp from 'sharp'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class LogoNotAuthorizedError extends Error {
  constructor() {
    super('Not authorized')
    this.name = 'LogoNotAuthorizedError'
  }
}

export class LogoNoFileError extends Error {
  constructor() {
    super('No file provided')
    this.name = 'LogoNoFileError'
  }
}

export class LogoInvalidTypeError extends Error {
  constructor() {
    super('Invalid file type. Allowed: JPEG, PNG, WebP, GIF')
    this.name = 'LogoInvalidTypeError'
  }
}

export class LogoTooLargeError extends Error {
  constructor() {
    super('File too large. Maximum size is 2MB')
    this.name = 'LogoTooLargeError'
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 2 * 1024 * 1024 // 2MB

// ── Upload logo ───────────────────────────────────────────────────────────────

export async function uploadTeamLogo(
  teamId: string,
  sessionUserId: string,
  file: File
) {
  const membership = await checkTeamAccess(teamId, sessionUserId, 'ADMIN')
  if (!membership) throw new LogoNotAuthorizedError()

  if (!file) throw new LogoNoFileError()
  if (!ALLOWED_TYPES.includes(file.type)) throw new LogoInvalidTypeError()
  if (file.size > MAX_SIZE) throw new LogoTooLargeError()

  const rawBuffer = Buffer.from(await file.arrayBuffer())
  const optimized = await sharp(rawBuffer)
    .resize(256, 256, { fit: 'cover' })
    .webp({ quality: 80 })
    .toBuffer()

  const logoUrl = `/api/team-logo/${teamId}?v=${Date.now()}`
  const team = await prisma.team.update({
    where: { id: teamId },
    data: {
      logo: logoUrl,
      logoData: new Uint8Array(optimized),
    },
  })

  logTeamAction({
    teamId,
    userId: sessionUserId,
    action: 'team.logo_updated',
    targetType: 'Team',
    targetId: teamId,
  }).catch((err) => console.error('Failed to log team action:', err))

  return team
}

// ── Delete logo ───────────────────────────────────────────────────────────────

export async function deleteTeamLogo(teamId: string, sessionUserId: string) {
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: sessionUserId } },
  })

  if (!membership || membership.role === 'MEMBER') {
    throw new LogoNotAuthorizedError()
  }

  const team = await prisma.team.update({
    where: { id: teamId },
    data: { logo: null, logoData: null },
  })

  logTeamAction({
    teamId,
    userId: sessionUserId,
    action: 'team.logo_removed',
    targetType: 'Team',
    targetId: teamId,
  }).catch((err) => console.error('Failed to log team action:', err))

  return team
}
