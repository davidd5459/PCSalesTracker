import { Link } from "react-router";

export function NotFoundPage({ message = "That page doesn't exist." }: { message?: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-6xl font-extrabold text-accent">404</p>
      <h1 className="mt-4 text-2xl font-bold">{message}</h1>
      <p className="mt-2 text-muted">Try searching for another game.</p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-lg bg-accent px-4 py-2 font-semibold text-black hover:brightness-110"
      >
        Back to home
      </Link>
    </div>
  );
}
