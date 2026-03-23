import 'server-only';
import { NextResponse } from 'next/server';
import { getDatabaseRaw } from '@/lib/mongodb';

export async function GET() {
  try {
    const missingEnvVars = ['MONGODB_URI', 'JWT_SECRET'].filter(
      (name) => !process.env[name]
    );

    if (missingEnvVars.length > 0) {
      return NextResponse.json(
        { status: 'error' },
        {
          status: 503,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          },
        }
      );
    }

    if (process.env.NODE_ENV === 'production' && process.env.DISABLE_RATE_LIMIT === 'true') {
      return NextResponse.json(
        { status: 'error' },
        {
          status: 503,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          },
        }
      );
    }

    const db = await getDatabaseRaw();
    await db.command({ ping: 1 });

    return NextResponse.json(
      { status: 'ok' },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch {
    return NextResponse.json(
      { status: 'error' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  }
}
