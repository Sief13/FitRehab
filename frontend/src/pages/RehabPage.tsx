import { useAuth } from "../auth/useAuth";

export default function RehabPage() {
  const { user } = useAuth();
  const isDoctor = user?.role === "physiatrist";

  return (
    <>
      <h1>{isDoctor ? "Patients" : "My rehabilitation"}</h1>
      <div className="card">
        {isDoctor ? (
          <p className="muted no-margin">
            Coming soon: your patient list, exercise plans you assign, and each patient's
            AI-monitored progress.
          </p>
        ) : (
          <p className="muted no-margin">
            Coming soon: the recovery exercises assigned by your physiatrist and your progress
            through them.
          </p>
        )}
      </div>
    </>
  );
}
