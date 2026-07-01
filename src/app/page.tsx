import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal } from "../lib/auth/session";

export default async function Home() {
  if (await getPrincipal()) redirect("/dashboard");

  const Feature = ({ title, body }: { title: string; body: string }) => (
    <div className="card p-5">
      <h3 className="font-display text-lg text-ink">{title}</h3>
      <p className="mt-1.5 text-sm text-muted">{body}</p>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6">
      {/* Top bar */}
      <header className="reveal flex items-center justify-between" style={{ animationDelay: "0ms" }}>
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-forest text-forest-ink shadow-[0_6px_16px_-6px_rgba(31,61,48,.5)]">
            <span className="font-display text-lg leading-none">£</span>
          </span>
          <span className="font-display text-xl font-semibold text-ink">Quidly</span>
        </div>
        <Link href="/login" className="btn btn-ghost">Sign in</Link>
      </header>

      {/* Hero */}
      <section className="reveal grid items-center gap-10 py-16 md:grid-cols-2 md:py-24" style={{ animationDelay: "60ms" }}>
        <div>
          <span className="pill">UK landlord bookkeeping &amp; tax</span>
          <h1 className="mt-4 font-display text-[2.6rem] leading-[1.05] text-ink md:text-[3.2rem]">
            Rental accounts that do your tax for you.
          </h1>
          <p className="mt-4 max-w-md text-base text-muted">
            Quidly is a free, self-hosted bookkeeping app for UK landlords — track income and expenses
            and get your SA105 (and corporation tax) worked out to the penny.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/login" className="btn btn-primary">Sign in</Link>
            <a href="#self-host" className="btn btn-ghost">Self-host it — free ↓</a>
          </div>
        </div>
        <div className="card p-6">
          <div className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">This year&apos;s position</div>
          <div className="flex items-baseline justify-between py-2 text-sm text-muted"><span>Rental income</span><span className="money text-ink">+£14,400.00</span></div>
          <div className="flex items-baseline justify-between py-2 text-sm text-muted"><span>Allowable expenses</span><span className="money text-ink">−£3,180.00</span></div>
          <div className="flex items-baseline justify-between border-t border-line-strong py-2 pt-3"><span className="font-display text-base text-ink">Taxable profit</span><span className="money text-lg font-medium text-ink">£11,220.00</span></div>
          <div className="mt-4 rounded-[12px] bg-forest p-4 text-forest-ink">
            <div className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-forest-ink/70">Estimated tax</div>
            <div className="money text-2xl font-medium">£2,244.00</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="reveal" style={{ animationDelay: "120ms" }}>
        <div className="grid gap-4 md:grid-cols-3">
          <Feature title="Bookkeeping" body="Transactions, recurring rules, and one-click bank-CSV import — across every property." />
          <Feature title="Scan a receipt" body="Optional AI extraction turns a photo into a tagged transaction, using your own key." />
          <Feature title="SA105 & personal tax" body="The £1,000 allowance, Section 24 relief and Scottish bands — computed to the penny." />
          <Feature title="Limited companies" body="Corporation tax, dividends and the director's loan account (s455 + benefit-in-kind)." />
          <Feature title="Plan ahead" body="What-if personal-vs-company, and the salary-vs-dividend optimiser." />
          <Feature title="Light & dark" body="A calm, considered interface that follows your system theme." />
        </div>
      </section>

      {/* Why */}
      <section className="reveal py-16" style={{ animationDelay: "160ms" }}>
        <h2 className="font-display text-2xl text-ink">Yours, forever</h2>
        <div className="mt-4 grid gap-4 text-sm text-muted sm:grid-cols-2 md:grid-cols-3">
          <p><b className="text-ink">Free &amp; open.</b> No subscriptions, no paywalled reports.</p>
          <p><b className="text-ink">Self-hosted.</b> Your data lives on your machine, not someone&apos;s cloud.</p>
          <p><b className="text-ink">UK-first.</b> SA105, HMRC categories, corporation tax — built for here.</p>
          <p><b className="text-ink">To the penny.</b> Money is integer pence end to end — no rounding surprises.</p>
          <p><b className="text-ink">Multi-property.</b> Personal and company-owned, side by side.</p>
          <p><b className="text-ink">Considered.</b> A UI that makes your numbers easy to read.</p>
        </div>
      </section>

      {/* Self-host */}
      <section id="self-host" className="reveal scroll-mt-8" style={{ animationDelay: "200ms" }}>
        <div className="card p-6 md:p-8">
          <h2 className="font-display text-2xl text-ink">Self-host in 2 minutes</h2>
          <p className="mt-2 max-w-xl text-sm text-muted">Quidly ships as a Docker image with everything bundled. On any machine with Docker:</p>
          <pre className="mt-4 overflow-x-auto rounded-[10px] border border-line bg-surface-sunk p-4 text-[0.8rem] leading-relaxed text-ink"><code>{`git clone <your-repo>        # your fork
cd quidly
cp .env.example .env         # set SESSION_SECRET
docker compose run --rm quidly npm run set-password   # paste the Docker-Compose hash into .env
docker compose up -d
# open http://localhost:3000`}</code></pre>
          <p className="mt-3 text-xs text-faint">Serve it behind an HTTPS reverse proxy (Caddy/Traefik/nginx). Full instructions in the README.</p>
          {/* TODO: set your public repo URL when you publish */}
          <a href="#" className="btn btn-ghost mt-4">View the code</a>
        </div>
      </section>

      {/* Footer */}
      <footer className="reveal mt-16 border-t border-line py-8 text-sm text-faint" style={{ animationDelay: "240ms" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-display text-ink">Quidly</span>
          <span>Made for UK landlords who&apos;d rather not fight their spreadsheet.</span>
        </div>
        <p className="mt-3">Not affiliated with HMRC. Quidly produces estimates, not tax advice — verify before filing.</p>
      </footer>
    </div>
  );
}
