/**
 * Zoom Integration
 * Handles OAuth and meeting creation via Zoom API
 */

import prisma from '../prisma';

// ============================================================================
// OAUTH
// ============================================================================

export function getZoomAuthUrl(userId: string): string {
  const clientId = process.env.ZOOM_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/zoom/callback`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId!,
    redirect_uri: redirectUri,
    state: userId,
  });

  return `https://zoom.us/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string) {
  const clientId = process.env.ZOOM_CLIENT_ID!;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET!;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/zoom/callback`;

  const response = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code for tokens: ${error}`);
  }

  return response.json();
}

/**
 * Connect a Zoom account for a user
 * Exchanges OAuth code for tokens and saves to database
 */
export async function connectZoomAccount(userId: string, code: string) {
  const tokenData = await exchangeCodeForTokens(code);

  if (!tokenData.access_token) {
    throw new Error('No access token received from Zoom');
  }

  // Get Zoom user info
  const userInfo = await fetch('https://api.zoom.us/v2/users/me', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  if (!userInfo.ok) {
    throw new Error('Failed to fetch Zoom user info');
  }

  const zoomUser = await userInfo.json();

  // Calculate token expiry
  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000)
    : null;

  // Check if zoom credential already exists
  const existingCredential = await prisma.zoomCredential.findUnique({
    where: { userId },
  });

  if (existingCredential) {
    // Update existing credential
    const credential = await prisma.zoomCredential.update({
      where: { userId },
      data: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        expiresAt,
        zoomUserId: zoomUser.id,
      },
    });
    return credential;
  }

  // Create new credential
  const credential = await prisma.zoomCredential.create({
    data: {
      userId,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      expiresAt,
      zoomUserId: zoomUser.id,
    },
  });

  return credential;
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

export async function refreshAccessToken(userId: string): Promise<string | null> {
  const credential = await prisma.zoomCredential.findUnique({
    where: { userId },
  });

  if (!credential?.refreshToken) {
    return null;
  }

  const clientId = process.env.ZOOM_CLIENT_ID!;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET!;

  try {
    const response = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credential.refreshToken,
      }),
    });

    if (!response.ok) {
      console.error('Failed to refresh Zoom token:', await response.text());
      return null;
    }

    const tokenData = await response.json();

    // Update stored tokens
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    await prisma.zoomCredential.update({
      where: { userId },
      data: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || credential.refreshToken,
        expiresAt,
      },
    });

    return tokenData.access_token;
  } catch (error) {
    console.error('Failed to refresh Zoom token:', error);
    return null;
  }
}

async function getValidAccessToken(userId: string): Promise<string> {
  const credential = await prisma.zoomCredential.findUnique({
    where: { userId },
  });

  if (!credential) {
    throw new Error('Zoom account not connected');
  }

  // Check if token is expired or about to expire (within 5 minutes)
  if (
    credential.expiresAt &&
    new Date(credential.expiresAt.getTime() - 5 * 60 * 1000) <= new Date()
  ) {
    const newAccessToken = await refreshAccessToken(userId);
    if (!newAccessToken) {
      throw new Error('Failed to refresh Zoom access token');
    }
    return newAccessToken;
  }

  return credential.accessToken;
}

// ============================================================================
// MEETING CREATION
// ============================================================================

export interface CreateZoomMeetingParams {
  userId: string;
  topic: string;
  startTime: Date;
  duration: number; // in minutes
  timezone: string;
  agenda?: string;
}

export interface CreateZoomMeetingResult {
  meetingId: string;
  meetingUrl: string;
  joinUrl: string;
  password?: string;
}

export async function createZoomMeeting(
  params: CreateZoomMeetingParams
): Promise<CreateZoomMeetingResult> {
  try {
    const accessToken = await getValidAccessToken(params.userId);

    const meetingData = {
      topic: params.topic,
      type: 2, // Scheduled meeting
      start_time: params.startTime.toISOString(),
      duration: params.duration,
      timezone: params.timezone,
      agenda: params.agenda || '',
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: false,
        mute_upon_entry: false,
        watermark: false,
        audio: 'both',
        auto_recording: 'none',
      },
    };

    const response = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(meetingData),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create Zoom meeting: ${error}`);
    }

    const meeting = await response.json();

    console.log('Created Zoom meeting:', {
      meetingId: meeting.id,
      hasJoinUrl: !!meeting.join_url,
      joinUrl: meeting.join_url,
    });

    return {
      meetingId: meeting.id.toString(),
      meetingUrl: meeting.join_url,
      joinUrl: meeting.join_url,
      password: meeting.password,
    };
  } catch (error) {
    console.error('Failed to create Zoom meeting:', error);
    throw error;
  }
}

/**
 * Delete a Zoom meeting
 */
export async function deleteZoomMeeting(
  userId: string,
  meetingId: string
): Promise<boolean> {
  try {
    const accessToken = await getValidAccessToken(userId);

    const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok && response.status !== 204) {
      console.error('Failed to delete Zoom meeting:', await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to delete Zoom meeting:', error);
    return false;
  }
}

/**
 * Update a Zoom meeting
 */
export async function updateZoomMeeting(
  userId: string,
  meetingId: string,
  updates: Partial<CreateZoomMeetingParams>
): Promise<boolean> {
  try {
    const accessToken = await getValidAccessToken(userId);

    const meetingData: any = {};

    if (updates.topic) meetingData.topic = updates.topic;
    if (updates.startTime) meetingData.start_time = updates.startTime.toISOString();
    if (updates.duration) meetingData.duration = updates.duration;
    if (updates.timezone) meetingData.timezone = updates.timezone;
    if (updates.agenda) meetingData.agenda = updates.agenda;

    const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(meetingData),
    });

    if (!response.ok) {
      console.error('Failed to update Zoom meeting:', await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to update Zoom meeting:', error);
    return false;
  }
}

/**
 * Check if user has Zoom connected
 */
export async function hasZoomConnected(userId: string): Promise<boolean> {
  const credential = await prisma.zoomCredential.findUnique({
    where: { userId },
  });

  return !!credential;
}

/**
 * Disconnect Zoom account
 */
export async function disconnectZoomAccount(userId: string): Promise<boolean> {
  try {
    await prisma.zoomCredential.delete({
      where: { userId },
    });
    return true;
  } catch (error) {
    console.error('Failed to disconnect Zoom account:', error);
    return false;
  }
}
