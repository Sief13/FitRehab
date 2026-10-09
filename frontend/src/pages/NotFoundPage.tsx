import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="card center-card">
      <h1>Page not found</h1>
      <p className="muted">The page you are looking for does not exist.</p>
      <Link to="/" className="btn">
        Go home
      </Link>
    </div>
  );
}
