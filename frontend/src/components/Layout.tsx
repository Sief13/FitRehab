import { Suspense } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { ROLE_LABELS } from "../auth/AuthContext";
import { useAuth } from "../auth/useAuth";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? "nav-link active" : "nav-link";

export default function Layout() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/");
  }

  const showPlan = user?.role === "user" || user?.role === "premium";

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            FitRehab <span>AI</span>
          </Link>

          <nav className="nav">
            <NavLink to="/workout" className={linkClass}>
              Workout
            </NavLink>
            {user && (
              <NavLink to="/dashboard" className={linkClass}>
                Dashboard
              </NavLink>
            )}
            {showPlan && (
              <NavLink to="/plans" className={linkClass}>
                My plan
              </NavLink>
            )}
            {showPlan && (
              <NavLink to="/premium" className={linkClass}>
                Premium
              </NavLink>
            )}
            {user && (
              <NavLink to="/rehab" className={linkClass}>
                Rehab
              </NavLink>
            )}
          </nav>

          <div className="auth-actions">
            {loading ? null : user ? (
              <>
                <span className="user-chip">
                  {user.name}
                  <span className={`badge badge-${user.role}`}>{ROLE_LABELS[user.role]}</span>
                </span>
                <button className="secondary" onClick={handleLogout}>
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn secondary">
                  Log in
                </Link>
                <Link to="/register" className="btn">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="container">
        <Suspense fallback={<p className="muted">Loading...</p>}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="footer">FitRehab AI · Graduation project · Alexandria University</footer>
    </div>
  );
}
