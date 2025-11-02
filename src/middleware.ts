import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/register-leader', '/register-member', '/'];
  
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // For client-side navigation, we'll let the client handle authentication
  // The middleware will only redirect if there's no token in the request
  const token = request.cookies.get('token')?.value || 
                request.headers.get('authorization')?.replace('Bearer ', '');

  // If no token in request, let the client handle the redirect
  if (!token) {
    return NextResponse.next();
  }

  try {
    const user = verifyToken(token);
    if (!user) {
      return NextResponse.next();
    }

    // Role-based access control
    if (pathname.startsWith('/leader') && user.role !== 'leader') {
      return NextResponse.redirect(new URL('/member/dashboard', request.url));
    }

    if (pathname.startsWith('/member') && user.role !== 'member') {
      return NextResponse.redirect(new URL('/leader/dashboard', request.url));
    }

    // Redirect dashboard to role-specific dashboard
    if (pathname === '/dashboard') {
      if (user.role === 'leader') {
        return NextResponse.redirect(new URL('/leader/dashboard', request.url));
      } else {
        return NextResponse.redirect(new URL('/member/dashboard', request.url));
      }
    }
  } catch (error) {
    // Token verification failed, let client handle it
    console.error('Middleware token verification error:', error);
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
