import { notFound } from 'next/navigation'

/** Dev-only stand-in for signing in as somebody else. There is no Access header
 *  on localhost, so requireUser() falls back to a `dev_user` cookie; this sets
 *  it. Two browser profiles (or one normal window and one private, which gets
 *  its own IndexedDB) are then two accounts, with no change to the sync engine
 *  and no test-only branch anywhere near it.
 *
 *  Never reachable in production -- same guard as /dev/sync-test and
 *  /dev/fake-access. The cookie it sets is inert there regardless: the branch in
 *  requireUser() that reads it is compiled out of a production build. */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') notFound()

  const email = new URL(request.url).searchParams.get('email')?.trim()
  if (!email) {
    return Response.json({ error: 'pass ?email=someone@example.com' }, { status: 400 })
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': `dev_user=${encodeURIComponent(email)}; Path=/; SameSite=Lax; Max-Age=31536000`,
    },
  })
}
