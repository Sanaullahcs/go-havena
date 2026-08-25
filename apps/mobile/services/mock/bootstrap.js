import { MOCK_DEMO_TOKEN } from "../../constants/api-config";
import { MOCK_COMMUNITY_ID } from "../../constants/mock-config";
import { bootstrapMockPersona } from "./handlers";
import { setCommunityId, setSession } from "../auth-session";

/** Start a fully populated demo session (no backend required). */
export async function enterMockDemo(persona = "resident") {
  const user = bootstrapMockPersona(persona);
  await setSession({ token: MOCK_DEMO_TOKEN, user });
  await setCommunityId(MOCK_COMMUNITY_ID);
  return user;
}

export { enterMockDemo as bootstrapMockSession };
