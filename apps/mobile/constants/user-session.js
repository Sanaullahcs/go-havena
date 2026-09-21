/** In-memory session flags — wireframe only until API auth */

let firstHomeVisit = false;

export const markFirstHomeVisit = () => {
  firstHomeVisit = true;
};

export const consumeFirstHomeVisit = () => {
  if (!firstHomeVisit) return false;
  firstHomeVisit = false;
  return true;
};

export const peekFirstHomeVisit = () => firstHomeVisit;
