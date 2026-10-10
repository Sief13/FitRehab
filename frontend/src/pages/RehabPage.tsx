import { useAuth } from "../auth/useAuth";
import DoctorRehab from "./rehab/DoctorRehab";
import PatientRehab from "./rehab/PatientRehab";

/** Same address for everyone; the content depends on the role. */
export default function RehabPage() {
  const { user } = useAuth();
  return user?.role === "physiatrist" ? <DoctorRehab /> : <PatientRehab />;
}
