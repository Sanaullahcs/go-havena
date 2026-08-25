import { cloneMockState, createInitialMockState } from "../../constants/mocks/fixtures";

let state = createInitialMockState();
let persona = "resident";

export function getMockState() {
  return state;
}

export function resetMockState(nextPersona = persona) {
  state = createInitialMockState();
  persona = nextPersona;
  state.persona = persona;
}

export function setMockPersona(next) {
  persona = next === "admin" ? "admin" : "resident";
  state.persona = persona;
}

export function getMockPersona() {
  return persona;
}

export function getMockMe() {
  return persona === "admin" ? state.users.admin : state.users.resident;
}

export function snapshotMockState() {
  return cloneMockState(state);
}

export function replaceMockState(next) {
  state = next;
  persona = next.persona ?? persona;
}
