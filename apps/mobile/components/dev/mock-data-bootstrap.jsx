import { useEffect } from "react";
import { ensureMockDevSession } from "../../services/mock/bootstrap";

/** Dev-only: wire mock community context on app boot when mock mode is enabled. */
export default function MockDataBootstrap() {
  useEffect(() => {
    ensureMockDevSession().catch(() => {});
  }, []);

  return null;
}
