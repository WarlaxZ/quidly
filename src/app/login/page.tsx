export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="reveal w-full max-w-sm">
        <div className="mb-2 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-forest text-forest-ink shadow-[0_6px_16px_-6px_rgba(31,61,48,.7)]">
            <span className="font-display text-xl leading-none">£</span>
          </span>
          <span className="font-display text-xl font-semibold leading-tight text-ink">Quidly</span>
        </div>
        <p className="mb-6 text-sm text-muted">Self-Assessment, sorted.</p>

        <div className="card p-7">
          <h1 className="text-2xl text-ink">Welcome back</h1>
          <p className="mt-1 text-sm text-muted">Sign in to your accounts.</p>

          {error && <p className="mt-4 rounded-lg border border-negative/30 bg-negative-soft px-3 py-2 text-sm text-negative">{error}</p>}

          <form method="post" action="/api/login" className="mt-5 space-y-3.5">
            <input type="hidden" name="next" value={next ?? "/dashboard"} />
            <label className="block">
              <span className="label">Username</span>
              <input name="username" autoComplete="username" required className="field" />
            </label>
            <label className="block">
              <span className="label">Password</span>
              <input name="password" type="password" autoComplete="current-password" required className="field" />
            </label>
            <button type="submit" className="btn btn-primary w-full">Sign in</button>
          </form>
        </div>
      </div>
    </div>
  );
}
