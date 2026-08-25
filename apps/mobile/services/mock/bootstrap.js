import { MOCK_DEMO_TOKEN } from "../../constants/api-config";
import { isMockDataEnvEnabled, MOCK_COMMUNITY_ID } from "../../constants/mock-config";
import { bootstrapMockPersona } from "./handlers";
import { getCommunityId, getToken, getUser, setCommunityId, setSession } from "../auth-session";

/** Start a fully populated demo session (no backend required). */
export async function enterMockDemo(persona = "resident") {
  const user = bootstrapMockPersona(persona);
  await setSession({ token: MOCK_DEMO_TOKEN, user });
  await setCommunityId(MOCK_COMMUNITY_ID);
  return user;
}

export { enterMockDemo as bootstrapMockSession };

/** Keep mock sessions wired to Oak Valley sample data after cold start. */
export async function ensureMockDevSession() {
  if (!__DEV__) return false;

  const token = await getToken();
  const envMock = isMockDataEnvEnabled();
  const demoToken = token === MOCK_DEMO_TOKEN;

  if (!envMock && !demoToken) return false;

  if (demoToken) {
    const user = await getUser();
    bootstrapMockPersona(user?.role === "community_admin" ? "admin" : "resident");
  }

  const communityId = await getCommunityId();
  if (!communityId) {
    await setCommunityId(MOCK_COMMUNITY_ID);
  }

  console.log("[Havena] Mock data active — fixtures served from app (no backend).");
  return true;
}
