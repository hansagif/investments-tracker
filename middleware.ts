import { NextRequest, NextResponse } from 'next/server';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export function middleware(request: NextRequest) {
  const authUser = process.env.AUTH_USER;
  const authPass = process.env.AUTH_PASS;

  // If creds not configured, block access entirely
  if (!authUser || !authPass) {
    return new NextResponse('Server misconfiguration: AUTH_USER and AUTH_PASS must be set.', {
      status: 500,
    });
  }

  const authHeader = request.headers.get('authorization');

  if (authHeader && authHeader.startsWith('Basic ')) {
    const base64 = authHeader.slice(6);
    const decoded = atob(base64);
    const colonIndex = decoded.indexOf(':');
    if (colonIndex !== -1) {
      const user = decoded.slice(0, colonIndex);
      const pass = decoded.slice(colonIndex + 1);
      if (user === authUser && pass === authPass) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Investments Tracker", charset="UTF-8"' },
  });
}
