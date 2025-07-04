
'use client';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/firebase/admin';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const pulseProfile = await prisma.pulseProfile.findUnique({
        where: { userId: user.id }
    });
    
    if (!pulseProfile) {
        // This should theoretically not happen because getPulseProfile in services creates one.
        // But handle it just in case.
        return NextResponse.json({ error: 'Pulse profile not found.' }, { status: 404 });
    }

    return NextResponse.json(pulseProfile);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(`[API /user/pulse-profile GET]`, error);
    return NextResponse.json({ error: 'Failed to retrieve pulse profile.' }, { status: 500 });
  }
}
