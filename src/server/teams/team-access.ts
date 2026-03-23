import prisma from '@/server/db/prisma';

export type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER';

/**
 * Check if a user is a member of a team and optionally verify their role.
 *
 * @param teamId - The team ID
 * @param userId - The user ID to check
 * @param requiredRole - Minimum role required:
 *   - undefined: any member (MEMBER, ADMIN, OWNER)
 *   - 'ADMIN': ADMIN or OWNER only
 *   - 'OWNER': OWNER only
 * @returns The membership record if authorized, null otherwise
 */
export async function checkTeamAccess(
  teamId: string,
  userId: string,
  requiredRole?: 'ADMIN' | 'OWNER',
) {
  const membership = await prisma.teamMember.findUnique({
    where: {
      teamId_userId: {
        teamId,
        userId,
      },
    },
  });

  if (!membership) return null;

  if (requiredRole === 'OWNER' && membership.role !== 'OWNER') {
    return null;
  }

  if (requiredRole === 'ADMIN' && membership.role === 'MEMBER') {
    return null;
  }

  return membership;
}
