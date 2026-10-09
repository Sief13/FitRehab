import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { ROLE_LABELS, type Role } from "../auth/AuthContext";
import { useAuth } from "../auth/useAuth";

function AccessDenied({ allowed, current }: { allowed: Role[]; current: Role }) {
  return (
    <div className="card center-card">
      <h1>Access restricted</h1>
      <p className="muted">
        This page is for: {allowed.map((r) => ROLE_LABELS[r]).join(", ")}.
        <br />
        You are signed in as: {ROLE_LABELS[current]}.
      </p>
      <Link to="/dashboard" className="btn">
        Back to dashboard
      </Link>
    </div>
  );
}

/**
 * Route guard. Not signed in -> redirect to /login (and come back afterwards).
 * Signed in with the wrong role -> "Access restricted" page.
 * The real protection is on the server; this only decides what the UI shows.
 */
export default function RequireAuth({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="muted">Loading...</p>;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (roles && !roles.includes(user.role)) {
    return <AccessDenied allowed={roles} current={user.role} />;
  }
  return <Outlet />;
}
