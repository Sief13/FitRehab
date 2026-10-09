import { Link } from "react-router-dom";

export type SaveState =
  | { kind: "idle" }
  | { kind: "guest" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

export default function SaveStatus({
  state,
  onRetry,
}: {
  state: SaveState;
  onRetry: () => void;
}) {
  switch (state.kind) {
    case "idle":
      return null;

    case "guest":
      return (
        <p className="save-status">
          <span>
            This session was not saved.{" "}
            <Link to="/login">Log in</Link> or <Link to="/register">sign up</Link> to keep your
            history and track progress.
          </span>
        </p>
      );

    case "saving":
      return <p className="save-status">Saving your session...</p>;

    case "saved":
      return (
        <p className="save-status ok">
          <span>
            Session saved. <Link to="/dashboard">View your dashboard</Link>
          </span>
        </p>
      );

    case "error":
      return (
        <p className="save-status bad">
          <span>Could not save: {state.message}</span>
          <button className="secondary" onClick={onRetry}>
            Try again
          </button>
        </p>
      );
  }
}
