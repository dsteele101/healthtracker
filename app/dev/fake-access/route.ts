import { notFound } from 'next/navigation'

/** Dev-only stand-in for Cloudflare Access: redirects to another origin exactly
 *  the way an expired Access session does, so the sync engine's auth detection
 *  can be tested without deploying behind a real tunnel. */
export async function GET() {
  if (process.env.NODE_ENV === 'production') notFound()
  return Response.redirect('https://example.com/cdn-cgi/access/login', 302)
}

export async function POST() {
  if (process.env.NODE_ENV === 'production') notFound()
  return Response.redirect('https://example.com/cdn-cgi/access/login', 302)
}
