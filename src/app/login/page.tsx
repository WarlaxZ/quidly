export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <div className="mx-auto mt-24 max-w-sm space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      {error && <p className="rounded bg-red-100 px-3 py-2 text-red-700">{error}</p>}
      <form method="post" action="/api/login" className="space-y-3">
        <input type="hidden" name="next" value={next ?? "/dashboard"} />
        <input name="username" placeholder="Username" autoComplete="username" required className="w-full border px-2 py-1" />
        <input name="password" type="password" placeholder="Password" autoComplete="current-password" required className="w-full border px-2 py-1" />
        <button type="submit" className="w-full bg-blue-600 px-3 py-2 text-white">Sign in</button>
      </form>
    </div>
  );
}
