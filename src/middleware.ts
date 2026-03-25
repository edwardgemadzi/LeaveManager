import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyTokenEdge } from '@/lib/auth-edge';

function isPublicPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/login' || pathname === '/contact') return true;
  if (pathname === '/register-leader' || pathname === '/register-member') return true;
  return false;
}

function requiresAuth(pathname: string): boolean {
  return (
    pathname.startsWith('/leader') ||
    pathname.startsWith('/member') ||
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/')
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Admin routes are handled by admin-helpers (localhost + env var check)
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    return NextResponse.next();
  }

  const cookieToken = request.cookies.get('token')?.value;
  const bearerToken = request.headers.get('authorization')?.replace('Bearer ', '');
  const token = cookieToken || bearerToken;

  // Authenticated users hitting login → send to the right home (cookie only: ignore stray Authorization on navigations)
  if (pathname === '/login' && cookieToken) {
    try {
      const user = await verifyTokenEdge(cookieToken);
      if (user) {
        const dest =
          user.role === 'leader' ? '/leader/dashboard' : '/member/dashboard';
        return NextResponse.redirect(new URL(dest, request.url));
      }
    } catch {
      // fall through to login page
    }
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (requiresAuth(pathname)) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      const user = await verifyTokenEdge(token);
      if (!user) {
        return NextResponse.redirect(new URL('/login', request.url));
      }

      if (pathname.startsWith('/leader') && user.role !== 'leader') {
        return NextResponse.redirect(new URL('/member/dashboard', request.url));
      }

      if (pathname.startsWith('/member') && user.role !== 'member') {
        return NextResponse.redirect(new URL('/leader/dashboard', request.url));
      }

      if (pathname === '/dashboard') {
        if (user.role === 'leader') {
          return NextResponse.redirect(new URL('/leader/dashboard', request.url));
        }
        return NextResponse.redirect(new URL('/member/dashboard', request.url));
      }
    } catch (error) {
      console.error('Middleware token verification error:', error);
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
