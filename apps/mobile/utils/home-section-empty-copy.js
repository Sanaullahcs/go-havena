import { isCommunityAdminRole } from "../services/community-access";

/** i18n key for home section empty hint (`home.noEventsHint` vs `home.noEventsHintAdmin`). */
export function homeSectionEmptyHintKey(user, residentHintKey) {
  const admin = isCommunityAdminRole(user);
  return admin ? `home.${residentHintKey}Admin` : `home.${residentHintKey}`;
}
